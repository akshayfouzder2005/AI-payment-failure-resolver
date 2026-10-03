import { ProportionBar } from "../ui/ProportionBar";
import { SectionHeader } from "../ui/SectionHeader";
import { formatCount, formatPercent } from "../../lib/format";
import type { MetricsSummary } from "../../types/api";

/**
 * Outcome mix and throughput in one narrow rail. The bar is proportioned
 * from real counts; "at risk" is the remainder of payments_analyzed after
 * recovered and escalated — a real count by subtraction, not an estimate.
 * (It includes abandoned payments, which the metrics endpoint doesn't
 * break out separately.) Escalated uses the danger tone here because in a
 * three-way split "at risk" already owns warning.
 */
export function RecoveryPerformance({ metrics }: { metrics: MetricsSummary }) {
  const atRiskCount = Math.max(
    metrics.payments_analyzed - metrics.recovered_count - metrics.escalated_count,
    0,
  );

  return (
    <section>
      <SectionHeader title="Recovery Performance" />

      <ProportionBar
        segments={[
          {
            label: "Recovered",
            value: metrics.recovered_count,
            formattedValue: formatCount(metrics.recovered_count),
            colorClass: "bg-success",
          },
          {
            label: "At risk",
            value: atRiskCount,
            formattedValue: formatCount(atRiskCount),
            colorClass: "bg-warning",
          },
          {
            label: "Escalated",
            value: metrics.escalated_count,
            formattedValue: formatCount(metrics.escalated_count),
            colorClass: "bg-danger",
          },
        ]}
      />

      <dl className="mt-6 divide-y divide-border border-y border-border">
        <Row label="Payments analyzed" value={formatCount(metrics.payments_analyzed)} />
        <Row label="Automatically recovered" value={formatCount(metrics.automatically_recovered_count)} />
        <Row label="Recovery attempt success" value={formatPercent(metrics.recovery_attempt_success_rate)} />
      </dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="text-body font-medium tabular-nums text-text">{value}</dd>
    </div>
  );
}
