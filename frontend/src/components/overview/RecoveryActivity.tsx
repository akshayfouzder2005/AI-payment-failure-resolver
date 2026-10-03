import { Link } from "react-router-dom";
import { SectionHeader } from "../ui/SectionHeader";
import { StatusChip } from "../ui/StatusChip";
import { formatCurrency, formatRelativeTime } from "../../lib/format";
import type { PaymentRead } from "../../types/api";

/**
 * Recent recovery-relevant outcomes, derived entirely from the payments the
 * page already loaded — no extra endpoint, no polling loop.
 *
 * /payments is a current-state snapshot, not an event log, so this is
 * "payments that have moved past the untouched 'failed' status, most
 * recently changed first" (updated_at desc). That ordering is what keeps it
 * distinct from Recent Failed Payments, which is arrival order. It is not a
 * second audit log: the full causal chain lives on Payment Detail.
 */
export function RecoveryActivity({ payments }: { payments: PaymentRead[] }) {
  const items = payments
    .filter((payment) => payment.status !== "failed")
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 8);

  return (
    <section>
      <SectionHeader title="Recovery Activity" />

      {items.length === 0 ? (
        <p className="text-body-small text-text-muted">No recovery activity yet.</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((payment) => (
            <li key={payment.id}>
              <Link
                to={`/app/payments/${payment.id}`}
                className="focus-ring flex items-center justify-between gap-3 py-3 transition-colors duration-150 hover:bg-surface-raised xl:-mx-2 xl:px-2"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium tabular-nums text-text">
                    {formatCurrency(payment.amount, payment.currency)}
                  </span>
                  <span className="mt-0.5 block truncate text-body-small text-text-muted">
                    {payment.customer?.name ?? "—"} · {formatRelativeTime(payment.updated_at)}
                  </span>
                </span>
                <StatusChip status={payment.status} className="shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
