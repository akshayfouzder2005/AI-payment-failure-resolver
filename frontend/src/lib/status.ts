/**
 * One source of truth for how a backend status string reads: its label and
 * its semantic tone. StatusChip, the Payments filter bar and the Decision
 * Chain all resolve through here so "Retry scheduled" can never be spelled
 * or coloured two different ways on two screens.
 *
 * Covers every real status this backend returns (Payment.status,
 * PolicyDecisionType, RecoveryAttemptStatus, WebhookIngestResult.status —
 * see app/enums.py and app/schemas/policy.py). An unrecognized string still
 * resolves — to a neutral entry showing the raw value — rather than hiding
 * or crashing on a backend value this file doesn't know about yet.
 */

export type Tone = "success" | "warning" | "danger" | "info" | "muted";

export const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
  info: "bg-info/15 text-info",
  muted: "bg-text-faint/15 text-text-muted",
};

// Tailwind can't resolve dynamically-interpolated class names
// (`bg-${tone}`) at build time, so every tone-dependent class is its own
// static map rather than derived by string concatenation.
export const DOT_CLASSES: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  muted: "bg-text-faint",
};

export const RING_CLASSES: Record<Tone, string> = {
  success: "border-success",
  warning: "border-warning",
  danger: "border-danger",
  info: "border-info",
  muted: "border-text-faint",
};

export const TEXT_CLASSES: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  muted: "text-text-muted",
};

export interface StatusEntry {
  label: string;
  tone: Tone;
}

const STATUS_MAP: Record<string, StatusEntry> = {
  // Payment.status
  failed: { label: "Failed", tone: "danger" },
  retry_scheduled: { label: "Retry scheduled", tone: "warning" },
  recovered: { label: "Recovered", tone: "success" },
  escalated: { label: "Escalated", tone: "warning" },
  abandoned: { label: "Abandoned", tone: "muted" },

  // PolicyDecisionType
  APPROVE: { label: "Approved", tone: "success" },
  MODIFY: { label: "Modified", tone: "warning" },
  REJECT: { label: "Rejected", tone: "danger" },
  ESCALATE: { label: "Escalated", tone: "warning" },

  // RecoveryAttemptStatus
  pending: { label: "Pending", tone: "info" },
  in_progress: { label: "Executing", tone: "info" },
  success: { label: "Success", tone: "success" },
  skipped: { label: "Skipped", tone: "muted" },

  // WebhookIngestResult.status
  processed: { label: "Processed", tone: "success" },
  duplicate: { label: "Duplicate", tone: "muted" },
  ignored: { label: "Ignored", tone: "muted" },
  processing_failed: { label: "Processing failed", tone: "danger" },
};

export function statusEntry(status: string): StatusEntry {
  return STATUS_MAP[status] ?? { label: status, tone: "muted" };
}

/**
 * The Payment.status values the Payments filter offers, in lifecycle order.
 * These are the backend's real statuses (app/services/metrics_service.py
 * documents the same five); GET /payments filters on exact match.
 */
export const PAYMENT_STATUSES = ["failed", "retry_scheduled", "recovered", "escalated", "abandoned"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
