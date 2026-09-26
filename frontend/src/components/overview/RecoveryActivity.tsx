import { Link } from "react-router-dom";
import { StatusChip } from "../ui/StatusChip";
import { formatCurrency, formatRelativeTime } from "../../lib/format";
import type { PaymentRead } from "../../types/api";

/**
 * Design spec correction-pass delta §2: a short (5-8 item) list of
 * recent recovery-relevant outcomes, derived entirely from the payments
 * already loaded for this page — no new endpoint, no polling loop.
 *
 * The backend's /payments list is a current-state snapshot, not a
 * discrete event log, so per the delta's explicit fallback rule this
 * degrades to "recent payments with a status change": rows are ordered
 * by updated_at (most recently changed first) and filtered to payments
 * where something has actually happened beyond bare ingestion — i.e.
 * status is no longer the initial "failed". This deliberately
 * distinguishes it from Recent Payment Activity below (§12-D, ordered
 * by created_at — arrival order) rather than showing the same rows
 * twice.
 *
 * Three or four words each, no metadata, no actor — this is explicitly
 * not a second audit log; the full causal chain lives on Payment Detail
 * → Audit Timeline.
 */
export function RecoveryActivity({ payments }: { payments: PaymentRead[] }) {
  const items = payments
    .filter((payment) => payment.status !== "failed")
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 8);

  return (
    <section>
      <h2 className="text-subhead text-text">Recovery Activity</h2>

      {items.length === 0 ? (
        <p className="mt-3 text-body-small text-text-faint">No recovery activity yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {items.map((payment) => (
            <li key={payment.id}>
              <Link
                to={`/app/payments/${payment.id}`}
                className="focus-ring flex items-center justify-between gap-4 py-3 transition-colors duration-150 hover:bg-surface-raised"
              >
                <span className="flex items-center gap-3">
                  <StatusChip status={payment.status} />
                  <span className="text-body-small tabular-nums text-text">
                    {formatCurrency(payment.amount, payment.currency)}
                  </span>
                </span>
                <span className="text-body-small text-text-faint">{formatRelativeTime(payment.updated_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
