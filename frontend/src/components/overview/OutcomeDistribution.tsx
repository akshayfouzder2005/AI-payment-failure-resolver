import { ProportionBar } from "../ui/ProportionBar";
import { formatCount } from "../../lib/format";
import type { MetricsSummary } from "../../types/api";

/**
 * Design spec §12-C: "a single restrained horizontal stacked bar —
 * Recovered / At Risk / Escalated segments, proportioned from real
 * /metrics/summary counts. No invented time-series." The backend
 * exposes recovered_count and escalated_count directly; "at risk"
 * (still open — failed or retry_scheduled) is the remainder of
 * payments_analyzed, a real count derived by simple subtraction, not
 * a fabricated figure.
 *
 * Escalated is rendered in color-danger here specifically (rather than
 * the color-warning StatusChip uses for a single escalated payment row)
 * because this is a 3-way distribution where "at risk" already owns
 * warning — see Phase 4 report for the reasoning.
 */
export function OutcomeDistribution({ metrics }: { metrics: MetricsSummary }) {
  const atRiskCount = Math.max(
    metrics.payments_analyzed - metrics.recovered_count - metrics.escalated_count,
    0,
  );

  return (
    <section>
      <h2 className="text-label uppercase text-text-faint">Outcome Distribution</h2>
      <div className="mt-4 max-w-xl">
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
      </div>
    </section>
  );
}
