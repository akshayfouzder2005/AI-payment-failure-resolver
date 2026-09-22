/**
 * The one state-chip implementation reused everywhere a status appears —
 * Payments table, Decision Chain, Policy Gate, Recovery Attempt rows,
 * Overview. Never a bare color; always dot + label together (design spec
 * §3 — color never carries meaning alone).
 *
 * Maps every real status string this backend actually returns (Payment.status,
 * PolicyDecisionType, RecoveryAttemptStatus — see app/enums.py and
 * app/schemas/policy.py) into one of a small set of semantic tones. An
 * unrecognized string still renders — as a neutral chip showing the raw
 * value — rather than silently hiding or crashing on backend values this
 * component doesn't know about yet.
 */

type Tone = "success" | "warning" | "danger" | "info" | "muted";

const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
  info: "bg-info/15 text-info",
  muted: "bg-text-faint/15 text-text-muted",
};

// Tailwind can't resolve a dynamically-interpolated class name (`bg-${tone}`)
// at build time, so the dot color is its own static map rather than derived
// from TONE_CLASSES by string concatenation.
const DOT_CLASSES: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  muted: "bg-text-faint",
};

const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
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

export function StatusChip({ status, className = "" }: { status: string; className?: string }) {
  const entry = STATUS_MAP[status] ?? { label: status, tone: "muted" as Tone };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[entry.tone]} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[entry.tone]}`} aria-hidden="true" />
      {entry.label}
    </span>
  );
}
