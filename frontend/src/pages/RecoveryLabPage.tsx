import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { DEFAULT_POLL_INTERVAL_MS, trackPipeline, type PipelineSnapshot } from "../lib/pipelineTracker";
import {
  DEFAULT_FORM,
  DEMO_SCENARIOS,
  buildDemoRequest,
  buildRequest,
  newRunId,
  validateForm,
  type FormErrors,
  type ScenarioForm,
} from "../lib/simulation";
import { deriveTrace, summarizeOutcome } from "../lib/trace";
import { deriveNotification } from "../lib/notification";
import { notificationMode, validateRecipientEmail } from "../lib/recipient";
import { formatElapsedMs } from "../lib/format";
import type { HealthResponse, MetricsSummary, PaymentRead, WebhookIngestResult } from "../types/api";
import { PageHeader } from "../components/ui/PageHeader";
import { ScenarioBuilder } from "../components/lab/ScenarioBuilder";
import { DemoWorkspace, type DemoItem } from "../components/lab/DemoWorkspace";
import { TraceWaterfall } from "../components/lab/TraceWaterfall";
import { EventStream } from "../components/lab/EventStream";
import { ImpactPanel } from "../components/lab/ImpactPanel";
import { CustomerNotification } from "../components/lab/CustomerNotification";

type Phase = "idle" | "simulating" | "tracking" | "finished" | "timed-out" | "error";

/**
 * /app/recovery-lab — a scenario builder wired to the real
 * POST /simulate/failed-payment, and a live execution trace that follows
 * the resulting payment by re-reading the backend until it settles.
 *
 * Nothing on this page advances by itself: every stage, bar, count and
 * status is rendered from the latest real responses (lib/trace.ts). If the
 * backend never finishes, the trace says it timed out; if a call fails, the
 * backend's error message is shown.
 */
export function RecoveryLabPage({ pollIntervalMs = DEFAULT_POLL_INTERVAL_MS }: { pollIntervalMs?: number }) {
  const { user } = useAuth();
  const merchantId = user?.merchant_id ?? null;

  const [form, setForm] = useState<ScenarioForm>(DEFAULT_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [health, setHealth] = useState<HealthResponse | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [ingest, setIngest] = useState<WebhookIngestResult | null>(null);
  const [snapshot, setSnapshot] = useState<PipelineSnapshot | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);

  const [demoRecipient, setDemoRecipient] = useState("");
  const [demo, setDemo] = useState<DemoItem[] | null>(null);
  const [demoRunning, setDemoRunning] = useState(false);

  const [before, setBefore] = useState<MetricsSummary | null>(null);
  const [after, setAfter] = useState<MetricsSummary | null>(null);
  const [created, setCreated] = useState<PaymentRead[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [hasImpact, setHasImpact] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const createdIds = useRef<string[]>([]);

  // A wall clock for the elapsed counter only. Ticking it from an effect (not
  // reading Date.now() during render) keeps render pure; it measures real
  // time elapsed and drives nothing else on the page.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    api
      .getHealth()
      .then((result) => !cancelled && setHealth(result))
      .catch(() => undefined); // the provider notice is best-effort
    return () => {
      cancelled = true;
      abortRef.current?.abort(); // leaving the page stops polling
    };
  }, []);

  const mode = notificationMode(health);
  // Real delivery on → the address must be able to receive mail. Blank demo
  // recipient is fine either way (it falls back to safe @example.com).
  const demoRecipientError =
    demoRecipient.trim() === "" ? null : validateRecipientEmail(demoRecipient, { deliverable: mode.live });
  const busy = phase === "simulating" || phase === "tracking" || demoRunning;
  const live = phase === "simulating" || phase === "tracking";

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [live]);

  /** Re-reads metrics and the payments list, then keeps only payments this session created. */
  const refreshImpact = useCallback(async () => {
    setRefreshing(true);
    const [metrics, payments] = await Promise.allSettled([
      api.getMetricsSummary(),
      api.listPayments({ limit: 100 }),
    ]);
    if (metrics.status === "fulfilled") setAfter(metrics.value);
    if (payments.status === "fulfilled") {
      const ids = new Set(createdIds.current);
      setCreated(payments.value.filter((payment) => ids.has(payment.id)));
    }
    setHasImpact(true);
    setRefreshing(false);
  }, []);

  const readBaseline = useCallback(async () => {
    try {
      setBefore(await api.getMetricsSummary());
    } catch {
      setBefore(null);
    }
    setAfter(null);
    setCreated([]);
    setHasImpact(false);
    createdIds.current = [];
  }, []);

  /** Sends one simulated failure and follows it to a settled state; returns the final snapshot. */
  const runOne = useCallback(
    async (request: ReturnType<typeof buildRequest>, signal: AbortSignal): Promise<PipelineSnapshot | null> => {
      setError(null);
      setIngest(null);
      setSnapshot(null);
      setFinishedAt(null);
      setStartedAt(Date.now());
      setPhase("simulating");

      const result = await api.simulateFailedPayment(request);
      if (signal.aborted) return null;
      setIngest(result);

      if (result.status !== "processed" || !result.payment_id) {
        setPhase("finished");
        setFinishedAt(Date.now());
        return null;
      }

      createdIds.current.push(result.payment_id);
      setPhase("tracking");
      const final = await trackPipeline(result.payment_id, {
        intervalMs: pollIntervalMs,
        signal,
        onSnapshot: setSnapshot,
      });
      if (signal.aborted) return null;
      setPhase(final.timedOut ? "timed-out" : "finished");
      setFinishedAt(Date.now());
      return final;
    },
    [pollIntervalMs],
  );

  async function runSingle() {
    const nextErrors = validateForm(form, { deliverableEmail: mode.live });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    await readBaseline();
    try {
      await runOne(buildRequest(form, merchantId), controller.signal);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof api.ApiError ? err.message : "Could not reach the backend.");
      setPhase("error");
      return;
    }
    if (!controller.signal.aborted) await refreshImpact();
  }

  async function runDemo() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    const runId = newRunId();
    const items: DemoItem[] = DEMO_SCENARIOS.map((scenario) => ({
      scenario,
      status: "queued",
      paymentId: null,
      outcome: null,
      error: null,
    }));
    const update = (index: number, patch: Partial<DemoItem>) => {
      items[index] = { ...items[index], ...patch };
      setDemo([...items]);
    };

    setDemo([...items]);
    setDemoRunning(true);
    await readBaseline();

    for (let i = 0; i < items.length; i++) {
      if (signal.aborted) break;
      update(i, { status: "simulating" });
      try {
        const request = buildDemoRequest(items[i].scenario, merchantId, runId, demoRecipient.trim() || null);
        // runOne drives the main trace, so the viewer watches each scenario flow through live.
        const pending = runOne(request, signal);
        // Mirror the phase into the row: the ingest result carries the payment id as soon as it exists.
        const final = await pending;
        if (signal.aborted) break;
        const paymentId = final?.payment?.id ?? createdIds.current[createdIds.current.length - 1] ?? null;
        if (!final) {
          update(i, { status: "failed", paymentId: null, error: "Event was not processed." });
        } else if (final.timedOut) {
          update(i, { status: "failed", paymentId, error: "Timed out waiting for the pipeline." });
          break;
        } else {
          update(i, { status: "done", paymentId, outcome: summarizeOutcome(final) });
        }
      } catch (err) {
        if (signal.aborted) break;
        update(i, { status: "failed", error: err instanceof api.ApiError ? err.message : "Could not reach the backend." });
        break; // a backend failure would repeat for every remaining scenario
      }
    }

    // Anything not reached is stopped, not silently queued forever.
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === "queued" || items[i].status === "simulating" || items[i].status === "tracking") {
        update(i, { status: "stopped" });
      }
    }
    setDemoRunning(false);
    setPhase((current) => (current === "simulating" || current === "tracking" ? "idle" : current));
    await refreshImpact();
  }

  function stopDemo() {
    abortRef.current?.abort();
  }

  const trace = deriveTrace(ingest, snapshot);
  const elapsed = startedAt !== null ? Math.max((finishedAt ?? now) - startedAt, 0) : null;
  const paymentId = snapshot?.payment?.id ?? ingest?.payment_id ?? null;

  return (
    <div>
      <PageHeader
        title="Recovery Lab"
        description="Build a failed payment, send it through the real pipeline, and watch each step happen."
      />

      <div className="grid grid-cols-1 gap-x-10 gap-y-10 xl:grid-cols-12">
        <div className="min-w-0 space-y-8 xl:col-span-5">
          <ScenarioBuilder
            form={form}
            errors={errors}
            busy={busy}
            merchantId={merchantId}
            health={health}
            onChange={setForm}
            onSubmit={() => void runSingle()}
          />
          <DemoWorkspace
            items={demo}
            running={demoRunning}
            disabled={busy}
            recipient={demoRecipient}
            recipientError={demoRecipientError}
            notificationsLive={mode.live}
            onRecipientChange={setDemoRecipient}
            onRun={() => void runDemo()}
            onStop={stopDemo}
          />
        </div>

        <div className="min-w-0 space-y-8 border-border xl:col-span-7 xl:border-l xl:pl-10">
          <section aria-labelledby="trace-title">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="trace-title" className="text-subhead text-text">
                Live execution trace
              </h2>
              <p role="status" className="text-body-small tabular-nums text-text-muted">
                {statusLine(phase, snapshot, elapsed)}
              </p>
            </div>

            {phase === "error" && error && (
              <p role="alert" className="mb-4 rounded border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-text">
                {error}
              </p>
            )}
            {phase === "timed-out" && (
              <p role="alert" className="mb-4 rounded border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-text">
                The backend hadn't finished after {formatElapsedMs(elapsed ?? 0)}. The pipeline may still be running —
                open the payment to keep watching.
              </p>
            )}
            {snapshot?.error && live && (
              <p className="mb-4 text-body-small text-warning">Last poll failed: {snapshot.error}. Retrying…</p>
            )}

            <TraceWaterfall trace={trace} />

            {paymentId && (
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-body-small">
                <Link
                  to={`/app/payments/${paymentId}`}
                  className="focus-ring rounded font-medium text-accent underline decoration-border-strong underline-offset-4 hover:decoration-accent"
                >
                  Open payment
                </Link>
                <Link
                  to={`/app/audit?payment=${paymentId}`}
                  className="focus-ring rounded text-text-muted underline decoration-border-strong underline-offset-4 hover:text-text"
                >
                  Open audit trace
                </Link>
              </div>
            )}
          </section>

          <CustomerNotification state={deriveNotification(snapshot)} />

          <section aria-labelledby="stream-title">
            <h2 id="stream-title" className="mb-3 text-subhead text-text">
              Audit event stream
            </h2>
            <EventStream entries={snapshot?.audit ?? []} live={live} />
          </section>

          {hasImpact && <ImpactPanel before={before} after={after} created={created} refreshing={refreshing} />}
        </div>
      </div>
    </div>
  );
}

function statusLine(phase: Phase, snapshot: PipelineSnapshot | null, elapsed: number | null): string {
  switch (phase) {
    case "idle":
      return "Idle — run a scenario to start a trace.";
    case "simulating":
      return "Sending event to /simulate/failed-payment…";
    case "tracking":
      return `Tracking the backend · read ${snapshot?.reads ?? 0}${elapsed !== null ? ` · ${formatElapsedMs(elapsed)}` : ""}`;
    case "finished":
      return `Settled${elapsed !== null ? ` in ${formatElapsedMs(elapsed)}` : ""}`;
    case "timed-out":
      return "Timed out waiting for the backend";
    case "error":
      return "Failed";
  }
}
