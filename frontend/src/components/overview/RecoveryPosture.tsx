import { formatCount } from "../../lib/format";
import type { MetricsSummary } from "../../types/api";

/**
 * Design spec §12-B: "four compact stat rows ... as a tight label/value
 * list, not four separate cards." Reuses the exact divide-y/border-lg
 * list pattern AccountPage already established for the same reason —
 * one state system, not per-screen reinvention.
 */
export function RecoveryPosture({ metrics }: { metrics: MetricsSummary }) {
  return (
    <section>
      <h2 className="text-label uppercase text-text-faint">Recovery Posture</h2>
      <dl className="mt-4 divide-y divide-border rounded-lg border border-border">
        <Row label="Payments analyzed" value={formatCount(metrics.payments_analyzed)} />
        <Row label="Recovered" value={formatCount(metrics.recovered_count)} />
        <Row label="Escalated" value={formatCount(metrics.escalated_count)} />
        <Row label="Automatically recovered" value={formatCount(metrics.automatically_recovered_count)} />
      </dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="text-sm tabular-nums text-text">{value}</dd>
    </div>
  );
}
