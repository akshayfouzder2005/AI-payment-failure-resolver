/**
 * The Recovery Lab's seven-stage observability trace:
 *   Event → Payment → AI → Policy → Recovery → Result → Audit
 *
 * Each stage is derived from records the backend actually returned. The
 * three middle stages reuse the same deriveChain() the Payment Detail screen
 * draws, so the Lab and the detail page can never disagree about what a
 * step's state is. A stage with no record is waiting / not run / stopped —
 * never complete — and a bar on the waterfall exists only where the backend
 * recorded real start and end timestamps for it.
 */
import { formatCurrencyExact, humanizeCode } from "./format";
import { deriveChain, type ChainPhase, type ChainNode } from "./investigation";
import type { PipelineSnapshot } from "./pipelineTracker";
import { statusEntry, type Tone } from "./status";
import type { AuditLogRead, WebhookIngestResult } from "../types/api";

export type TraceStageKey = "event" | "payment" | "ai" | "policy" | "recovery" | "result" | "audit";

export interface TraceBar {
  startMs: number;
  endMs: number;
}

export interface TraceStage {
  key: TraceStageKey;
  /** advisory = the AI stage; drawn lighter so it never reads as a decision */
  kind?: "advisory";
  title: string;
  phase: ChainPhase;
  tone: Tone;
  stateLabel: string;
  headline: string;
  detail: string | null;
  bar: TraceBar | null;
}

export interface Trace {
  stages: TraceStage[];
  /** the real time window the waterfall is scaled to; null until anything is timed */
  window: { startMs: number; endMs: number } | null;
}

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const value = new Date(iso).getTime();
  return Number.isFinite(value) ? value : null;
};

const auditTime = (audit: AuditLogRead[], action: string): number | null => {
  const entry = audit.find((log) => log.action === action);
  return entry ? ms(entry.created_at) : null;
};

function bar(start: number | null, end: number | null): TraceBar | null {
  if (start === null) return null;
  return { startMs: start, endMs: Math.max(end ?? start, start) };
}

export function deriveTrace(ingest: WebhookIngestResult | null, snapshot: PipelineSnapshot | null): Trace {
  const payment = snapshot?.payment ?? null;
  const audit = snapshot?.audit ?? [];
  const settled = snapshot?.settled ?? false;
  const stopped = snapshot?.stopped ?? false;
  const run = snapshot && snapshot.runs.length > 0 ? snapshot.runs[snapshot.runs.length - 1] : null;
  const inFlight = !!snapshot && !settled && !stopped && !snapshot.timedOut;

  // --- event ---
  let event: TraceStage;
  if (!ingest) {
    event = { key: "event", title: "Event", phase: "idle", tone: "muted", stateLabel: "Not sent", headline: "No event yet", detail: null, bar: null };
  } else if (ingest.status === "processed") {
    const t = auditTime(audit, "webhook_received") ?? ms(payment?.created_at);
    event = {
      key: "event",
      title: "Event",
      phase: "done",
      tone: "success",
      stateLabel: "Ingested",
      headline: `payment.failed · ${ingest.payment_event_id.slice(0, 8)}`,
      detail: ingest.detail,
      bar: bar(t, t),
    };
  } else {
    const failed = ingest.status === "processing_failed";
    event = {
      key: "event",
      title: "Event",
      phase: "done",
      tone: failed ? "danger" : "warning",
      stateLabel: statusEntry(ingest.status).label,
      headline: `Event ${ingest.payment_event_id.slice(0, 8)} was not processed`,
      detail: ingest.detail,
      bar: null,
    };
  }
  const ingestOk = ingest?.status === "processed";

  // --- payment ---
  let paymentStage: TraceStage;
  if (payment) {
    const created = ms(payment.created_at);
    paymentStage = {
      key: "payment",
      title: "Payment",
      phase: "done",
      tone: "success",
      stateLabel: "Persisted",
      headline: `${formatCurrencyExact(payment.amount, payment.currency)} · ${payment.gateway_payment_id}`,
      detail: payment.failure_message,
      bar: bar(created, auditTime(audit, "payment_failed_recorded") ?? created),
    };
  } else {
    paymentStage = {
      key: "payment",
      title: "Payment",
      phase: ingestOk ? "running" : "idle",
      tone: ingestOk ? "info" : "muted",
      stateLabel: ingestOk ? "Reading" : "Not created",
      headline: ingestOk ? "Reading payment record…" : "No payment record",
      detail: null,
      bar: null,
    };
  }

  // --- ai / policy / recovery come from the shared chain derivation ---
  let ai: TraceStage, policy: TraceStage, recovery: TraceStage;
  if (payment && ingestOk) {
    const chain = deriveChain({ payment, run, audit, inFlight });
    const [, aiNode, policyNode, execNode] = chain;
    const decision = run?.decision ?? null;
    const attempt = run?.attempt ?? null;

    ai = { ...fromNode("ai", "AI", aiNode, bar(auditTime(audit, "ai_analysis_started") ?? ms(payment.created_at), ms(decision?.created_at))), kind: "advisory" };
    policy = fromNode("policy", "Policy", policyNode, bar(ms(decision?.created_at), ms(attempt?.created_at)));
    recovery = fromNode(
      "recovery",
      "Recovery",
      execNode,
      attempt ? bar(ms(attempt.started_at) ?? ms(attempt.created_at), ms(attempt.completed_at)) : null,
    );
  } else {
    const idle = (key: TraceStageKey, title: string): TraceStage => ({
      key, title, phase: "idle", tone: "muted", stateLabel: "Not run", headline: "Not reached", detail: null, bar: null,
    });
    ai = idle("ai", "AI");
    policy = idle("policy", "Policy");
    recovery = idle("recovery", "Recovery");
  }

  // --- result: the payment's status once the pipeline has settled ---
  let result: TraceStage;
  if (payment && (settled || stopped)) {
    const status = statusEntry(payment.status);
    result = {
      key: "result",
      title: "Result",
      phase: "done",
      tone: status.tone,
      stateLabel: status.label,
      headline: `Payment is ${status.label.toLowerCase()}`,
      detail: stopped ? "The pipeline stopped before completing — see the audit trail." : null,
      bar: bar(ms(payment.updated_at), ms(payment.updated_at)),
    };
  } else if (payment && inFlight) {
    result = { key: "result", title: "Result", phase: "waiting", tone: "muted", stateLabel: "Waiting", headline: "Awaiting recovery outcome", detail: null, bar: null };
  } else {
    result = { key: "result", title: "Result", phase: "idle", tone: "muted", stateLabel: payment ? "Unresolved" : "Not run", headline: payment ? "Pipeline did not finish" : "No result", detail: null, bar: null };
  }

  // --- audit: how many real events exist right now ---
  const count = audit.length;
  const auditStage: TraceStage = {
    key: "audit",
    title: "Audit",
    phase: count === 0 ? (inFlight ? "waiting" : "idle") : settled || stopped ? "done" : "running",
    tone: count === 0 ? "muted" : settled || stopped ? "success" : "info",
    stateLabel: count === 0 ? "Empty" : settled || stopped ? "Recorded" : "Streaming",
    headline: `${count} ${count === 1 ? "event" : "events"} recorded`,
    detail: null,
    bar: count > 0 ? bar(ms(audit[0].created_at), ms(audit[audit.length - 1].created_at)) : null,
  };

  const stages = [event, paymentStage, ai, policy, recovery, result, auditStage];

  const starts = stages.flatMap((s) => (s.bar ? [s.bar.startMs] : []));
  const ends = stages.flatMap((s) => (s.bar ? [s.bar.endMs] : []));
  const window = starts.length > 0 ? { startMs: Math.min(...starts), endMs: Math.max(...ends) } : null;

  return { stages, window };
}

function fromNode(key: TraceStageKey, title: string, node: ChainNode, barValue: TraceBar | null): TraceStage {
  return {
    key,
    title,
    phase: node.phase,
    tone: node.tone,
    stateLabel: node.stateLabel,
    headline: node.headline,
    detail: node.detail,
    bar: node.phase === "done" || node.phase === "running" ? barValue : null,
  };
}

/** Position of a bar inside the window as percentages, with a minimum visible width. */
export function barGeometry(
  barValue: TraceBar,
  window: { startMs: number; endMs: number },
): { left: number; width: number } {
  const span = Math.max(window.endMs - window.startMs, 1);
  const left = ((barValue.startMs - window.startMs) / span) * 100;
  const width = Math.max(((barValue.endMs - barValue.startMs) / span) * 100, 1.2);
  return { left: Math.min(left, 100 - width), width };
}

export interface OutcomeSummary {
  verdict: string | null;
  action: string | null;
  status: string | null;
  stopped: boolean;
}

/** One-line result of a settled run, for the demo workspace's per-scenario rows. */
export function summarizeOutcome(snapshot: PipelineSnapshot): OutcomeSummary {
  const run = snapshot.runs[snapshot.runs.length - 1] ?? null;
  const attempt = run?.attempt ?? null;
  return {
    verdict: attempt?.policy_decision ? statusEntry(attempt.policy_decision).label : null,
    action: attempt ? humanizeCode(attempt.action_type).toLowerCase() : null,
    status: snapshot.payment ? statusEntry(snapshot.payment.status).label : null,
    stopped: snapshot.stopped,
  };
}
