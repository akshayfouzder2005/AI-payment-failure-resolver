import { ProportionBar } from "../ui/ProportionBar";
import { formatCurrency, formatPercent } from "../../lib/format";
import type { MetricsSummary } from "../../types/api";

/**
 * Design spec §12-A: Revenue Recovered as the largest numeral beside
 * Revenue at Risk, with Recovery Rate as a smaller supporting figure
 * between them, plus a single proportion bar (recovered vs. at-risk
 * share of total-at-risk-ever). Every figure traces directly to
 * MetricsSummary — nothing computed beyond simple addition of two
 * already-real fields.
 */
export function RevenuePosition({ metrics }: { metrics: MetricsSummary }) {
  const recovered = Number(metrics.revenue_recovered);
  const atRisk = Number(metrics.revenue_at_risk);

  return (
    <section>
      <h2 className="text-label uppercase text-text-faint">Revenue Position</h2>

      <div className="mt-4 flex flex-wrap items-end gap-x-10 gap-y-5">
        <div>
          <div className="text-body-small text-text-muted">Revenue recovered</div>
          <div className="text-display tabular-nums text-success">{formatCurrency(metrics.revenue_recovered)}</div>
        </div>

        <div className="pb-1.5">
          <div className="text-body-small text-text-muted">Recovery rate</div>
          <div className="text-heading tabular-nums text-text">{formatPercent(metrics.recovery_rate)}</div>
        </div>

        <div>
          <div className="text-body-small text-text-muted">Revenue at risk</div>
          <div className="text-display tabular-nums text-warning">{formatCurrency(metrics.revenue_at_risk)}</div>
        </div>
      </div>

      <div className="mt-6 max-w-xl">
        <ProportionBar
          segments={[
            {
              label: "Recovered",
              value: recovered,
              formattedValue: formatCurrency(metrics.revenue_recovered),
              colorClass: "bg-success",
            },
            {
              label: "At risk",
              value: atRisk,
              formattedValue: formatCurrency(metrics.revenue_at_risk),
              colorClass: "bg-warning",
            },
          ]}
        />
      </div>
    </section>
  );
}
