/**
 * Pure helpers for the forensic Audit view: classifying events into pipeline
 * phases, assigning actor lanes, filtering, summarising, and exporting.
 * Actions and actors are shown exactly as recorded; the phase is a label
 * derived from KNOWN action names so the trace can be read at a glance —
 * unknown actions are labelled "Other", never guessed into a phase.
 */
import type { AuditLogRead } from "../types/api";

export type AuditPhase = "Ingest" | "AI" | "Policy" | "Recovery" | "Result" | "Other";

const PHASE_BY_ACTION: Record<string, AuditPhase> = {
  webhook_received: "Ingest",
  payment_failed_recorded: "Ingest",
  ai_analysis_started: "AI",
  ai_decision_created: "AI",
  ai_decision_fallback_used: "AI",
  policy_decision_recorded: "Policy",
  action_approved: "Policy",
  action_rejected: "Policy",
  recovery_execution_started: "Recovery",
  recovery_action_executed: "Recovery",
  recovery_execution_skipped_duplicate: "Recovery",
  action_executed: "Recovery",
  action_failed: "Recovery",
  payment_status_updated: "Result",
  payment_recovered: "Result",
  escalation_created: "Result",
  processing_stopped: "Other",
};

export function classifyPhase(action: string): AuditPhase {
  return PHASE_BY_ACTION[action] ?? "Other";
}

/** Lane order follows the pipeline; any actor not listed is appended in first-seen order. */
const KNOWN_ACTOR_ORDER = ["system", "ai_engine", "policy_engine", "executor"];

export function laneOrder(entries: AuditLogRead[]): string[] {
  const seen = new Set(entries.map((entry) => entry.actor));
  const known = KNOWN_ACTOR_ORDER.filter((actor) => seen.has(actor));
  const extra = [...seen].filter((actor) => !KNOWN_ACTOR_ORDER.includes(actor));
  return [...known, ...extra];
}

export interface AuditFilters {
  actors: Set<string>; // empty = all
  query: string;
}

export function filterEntries(entries: AuditLogRead[], filters: AuditFilters): AuditLogRead[] {
  const query = filters.query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filters.actors.size > 0 && !filters.actors.has(entry.actor)) return false;
    if (query === "") return true;
    const haystack = [
      entry.action,
      entry.actor,
      entry.entity_type,
      entry.entity_id,
      JSON.stringify(entry.details ?? {}),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

export interface AuditSummary {
  count: number;
  startedAt: string | null;
  endedAt: string | null;
  spanMs: number | null;
  actorCounts: { actor: string; count: number }[];
}

export function summarize(entries: AuditLogRead[]): AuditSummary {
  if (entries.length === 0) {
    return { count: 0, startedAt: null, endedAt: null, spanMs: null, actorCounts: [] };
  }
  const times = entries.map((entry) => new Date(entry.created_at).getTime()).filter(Number.isFinite);
  const first = Math.min(...times);
  const last = Math.max(...times);
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.actor, (counts.get(entry.actor) ?? 0) + 1);

  return {
    count: entries.length,
    startedAt: new Date(first).toISOString(),
    endedAt: new Date(last).toISOString(),
    spanMs: times.length > 0 ? last - first : null,
    actorCounts: laneOrder(entries).map((actor) => ({ actor, count: counts.get(actor) ?? 0 })),
  };
}

/** Milliseconds from the trace's first event — the "T+1.234s" offset. */
export function offsetFromStart(entry: AuditLogRead, startedAt: string | null): number | null {
  if (!startedAt) return null;
  const diff = new Date(entry.created_at).getTime() - new Date(startedAt).getTime();
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
}

/** "14:32:09.412" — millisecond precision for ordering events that land in the same second. */
export function formatTimeMs(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/** Offset as a trace-style label: "T+0ms", "T+412ms", "T+1.204s", "T+2m 5s". */
export function formatOffset(ms: number): string {
  if (ms < 1000) return `T+${Math.round(ms)}ms`;
  if (ms < 60_000) return `T+${(ms / 1000).toFixed(3)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `T+${minutes}m ${seconds}s`;
}

/** Calendar day key used to insert a date divider when a trace crosses midnight. */
export function dayKey(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function exportJson(paymentId: string, entries: AuditLogRead[]): string {
  return JSON.stringify({ payment_id: paymentId, event_count: entries.length, events: entries }, null, 2);
}

/** Dot colour per actor lane — the same identities as ActorBadge. */
export function laneDotClass(actor: string): string {
  switch (actor) {
    case "ai_engine":
      return "bg-info";
    case "policy_engine":
      return "bg-text";
    case "executor":
      return "bg-success";
    case "system":
      return "bg-text-faint";
    default:
      return "bg-warning";
  }
}
