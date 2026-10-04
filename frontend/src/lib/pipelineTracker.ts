/**
 * Follows one payment through the real backend pipeline by re-reading the
 * actual records until they settle. It never advances on a timer of its own:
 * every snapshot is four real GETs, and "progress" is only ever what those
 * responses contain.
 *
 * Settled means one of:
 *   - the latest run has an attempt in a terminal status (success / failed /
 *     skipped), or
 *   - the audit trail holds `processing_stopped` (the backend's own record
 *     that the background task gave up), or
 * and if neither happens within `timeoutMs` it stops with timedOut = true —
 * "the backend hadn't finished", not a fabricated completion.
 */
import * as api from "./api";
import { buildRuns, hasPipelineStopped, type Run } from "./investigation";
import type { AIDecisionRead, AuditLogRead, PaymentRead, RecoveryAttemptRead } from "../types/api";

export const DEFAULT_POLL_INTERVAL_MS = 1000;
export const DEFAULT_TIMEOUT_MS = 90_000;

export interface PipelineSnapshot {
  payment: PaymentRead | null;
  decisions: AIDecisionRead[];
  attempts: RecoveryAttemptRead[];
  audit: AuditLogRead[];
  runs: Run[];
  settled: boolean;
  stopped: boolean;
  timedOut: boolean;
  /** set when the last round of reads failed; polling continues unless fatal */
  error: string | null;
  /** how many snapshots have been taken (1 = first read) */
  reads: number;
}

export interface TrackOptions {
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onSnapshot: (snapshot: PipelineSnapshot) => void;
  now?: () => number;
}

const TERMINAL_ATTEMPT = new Set(["success", "failed", "skipped"]);

export function isSettled(runs: Run[], audit: AuditLogRead[]): boolean {
  if (hasPipelineStopped(audit)) return true;
  const latest = runs[runs.length - 1];
  return !!latest?.attempt && TERMINAL_ATTEMPT.has(latest.attempt.status);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener("abort", done);
      clearTimeout(timer);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** Resolves with the final snapshot once settled, timed out, or aborted. */
export async function trackPipeline(paymentId: string, options: TrackOptions): Promise<PipelineSnapshot> {
  const { intervalMs = DEFAULT_POLL_INTERVAL_MS, timeoutMs = DEFAULT_TIMEOUT_MS, signal, onSnapshot } = options;
  const now = options.now ?? Date.now;
  const startedAt = now();

  let latest: PipelineSnapshot = {
    payment: null,
    decisions: [],
    attempts: [],
    audit: [],
    runs: [],
    settled: false,
    stopped: false,
    timedOut: false,
    error: null,
    reads: 0,
  };

  while (!signal?.aborted) {
    const [payment, decisions, attempts, audit] = await Promise.allSettled([
      api.getPayment(paymentId),
      api.listAIDecisions(paymentId),
      api.listRecoveryAttempts(paymentId),
      api.getPaymentAuditTimeline(paymentId),
    ]);
    if (signal?.aborted) break;

    // Keep whatever we last knew for a resource whose read failed this round,
    // and report the failure — a flaky poll must not blank the trace.
    const failure = [payment, decisions, attempts, audit].find((r) => r.status === "rejected") as
      | PromiseRejectedResult
      | undefined;
    const next = {
      payment: payment.status === "fulfilled" ? payment.value : latest.payment,
      decisions: decisions.status === "fulfilled" ? decisions.value : latest.decisions,
      attempts: attempts.status === "fulfilled" ? attempts.value : latest.attempts,
      audit: audit.status === "fulfilled" ? audit.value : latest.audit,
    };
    const runs = buildRuns(next.decisions, next.attempts);
    const stopped = hasPipelineStopped(next.audit);
    const settled = failure ? false : isSettled(runs, next.audit);
    const timedOut = !settled && now() - startedAt >= timeoutMs;

    latest = {
      ...next,
      runs,
      settled,
      stopped,
      timedOut,
      error: failure
        ? failure.reason instanceof api.ApiError
          ? failure.reason.message
          : "Could not reach the backend."
        : null,
      reads: latest.reads + 1,
    };
    onSnapshot(latest);

    if (settled || timedOut) break;
    await sleep(intervalMs, signal);
  }

  return latest;
}
