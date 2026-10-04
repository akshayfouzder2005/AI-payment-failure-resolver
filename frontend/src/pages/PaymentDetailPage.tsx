import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as api from "../lib/api";
import {
  buildRuns,
  deriveChain,
  extractViolatedRules,
  isPipelineInFlight,
  pipelineStopMessage,
  type Run,
} from "../lib/investigation";
import type { AIDecisionRead, AuditLogRead, PaymentRead, RecoveryAttemptRead } from "../types/api";
import { ErrorState } from "../components/ui/ErrorState";
import { Skeleton } from "../components/ui/Skeleton";
import { DashboardRow } from "../components/overview/DashboardRow";
import { PaymentHeader } from "../components/payment/PaymentHeader";
import { FinancialSummary } from "../components/payment/FinancialSummary";
import { FailureContext } from "../components/payment/FailureContext";
import { DecisionChain } from "../components/payment/DecisionChain";
import { AIDecisionPanel } from "../components/payment/AIDecisionPanel";
import { PolicyGatePanel } from "../components/payment/PolicyGatePanel";
import { RecoveryPanel } from "../components/payment/RecoveryPanel";
import { AuditTimeline } from "../components/payment/AuditTimeline";
import { DetailSection } from "../components/payment/DetailSection";

// While the background pipeline is plausibly still working on a fresh
// payment, re-read the records this often so the chain fills in on screen.
const POLL_INTERVAL_MS = 3000;

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

interface Loaded {
  payment: PaymentRead;
  decisions: Result<AIDecisionRead[]>;
  attempts: Result<RecoveryAttemptRead[]>;
  audit: Result<AuditLogRead[]>;
}

type PageState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error"; message: string }
  | { status: "ready"; loaded: Loaded };

function settle<T>(outcome: PromiseSettledResult<T>, what: string): Result<T> {
  if (outcome.status === "fulfilled") return { ok: true, data: outcome.value };
  const reason = outcome.reason;
  return { ok: false, message: reason instanceof api.ApiError ? reason.message : `Could not load ${what}.` };
}

/**
 * /app/payments/:paymentId — the investigation screen. Four independent
 * reads (payment, AI decisions, recovery attempts, audit trail): the payment
 * is required, the other three degrade independently so one failing read
 * never blanks the page. Everything below the header is derived from those
 * responses by lib/investigation.ts; nothing is fabricated here.
 */
export function PaymentDetailPage() {
  const { paymentId = "" } = useParams();
  // Keyed by id so navigating between two payments mounts fresh state
  // (loading, no stale run selection) instead of resetting it by effect.
  return <PaymentDetail key={paymentId} paymentId={paymentId} />;
}

function PaymentDetail({ paymentId }: { paymentId: string }) {
  const [state, setState] = useState<PageState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [pickedRunId, setPickedRunId] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(
    async (silent: boolean) => {
      const seq = ++requestSeq.current;
      if (!silent) setRefreshing(true);

      const [payment, decisions, attempts, audit] = await Promise.allSettled([
        api.getPayment(paymentId),
        api.listAIDecisions(paymentId),
        api.listRecoveryAttempts(paymentId),
        api.getPaymentAuditTimeline(paymentId),
      ]);
      if (seq !== requestSeq.current) return; // a newer load superseded this one

      setRefreshing(false);

      if (payment.status === "rejected") {
        const reason = payment.reason;
        if (reason instanceof api.ApiError && reason.status === 404) {
          setState({ status: "not-found" });
        } else {
          const message = reason instanceof api.ApiError ? reason.message : "Could not load this payment.";
          // A failed background poll must not tear down a page that is
          // already showing real data — but a failed FIRST load has nothing
          // to preserve and must surface the error, not sit on a skeleton.
          setState((previous) => (silent && previous.status === "ready" ? previous : { status: "error", message }));
        }
        return;
      }

      setState({
        status: "ready",
        loaded: {
          payment: payment.value,
          decisions: settle(decisions, "AI decisions"),
          attempts: settle(attempts, "recovery attempts"),
          audit: settle(audit, "the audit trail"),
        },
      });
    },
    [paymentId],
  );

  // Initial fetch on mount: synchronizing with an external system (the API),
  // which is what an effect is for. The setState calls happen after awaits
  // inside load(), not synchronously in the effect body.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void load(true);
  }, [load]);

  const loaded = state.status === "ready" ? state.loaded : null;
  const runs: Run[] = loaded && loaded.decisions.ok && loaded.attempts.ok ? buildRuns(loaded.decisions.data, loaded.attempts.data) : [];
  const auditData = loaded?.audit.ok ? loaded.audit.data : null;
  const inFlight = loaded ? isPipelineInFlight(loaded.payment, runs, auditData) : false;

  // Re-read on an interval only while the pipeline is plausibly mid-flight;
  // the effect re-evaluates after every load, so polling stops by itself
  // once the latest run reaches a terminal state or the window passes.
  useEffect(() => {
    if (!inFlight) return;
    const timer = setTimeout(() => void load(true), POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [inFlight, loaded, load]);

  if (state.status === "loading") return <DetailSkeleton />;

  if (state.status === "not-found") {
    return (
      <div>
        <h1 className="text-heading">Payment not found</h1>
        <p className="mt-2 max-w-md text-sm text-text-muted">
          No payment with this ID exists in your workspace.
        </p>
        <Link to="/app/payments" className="focus-ring mt-4 inline-block rounded text-sm text-accent underline underline-offset-4">
          Back to payments
        </Link>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div>
        <h1 className="mb-8 text-heading">Payment</h1>
        <ErrorState message={state.message} onRetry={() => void load(false)} />
      </div>
    );
  }

  const { payment, decisions, attempts, audit } = state.loaded;
  const selectedRun = runs.find((run) => run.id === pickedRunId) ?? runs[runs.length - 1] ?? null;
  const nodes = deriveChain({ payment, run: selectedRun, audit: auditData, inFlight });
  const nodeByKey = Object.fromEntries(nodes.map((node) => [node.key, node])) as Record<string, (typeof nodes)[number]>;
  const stopMessage = pipelineStopMessage(auditData);
  const runsError = !decisions.ok ? decisions.message : !attempts.ok ? attempts.message : null;
  const violatedRules = selectedRun?.attempt ? extractViolatedRules(auditData, selectedRun.attempt.id) : null;

  return (
    <div>
      <PaymentHeader payment={payment} refreshing={refreshing} onRefresh={() => void load(false)} />

      <div className="space-y-8">
        <DashboardRow
          main={<FinancialSummary payment={payment} />}
          rail={
            <FailureContext
              payment={payment}
              diagnosisCount={decisions.ok ? decisions.data.length : null}
              attemptCount={attempts.ok ? attempts.data.length : null}
            />
          }
        />

        {runsError ? (
          <DetailSection id="decision-chain" title="Decision Chain">
            <ErrorState message={`Could not load the decision trail: ${runsError}`} onRetry={() => void load(false)} />
          </DetailSection>
        ) : (
          <>
            <DecisionChain
              nodes={nodes}
              runs={runs}
              selectedRunId={selectedRun?.id ?? null}
              onSelectRun={setPickedRunId}
              live={inFlight}
            />
            <AIDecisionPanel decision={selectedRun?.decision ?? null} node={nodeByKey.ai} stopMessage={stopMessage} />
            <PolicyGatePanel
              run={selectedRun}
              node={nodeByKey.policy}
              violatedRules={violatedRules}
              stopMessage={stopMessage}
            />
            <RecoveryPanel run={selectedRun} node={nodeByKey.execution} stopMessage={stopMessage} />
          </>
        )}

        {audit.ok ? (
          <AuditTimeline entries={audit.data} paymentId={payment.id} />
        ) : (
          <DetailSection id="audit" title="Audit trail">
            <ErrorState message={`Could not load the audit trail: ${audit.message}`} onRetry={() => void load(false)} />
          </DetailSection>
        )}
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading payment" className="space-y-10">
      <div className="space-y-4">
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-3 w-80" />
      </div>
      <div className="grid grid-cols-1 gap-8 border-t border-border pt-8 xl:grid-cols-12">
        <Skeleton className="h-64 w-full xl:col-span-8" />
        <Skeleton className="h-64 w-full xl:col-span-4" />
      </div>
      <div className="border-t border-border pt-8">
        <Skeleton className="mb-6 h-3 w-40" />
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
