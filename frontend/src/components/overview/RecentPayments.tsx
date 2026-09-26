import { useNavigate } from "react-router-dom";
import { StatusChip } from "../ui/StatusChip";
import { formatCurrency, formatRelativeTime } from "../../lib/format";
import type { PaymentRead } from "../../types/api";

/**
 * Design spec §12-D: "last 5-8 rows from GET /payments (newest first),
 * compact table — amount, status chip, customer, relative timestamp.
 * Row click → Payment Detail." The backend already returns payments
 * ordered by created_at desc (PaymentRepository.list_for_merchant), so
 * no client-side re-sort is needed here — this is real arrival order.
 *
 * Known simplification (see Phase 4 report): a real ARIA grid pattern
 * (roving tabindex, role="gridcell") is more machinery than a hackathon
 * preview table needs, so this keeps the table's real "row"/"cell"
 * semantics intact and adds tabIndex + click/Enter/Space handlers
 * directly on the row instead — reachable and operable by keyboard
 * without hijacking the row's role. Phase 5's dedicated Payments table
 * can revisit this if a fuller pattern is warranted there.
 */
export function RecentPayments({ payments }: { payments: PaymentRead[] }) {
  const navigate = useNavigate();
  const rows = payments.slice(0, 8);

  function openPayment(paymentId: string) {
    navigate(`/app/payments/${paymentId}`);
  }

  return (
    <section>
      <h2 className="text-label uppercase text-text-faint">Recent Payment Activity</h2>

      {rows.length === 0 ? (
        <p className="mt-3 text-body-small text-text-faint">No payments yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-body-small">
            <thead>
              <tr className="border-b border-border text-text-faint">
                <th scope="col" className="py-2 pr-4 font-normal">
                  Amount
                </th>
                <th scope="col" className="py-2 pr-4 font-normal">
                  Status
                </th>
                <th scope="col" className="py-2 pr-4 font-normal">
                  Customer
                </th>
                <th scope="col" className="py-2 pr-0 text-right font-normal">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((payment) => (
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
                  <td className="py-2.5 pr-4 tabular-nums text-text">
                    {formatCurrency(payment.amount, payment.currency)}
                  </td>
                  <td className="py-2.5 pr-4">
                    <StatusChip status={payment.status} />
                  </td>
                  <td className="py-2.5 pr-4 text-text-muted">{payment.customer?.name ?? "—"}</td>
                  <td className="py-2.5 pr-0 text-right text-text-faint">{formatRelativeTime(payment.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
