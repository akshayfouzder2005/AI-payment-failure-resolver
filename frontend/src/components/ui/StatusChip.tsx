import { statusEntry } from "../../lib/status";
import { ToneChip } from "./ToneChip";

/**
 * The one state-chip implementation reused everywhere a backend status
 * appears — Payments table, Decision Chain, Policy Gate, Recovery Attempt
 * rows, Overview. Always dot + label together (design spec §3).
 * Label/tone mapping lives in lib/status.ts.
 */
export function StatusChip({ status, className = "" }: { status: string; className?: string }) {
  const entry = statusEntry(status);
  return <ToneChip tone={entry.tone} label={entry.label} className={className} />;
}
