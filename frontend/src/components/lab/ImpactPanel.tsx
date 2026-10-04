import { Link } from "react-router-dom";
import { formatCount, formatCurrencyExact, formatDateTime } from "../../lib/format";
import { StatusChip } from "../ui/StatusChip";
import type { MetricsSummary, PaymentRead } from "../../types/api";

/**
 * What the run did to the workspace, from two real reads of the metrics
 * endpoint (before the run, and again after it settled) and a refreshed
 * payments list filtered to the payments this session created. Deltas are
 * plain subtraction of those two responses — no estimates.
 */
export function ImpactPanel({
  before,
  after,
  created,
  refreshing,
}: {
  before: MetricsSummary | null;
  after: MetricsSummary | null;
  created: PaymentRead[];
  refreshing: boolean;
}) {
  return (
    <section aria-labelledby="impact-title">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 id="impact-title" className="text-subhead text-text">
          Workspace impact
        </h2>
        <span className="text-body-small text-text-muted">{refreshing ? "Refreshing metrics…" : "Refreshed from the backend"}</span>
      </div>

      {before && after ? (
        <dl className="grid grid-cols-1 divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Delta
            label="Payments analyzed"
            from={formatCount(before.payments_analyzed)}
            to={formatCount(after.payments_analyzed)}
            change={after.payments_analyzed - before.payments_analyzed}
            format={(n) => formatCount(Math.abs(n))}
          />
          <Delta
            label="Revenue at risk"
            from={formatCurrencyExact(before.revenue_at_risk)}
            to={formatCurrencyExact(after.revenue_at_risk)}
            change={Number(after.revenue_at_risk) - Number(before.revenue_at_risk)}
            format={(n) => formatCurrencyExact(Math.abs(n))}
          />
          <Delta
            label="Revenue recovered"
            from={formatCurrencyExact(before.revenue_recovered)}
            to={formatCurrencyExact(after.revenue_recovered)}
            change={Number(after.revenue_recovered) - Number(before.revenue_recovered)}
            format={(n) => formatCurrencyExact(Math.abs(n))}
          />
        </dl>
      ) : (
        <p className="text-body-small text-text-muted">Metrics could not be read before and after this run.</p>
      )}

      <h3 className="mb-2 mt-6 text-label uppercase text-text-muted">
        {created.length === 1 ? "Resulting payment" : "Resulting payments"}
      </h3>
      {created.length === 0 ? (
        <p className="text-body-small text-text-muted">No payment was created by this run.</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {created.map((payment) => (
            <li key={payment.id}>
              <Link
                to={`/app/payments/${payment.id}`}
                className="focus-ring flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 transition-colors duration-150 hover:bg-surface xl:-mx-2 xl:px-2"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium tabular-nums text-text">
                    {formatCurrencyExact(payment.amount, payment.currency)}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-text-muted">
                    {payment.gateway_payment_id} · {formatDateTime(payment.created_at)}
                  </span>
                </span>
                <StatusChip status={payment.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-body-small">
        <Link to="/app" className="focus-ring rounded text-text-muted underline decoration-border-strong underline-offset-4 hover:text-text">
          View Overview
        </Link>
        <Link to="/app/payments" className="focus-ring rounded text-text-muted underline decoration-border-strong underline-offset-4 hover:text-text">
          View all payments
        </Link>
      </div>
    </section>
  );
}

function Delta({
  label,
  from,
  to,
  change,
  format,
}: {
  label: string;
  from: string;
  to: string;
  change: number;
  format: (n: number) => string;
}) {
  const sign = change > 0 ? "+" : change < 0 ? "−" : "";
  return (
    <div className="py-3 sm:px-4 sm:first:pl-0 sm:last:pr-0">
      <dt className="text-body-small text-text-muted">{label}</dt>
      <dd className="mt-1 text-heading tabular-nums text-text">{to}</dd>
      <dd className="mt-0.5 text-body-small tabular-nums text-text-muted">
        was {from} · {change === 0 ? "no change" : `${sign}${format(change)}`}
      </dd>
    </div>
  );
}
