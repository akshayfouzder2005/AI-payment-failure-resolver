import { Link, useNavigate } from "react-router-dom";
import { SectionHeader } from "../ui/SectionHeader";
import { StatusChip } from "../ui/StatusChip";
import { formatCurrency, formatRelativeTime, humanizeCode } from "../../lib/format";
import type { PaymentRead } from "../../types/api";

/**
 * Newest-first (the backend already orders /payments by created_at desc, so
 * this is real arrival order) — every payment here entered the system as a
 * failure, and its current status says what has happened since. The failure
 * reason is the gateway's own message, falling back to the humanized failure
 * code, falling back to a dash; nothing is invented.
 *
 * Responsive density: below sm the customer and reason fold under the amount;
 * from sm to xl the failure reason folds under the customer; at xl it gets its own
 * column. Amount, status and age are always visible.
 *
 * Rows keep their implicit "row" role and gain tabIndex + Enter/Space
 * handlers (an explicit role="button" would erase the row semantics).
 */
export function RecentFailedPayments({ payments }: { payments: PaymentRead[] }) {
  const navigate = useNavigate();
  const rows = payments.slice(0, 8);

  function openPayment(paymentId: string) {
    navigate(`/app/payments/${paymentId}`);
  }

  return (
    <section>
      <SectionHeader
        title="Recent Failed Payments"
        aside={
          <Link
            to="/app/payments"
            className="focus-ring rounded text-text-muted transition-colors duration-150 hover:text-text"
          >
            View all
          </Link>
        }
      />

      {rows.length === 0 ? (
        <p className="text-body-small text-text-muted">No payments yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-small">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th scope="col" className="py-2.5 pr-4 font-normal">
                  Amount
                </th>
                <th scope="col" className="hidden py-2.5 pr-4 font-normal sm:table-cell">
                  Customer
                </th>
                <th scope="col" className="hidden py-2.5 pr-4 font-normal xl:table-cell">
                  Failure reason
                </th>
                <th scope="col" className="py-2.5 pr-4 font-normal">
                  Status
                </th>
                <th scope="col" className="py-2.5 text-right font-normal">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((payment) => {
                const reason = failureReason(payment);
                return (
                  <tr
                    key={payment.id}
                    tabIndex={0}
                    aria-label={`Open payment ${payment.id}`}
                    onClick={() => openPayment(payment.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openPayment(payment.id);
                      }
                    }}
                    className="focus-ring cursor-pointer border-b border-border transition-colors duration-150 last:border-b-0 hover:bg-surface-raised"
                  >
                    <td className="py-3 pr-4 align-top">
                      <div className="font-medium tabular-nums text-text">
                        {formatCurrency(payment.amount, payment.currency)}
                      </div>
                      <div className="mt-0.5 max-w-[11rem] truncate text-text-muted sm:hidden">
                        {payment.customer?.name ?? "—"} · {reason}
                      </div>
                    </td>
                    <td className="hidden py-3 pr-4 align-top sm:table-cell">
                      <div className="text-text">{payment.customer?.name ?? "—"}</div>
                      <div className="mt-0.5 max-w-[16rem] truncate text-text-muted xl:hidden">{reason}</div>
                    </td>
                    <td className="hidden max-w-[14rem] truncate py-3 pr-4 align-top text-text-muted xl:table-cell">
                      {reason}
                    </td>
                    <td className="py-3 pr-4 align-top">
                      <StatusChip status={payment.status} />
                    </td>
                    <td className="whitespace-nowrap py-3 text-right align-top text-text-muted">
                      {formatRelativeTime(payment.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function failureReason(payment: PaymentRead): string {
  if (payment.failure_message) return payment.failure_message;
  if (payment.failure_code) return humanizeCode(payment.failure_code);
  return "—";
}
