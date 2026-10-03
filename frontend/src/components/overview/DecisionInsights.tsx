import { SectionHeader } from "../ui/SectionHeader";
import { formatCount, formatPercent } from "../../lib/format";
import { countFailureReasons } from "../../lib/insights";
import type { MetricsSummary, PaymentRead } from "../../types/api";

const TOP_REASONS = 5;

/**
 * How the pipeline is behaving, in two real halves.
 *
 * Left — automation and policy rates straight from MetricsSummary: how much
 * is recovered without a human, how much is handed to the merchant, and how
 * many interventions the policy engine blocked or that failed outright.
 *
 * Right — the most common failure reasons, counted from the payments the
 * page already loaded (gateway failure_code; null groups as "Unspecified").
 * It is labelled with its own sample size because it covers only the latest
 * page of payments, not the merchant's full history. Per-payment AI
 * diagnoses (category, confidence) have no aggregate endpoint yet, so this
 * deliberately does not summarize them.
 */
export function DecisionInsights({
  metrics,
  payments,
}: {
  metrics: MetricsSummary;
  payments: PaymentRead[];
}) {
  const reasons = countFailureReasons(payments).slice(0, TOP_REASONS);
  const topCount = reasons[0]?.count ?? 0;

  return (
    <section>
      <SectionHeader title="Decision Insights" />

      <div className="grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-2">
        <div>
          <h3 className="mb-1 text-label uppercase text-text-muted">Automation and policy</h3>
          <dl className="divide-y divide-border border-y border-border">
            <Row label="Automatic recovery rate" value={formatPercent(metrics.automatic_recovery_rate)} />
            <Row label="Escalation rate" value={formatPercent(metrics.escalation_rate)} />
            <Row
              label="Blocked or failed interventions"
              value={formatCount(metrics.failed_or_blocked_intervention_count)}
            />
          </dl>
        </div>

        <div>
          <h3 className="mb-1 text-label uppercase text-text-muted">Top failure reasons</h3>
          {reasons.length === 0 ? (
            <p className="border-y border-border py-3 text-body-small text-text-muted">
              No failure reasons recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {reasons.map((reason) => (
                <li key={reason.label} className="py-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="min-w-0 truncate text-sm text-text">{reason.label}</span>
                    <span className="text-sm tabular-nums text-text-muted">{formatCount(reason.count)}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-sm bg-border" aria-hidden="true">
                    <div
                      className="h-full rounded-sm bg-text-faint"
                      style={{ width: `${(reason.count / topCount) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-body-small text-text-muted">
            From the latest {formatCount(payments.length)} {payments.length === 1 ? "payment" : "payments"}.
          </p>
        </div>
      </div>
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
