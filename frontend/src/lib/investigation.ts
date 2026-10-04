/**
 * Pure derivation for the Payment Detail screen. Everything here turns real
 * API responses into display state; nothing fetches, nothing invents.
 *
 * Where the API gives us structured fields we use them. Where it only gives
 * us text, this file says so explicitly:
 *
 *  - A payment link's URL exists only inside RecoveryAttempt.result_message
 *    ("Payment link created: https://…") — the backend does not persist the
 *    gateway's raw response. extractPaymentLink() reads it back out of that
 *    string, and only for successful link-creating actions.
 *  - Which notification vendor sent a message exists only in result_message
 *    ("Email sent to … via Brevo." / "SMS sent to … via Twilio.").
 *  - A policy verdict's violated_rules exist only in the audit entry
 *    "policy_decision_recorded" for that attempt's id.
 *
 * If a backend change ever stores these as structured fields, this is the
 * one file to simplify.
 */
import { humanizeCode, formatRatioPercent } from "./format";
import { statusEntry, type Tone } from "./status";
import type {
  AIDecisionRead,
  AuditLogRead,
  PaymentRead,
  RecoveryAttemptRead,
} from "../types/api";

// --- runs --------------------------------------------------------------

/**
 * One end-to-end pass through the pipeline for a payment: an AI decision
 * and, if the policy engine has evaluated it, the RecoveryAttempt that
 * resulted. A payment can have several (re-diagnosis, repeated recovery),
 * and the Decision Chain shows one at a time.
 */
export interface Run {
  id: string;
  /** 1-based, oldest first. */
  index: number;
  decision: AIDecisionRead | null;
  /** null while a decision exists but policy/execution hasn't happened. */
  attempt: RecoveryAttemptRead | null;
}

export function buildRuns(decisions: AIDecisionRead[], attempts: RecoveryAttemptRead[]): Run[] {
  const decisionsById = new Map(decisions.map((decision) => [decision.id, decision]));
  const referenced = new Set<string>();

  const draft: Omit<Run, "index">[] = [];
  for (const attempt of attempts) {
    const decision = attempt.ai_decision_id ? (decisionsById.get(attempt.ai_decision_id) ?? null) : null;
    if (decision) referenced.add(decision.id);
    draft.push({ id: attempt.id, decision, attempt });
  }
  // A decision no attempt points at is a diagnosis that policy/execution
  // hasn't acted on (yet): still a real run, with a pending policy gate.
  for (const decision of decisions) {
    if (!referenced.has(decision.id)) draft.push({ id: decision.id, decision, attempt: null });
  }

  const timeOf = (run: Omit<Run, "index">): number =>
    new Date(run.attempt?.created_at ?? run.decision?.created_at ?? 0).getTime();

  return draft
    .sort((a, b) => timeOf(a) - timeOf(b))
    .map((run, i) => ({ ...run, index: i + 1 }));
}

// --- AI decision -------------------------------------------------------

export const FALLBACK_MODEL_NAME = "fallback-deterministic";
const FALLBACK_RISK_FACTOR = "fallback_decision_used";

/**
 * True when the backend substituted its deterministic fallback for a model
 * answer (no failure context, provider error, schema-invalid output, or
 * confidence below threshold — see AIDecisionService). Checked by risk
 * factor as well as model name, because a schema-invalid or low-confidence
 * fallback keeps the real model's name.
 */
export function isFallbackDecision(decision: AIDecisionRead): boolean {
  return decision.model_name === FALLBACK_MODEL_NAME || (decision.risk_factors ?? []).includes(FALLBACK_RISK_FACTOR);
}

// --- recovery result parsing ------------------------------------------

export const LINK_ACTIONS = ["RETRY_PAYMENT", "SEND_PAYMENT_LINK"] as const;
export const NOTIFICATION_ACTIONS = ["SEND_NOTIFICATION", "ESCALATE_TO_MERCHANT"] as const;

// The mock gateway (app/integrations/payment_gateway_client/mock_client.py)
// returns links on this host; it does not resolve, so it is shown as text
// labelled "simulated" instead of as a clickable dead link.
const MOCK_LINK_HOST = "mock.razorpay.link";

export interface PaymentLink {
  url: string;
  host: string;
  simulated: boolean;
}

/**
 * The payment link a RETRY_PAYMENT / SEND_PAYMENT_LINK attempt created,
 * read back out of the gateway's own result message. Returns null unless
 * the attempt actually succeeded and the message contains an http(s) URL —
 * never a guess, never a constructed link.
 */
export function extractPaymentLink(attempt: RecoveryAttemptRead): PaymentLink | null {
  if (!(LINK_ACTIONS as readonly string[]).includes(attempt.action_type)) return null;
  if (attempt.status !== "success" || !attempt.result_message) return null;

  const match = attempt.result_message.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) return null;

  // Trailing sentence punctuation is not part of the URL.
  const candidate = match[0].replace(/[.,;:!?)\]]+$/, "");
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return { url: parsed.toString(), host: parsed.host, simulated: parsed.host === MOCK_LINK_HOST };
  } catch {
    return null;
  }
}

export type NotificationVendor = "Brevo" | "Twilio";

export interface NotificationResult {
  vendor: NotificationVendor | null;
  channel: "Email" | "SMS" | null;
  /** What the provider's identifier is called, so it's labelled truthfully. */
  referenceLabel: string;
  /** Who the message was addressed to — fixed by the action type. */
  audience: "Customer" | "Merchant";
}

/**
 * Vendor + channel for a notification action, read from the provider's own
 * result message ("… via Brevo." / "… via Twilio."). Mock-provider results
 * name neither, so vendor stays null and the reference gets a generic label
 * — the screen never claims a vendor the backend didn't report.
 */
export function describeNotification(attempt: RecoveryAttemptRead): NotificationResult | null {
  if (!(NOTIFICATION_ACTIONS as readonly string[]).includes(attempt.action_type)) return null;

  const audience = attempt.action_type === "ESCALATE_TO_MERCHANT" ? "Merchant" : "Customer";
  const vendorMatch = attempt.result_message?.match(/\bvia (Brevo|Twilio)\b/);
  const vendor = (vendorMatch?.[1] as NotificationVendor | undefined) ?? null;

  if (vendor === "Brevo") return { vendor, channel: "Email", referenceLabel: "Brevo message ID", audience };
  if (vendor === "Twilio") return { vendor, channel: "SMS", referenceLabel: "Twilio message SID", audience };
  return { vendor: null, channel: null, referenceLabel: "Provider reference", audience };
}

// --- policy ------------------------------------------------------------

/**
 * The rules a verdict cited. Returns null when the audit trail has no
 * policy entry for this attempt (unknown — don't claim "none"), and an
 * empty array when the engine recorded the verdict with no rule fired.
 */
export function extractViolatedRules(audit: AuditLogRead[] | null, attemptId: string): string[] | null {
  if (!audit) return null;
  const entry = audit.find((log) => log.entity_id === attemptId && log.action === "policy_decision_recorded");
  if (!entry) return null;

  const rules = entry.details?.["violated_rules"];
  if (!Array.isArray(rules)) return [];
  return rules.filter((rule): rule is string => typeof rule === "string");
}

/** True when policy replaced the AI's recommendation with a different action. */
export function policyOverrodeAI(run: Run): boolean {
  if (!run.decision?.recommended_action || !run.attempt) return false;
  return run.decision.recommended_action !== run.attempt.action_type;
}

// --- audit -------------------------------------------------------------

export function auditMessage(entry: AuditLogRead): string | null {
  const message = entry.details?.["message"];
  return typeof message === "string" ? message : null;
}

/** Every details key except `message`, stringified for compact display. */
export function auditExtras(entry: AuditLogRead): [string, string][] {
  if (!entry.details) return [];
  return Object.entries(entry.details)
    .filter(([key]) => key !== "message")
    .map(([key, value]): [string, string] => [key, stringifyDetail(value)]);
}

function stringifyDetail(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value === "" ? "—" : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value) && value.every((item) => typeof item === "string" || typeof item === "number")) {
    return value.length === 0 ? "none" : value.join(", ");
  }
  return JSON.stringify(value);
}

/** The backend's own explanation when the background pipeline stopped, if it logged one. */
export function pipelineStopMessage(audit: AuditLogRead[] | null): string | null {
  const entry = (audit ?? []).find((log) => log.action === "processing_stopped");
  return entry ? auditMessage(entry) : null;
}

// --- pipeline liveness -------------------------------------------------

// Webhook/simulate ingest runs diagnosis → policy → execution as a
// background task, so a payment opened right after it failed can genuinely
// be mid-pipeline. Beyond this window an empty step is "not run", not
// "still coming".
export const PIPELINE_WINDOW_MS = 2 * 60 * 1000;

export function hasPipelineStopped(audit: AuditLogRead[] | null): boolean {
  return (audit ?? []).some((log) => log.action === "processing_stopped");
}

/**
 * Is it plausible the background pipeline is still working on this
 * payment? True only when the payment is recent, the pipeline hasn't
 * logged a stop, and the latest run hasn't reached a terminal attempt
 * status. Used to decide whether to poll and whether an empty node reads
 * "Waiting" or "Not run".
 */
export function isPipelineInFlight(
  payment: PaymentRead,
  runs: Run[],
  audit: AuditLogRead[] | null,
  now: number = Date.now(),
): boolean {
  if (hasPipelineStopped(audit)) return false;
  if (now - new Date(payment.created_at).getTime() > PIPELINE_WINDOW_MS) return false;

  const latest = runs[runs.length - 1];
  if (!latest || !latest.attempt) return true;
  return latest.attempt.status === "pending" || latest.attempt.status === "in_progress";
}

// --- decision chain ----------------------------------------------------

export type ChainNodeKey = "failure" | "ai" | "policy" | "execution" | "outcome";

/**
 * What a node is, which fixes how it is drawn:
 *  observed      — a fact received from the gateway
 *  advisory      — AI output; never authoritative (dashed)
 *  authoritative — the deterministic policy verdict (solid, inverted label)
 *  executor      — deterministic code carrying out the approved action
 *  result        — where the payment stands now
 */
export type ChainNodeKind = "observed" | "advisory" | "authoritative" | "executor" | "result";

/**
 * How far along a node is, taken from real data:
 *  done     — the backend has recorded this step
 *  running  — the backend says it is in progress (or the pipeline plausibly is)
 *  waiting  — not yet recorded, but the pipeline is still in flight
 *  idle     — not recorded and the pipeline is not running: never happened
 *  stopped  — the pipeline logged `processing_stopped` before this step
 */
export type ChainPhase = "done" | "running" | "waiting" | "idle" | "stopped";

export interface ChainNode {
  key: ChainNodeKey;
  kind: ChainNodeKind;
  title: string;
  /** id of the page section holding this node's full detail */
  anchor: string;
  phase: ChainPhase;
  tone: Tone;
  stateLabel: string;
  headline: string;
  detail: string | null;
  timestamp: string | null;
}

export interface ChainInput {
  payment: PaymentRead;
  run: Run | null;
  audit: AuditLogRead[] | null;
  inFlight: boolean;
}

const actionLabel = (action: string | null | undefined): string => (action ? humanizeCode(action) : "—");

export function deriveChain({ payment, run, audit, inFlight }: ChainInput): ChainNode[] {
  const stopped = hasPipelineStopped(audit);
  const decision = run?.decision ?? null;
  const attempt = run?.attempt ?? null;

  // The first step with nothing recorded is where an in-flight pipeline is
  // currently working (or where a stopped one stopped); every later empty
  // step is merely waiting/idle behind it.
  let firstGapTaken = false;
  const emptyPhase = (): { phase: ChainPhase; stateLabel: string; tone: Tone } => {
    const isFirstGap = !firstGapTaken;
    firstGapTaken = true;
    if (stopped) {
      return isFirstGap
        ? { phase: "stopped", stateLabel: "Stopped", tone: "danger" }
        : { phase: "idle", stateLabel: "Not run", tone: "muted" };
    }
    if (inFlight) {
      return isFirstGap
        ? { phase: "running", stateLabel: "Running", tone: "info" }
        : { phase: "waiting", stateLabel: "Waiting", tone: "muted" };
    }
    return { phase: "idle", stateLabel: "Not run", tone: "muted" };
  };

  // --- failure (always recorded) ---
  const failure: ChainNode = {
    key: "failure",
    kind: "observed",
    title: "Payment failed",
    anchor: "failure-context",
    phase: "done",
    tone: "danger",
    stateLabel: "Failed",
    headline: payment.failure_code ? humanizeCode(payment.failure_code) : "Failure reason not reported",
    detail: payment.failure_message,
    timestamp: payment.created_at,
  };

  // --- AI diagnosis ---
  let ai: ChainNode;
  if (decision) {
    if (isFallbackDecision(decision)) {
      ai = {
        key: "ai",
        kind: "advisory",
        title: "AI diagnosis",
        anchor: "ai-decision",
        phase: "done",
        tone: "warning",
        stateLabel: "Fallback",
        headline: "Deterministic fallback used",
        detail: decision.reason,
        timestamp: decision.created_at,
      };
    } else {
      ai = {
        key: "ai",
        kind: "advisory",
        title: "AI diagnosis",
        anchor: "ai-decision",
        phase: "done",
        tone: "info",
        stateLabel: "Diagnosed",
        headline: `Recommends ${actionLabel(decision.recommended_action).toLowerCase()}`,
        detail: `${formatRatioPercent(decision.confidence)} confidence · ${formatRatioPercent(decision.recovery_probability)} recoverable`,
        timestamp: decision.created_at,
      };
    }
  } else {
    const empty = emptyPhase();
    ai = {
      key: "ai",
      kind: "advisory",
      title: "AI diagnosis",
      anchor: "ai-decision",
      ...empty,
      headline: gapHeadline(empty.phase, "Diagnosing…", "Waiting to start", "No diagnosis on record"),
      detail: null,
      timestamp: null,
    };
  }

  // --- policy gate ---
  let policy: ChainNode;
  if (attempt) {
    const verdict = attempt.policy_decision ? statusEntry(attempt.policy_decision) : null;
    const overrode = policyOverrodeAI(run as Run);
    policy = {
      key: "policy",
      kind: "authoritative",
      title: "Policy gate",
      anchor: "policy-gate",
      phase: "done",
      tone: verdict?.tone ?? "muted",
      stateLabel: verdict?.label ?? "Recorded",
      headline: `Final action: ${actionLabel(attempt.action_type).toLowerCase()}`,
      detail: overrode
        ? `Overrides AI: ${actionLabel(decision?.recommended_action).toLowerCase()}`
        : attempt.policy_decision === "APPROVE"
          ? "Approved as recommended"
          : null,
      timestamp: attempt.created_at,
    };
  } else {
    const empty = emptyPhase();
    policy = {
      key: "policy",
      kind: "authoritative",
      title: "Policy gate",
      anchor: "policy-gate",
      ...empty,
      headline: gapHeadline(empty.phase, "Evaluating…", "Awaiting verdict", "No verdict on record"),
      detail: null,
      timestamp: null,
    };
  }

  // --- execution ---
  let execution: ChainNode;
  if (attempt) {
    const status = statusEntry(attempt.status);
    const phase: ChainPhase =
      attempt.status === "in_progress" ? "running" : attempt.status === "pending" ? "waiting" : "done";
    execution = {
      key: "execution",
      kind: "executor",
      title: "Recovery action",
      anchor: "recovery",
      phase,
      tone: status.tone,
      stateLabel: status.label,
      headline: actionLabel(attempt.action_type),
      detail: attempt.error_message ?? attempt.result_message,
      timestamp: attempt.completed_at ?? attempt.started_at,
    };
  } else {
    const empty = emptyPhase();
    execution = {
      key: "execution",
      kind: "executor",
      title: "Recovery action",
      anchor: "recovery",
      ...empty,
      headline: gapHeadline(empty.phase, "Executing…", "Awaiting action", "No action taken"),
      detail: null,
      timestamp: null,
    };
  }

  // --- outcome: the payment's CURRENT status, not this run's result ---
  const outcomeStatus = statusEntry(payment.status);
  const outcome: ChainNode = {
    key: "outcome",
    kind: "result",
    title: "Current status",
    anchor: "audit",
    phase: "done",
    tone: outcomeStatus.tone,
    stateLabel: outcomeStatus.label,
    headline: outcomeStatus.label,
    detail: null,
    timestamp: payment.updated_at,
  };

  return [failure, ai, policy, execution, outcome];
}

function gapHeadline(phase: ChainPhase, running: string, waiting: string, idle: string): string {
  if (phase === "running") return running;
  if (phase === "waiting") return waiting;
  if (phase === "stopped") return "Pipeline stopped";
  return idle;
}

/** Milliseconds between two ISO timestamps, or null if either is missing/invalid or order is reversed. */
export function elapsedBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const diff = new Date(to).getTime() - new Date(from).getTime();
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
}
