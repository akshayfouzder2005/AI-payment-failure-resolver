import { ProportionBar } from "../ui/ProportionBar";
import { SectionHeader } from "../ui/SectionHeader";
import { formatCurrency, formatDuration, formatPercent } from "../../lib/format";
import type { MetricsSummary } from "../../types/api";

/**
 * The page's primary read: revenue recovered as the single largest numeral,
 * a proportion bar for recovered vs. still-at-risk value, then a ruled strip
 * of the supporting figures. Every number traces to MetricsSummary — nothing
 * is computed here beyond handing two real fields to the bar.
 *
 * The bar compares only recovered and at-risk value. Escalated payments are
 * not in revenue_at_risk (the backend counts only failed + retry_scheduled
 * as money still collectible), so the caption says so rather than letting
 * the bar imply it covers every failed rupee.
 */
export function RevenuePosition({ metrics }: { metrics: MetricsSummary }) {
  return (
    <section>
      <SectionHeader title="Revenue Position" />

      <div>
        <div className="flex items-center gap-2 text-body-small text-text-muted">
          <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
          Revenue recovered
        </div>
        <div className="mt-1 text-display tabular-nums text-text">{formatCurrency(metrics.revenue_recovered)}</div>
      </div>

      <div className="mt-6">
        <ProportionBar
          segments={[
            {
              label: "Recovered",
              value: Number(metrics.revenue_recovered),
              formattedValue: formatCurrency(metrics.revenue_recovered),
              colorClass: "bg-success",
            },
            {
              label: "At risk",
              value: Number(metrics.revenue_at_risk),
              formattedValue: formatCurrency(metrics.revenue_at_risk),
              colorClass: "bg-warning",
            },
          ]}
        />
        <p className="mt-2 text-body-small text-text-muted">
          Recovered against value still collectible. Escalated payments are tracked separately.
        </p>
      </div>

      <dl className="mt-6 grid grid-cols-1 divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Stat label="Revenue at risk" value={formatCurrency(metrics.revenue_at_risk)} dotClass="bg-warning" />
        <Stat label="Recovery rate" value={formatPercent(metrics.recovery_rate)} />
        <Stat label="Average recovery time" value={formatDuration(metrics.average_recovery_time_seconds)} />
      </dl>
    </section>
  );
}

function Stat({ label, value, dotClass }: { label: string; value: string; dotClass?: string }) {
  return (
    <div className="py-4 sm:px-5 sm:first:pl-0 sm:last:pr-0">
      <dt className="flex items-center gap-2 text-body-small text-text-muted">
        {dotClass && <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />}
        {label}
      </dt>
      <dd className="mt-1 text-heading tabular-nums text-text">{value}</dd>
    </div>
  );
}
