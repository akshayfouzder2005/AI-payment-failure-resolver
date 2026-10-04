import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Amount } from "../ui/Amount";
import { Skeleton } from "../ui/Skeleton";
import { StatusChip } from "../ui/StatusChip";
import { formatDateTimeParts, humanizeCode } from "../../lib/format";
import type { PaymentRead } from "../../types/api";

/**
 * The records table. Amount leads and carries the weight (rupees bold,
 * paise quiet); identifiers are monospace and never truncated into
 * ambiguity (the internal UUID is shown as its first eight characters
 * with the full value in the title, the gateway ID in full). Timestamps
 * are absolute — this is a ledger view, not a feed.
 *
 * Responsive density: at the narrowest widths customer and gateway ID fold
 * under the amount; Customer joins at md, Failure and Payment ID at lg.
 * Amount, Status and Created are always visible.
 *
 * Each row is keyboard-operable (tabIndex + Enter/Space) while keeping its
 * native "row" role, and its amount is a real link so open-in-new-tab and
 * assistive link navigation work. The row handler ignores clicks that
 * originate on that link so one click never navigates twice.
 */
export function PaymentsTable({ payments, dimmed }: { payments: PaymentRead[]; dimmed: boolean }) {
  const navigate = useNavigate();

  function open(paymentId: string) {
    navigate(`/app/payments/${paymentId}`);
  }

  return (
    <div className={`overflow-x-auto transition-opacity duration-150 ${dimmed ? "opacity-60" : ""}`} aria-busy={dimmed}>
      <table className="w-full min-w-[34rem] text-left text-body-small">
        <thead>
          <tr className="border-b border-border-strong text-label uppercase text-text-muted">
            <th scope="col" className="py-2.5 pl-4 pr-4 font-semibold sm:pl-5">
              Amount
            </th>
            <th scope="col" className="py-2.5 pr-4 font-semibold">
              Status
            </th>
            <th scope="col" className="hidden py-2.5 pr-4 font-semibold md:table-cell">
              Customer
            </th>
            <th scope="col" className="hidden py-2.5 pr-4 font-semibold lg:table-cell">
              Failure
            </th>
            <th scope="col" className="hidden py-2.5 pr-4 font-semibold lg:table-cell">
              Payment ID
            </th>
            <th scope="col" className="py-2.5 pl-2 pr-4 text-right font-semibold sm:pr-5">
              Created
            </th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => {
            const created = formatDateTimeParts(payment.created_at);
            return (
              <tr
                key={payment.id}
                tabIndex={0}
                aria-label={`Open payment ${payment.id}`}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("a")) return;
                  open(payment.id);
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    open(payment.id);
                  }
                }}
                className="focus-ring cursor-pointer border-b border-border transition-colors duration-150 last:border-b-0 hover:bg-surface"
              >
                <td className="py-3 pl-4 pr-4 align-top sm:pl-5">
                  <Link
                    to={`/app/payments/${payment.id}`}
                    className="focus-ring rounded text-[15px]"
                    aria-label={`Payment ${payment.gateway_payment_id}`}
                  >
                    <Amount amount={payment.amount} currency={payment.currency} />
                  </Link>
                  <div className="mt-1 max-w-[12rem] truncate text-text-muted md:hidden">
                    {payment.customer?.name ?? "—"}
                  </div>
                  <div className="mt-0.5 max-w-[12rem] truncate font-mono text-[11px] text-text-muted lg:hidden">
                    {payment.gateway_payment_id}
                  </div>
                </td>
                <td className="py-3 pr-4 align-top">
                  <StatusChip status={payment.status} />
                </td>
                <td className="hidden py-3 pr-4 align-top md:table-cell">
                  <div className="text-text">{payment.customer?.name ?? "—"}</div>
                  {payment.customer?.email && (
                    <div className="mt-0.5 max-w-[14rem] truncate text-text-muted">{payment.customer.email}</div>
                  )}
                </td>
                <td className="hidden py-3 pr-4 align-top lg:table-cell">
                  <div className="max-w-[16rem] truncate text-text">
                    {payment.failure_message ?? (payment.failure_code ? humanizeCode(payment.failure_code) : "—")}
                  </div>
                  {payment.failure_code && (
                    <div className="mt-0.5 max-w-[16rem] truncate font-mono text-[11px] text-text-muted">
                      {payment.failure_code}
                    </div>
                  )}
                </td>
                <td className="hidden py-3 pr-4 align-top lg:table-cell">
                  <div className="whitespace-nowrap font-mono text-xs text-text">{payment.gateway_payment_id}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-text-muted" title={payment.id}>
                    {payment.id.slice(0, 8)}…
                  </div>
                </td>
                <td className="whitespace-nowrap py-3 pl-2 pr-4 text-right align-top sm:pr-5">
                  <div className="tabular-nums text-text">{created.date}</div>
                  <div className="mt-0.5 font-mono text-[11px] tabular-nums text-text-muted">{created.time}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PaymentsTableSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading payments" className="divide-y divide-border">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex items-center gap-6 px-4 py-4 sm:px-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="hidden h-4 w-32 md:block" />
          <Skeleton className="hidden h-4 w-48 lg:block" />
          <Skeleton className="ml-auto h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

export function PanelEmpty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-16 text-center">
      <h2 className="text-heading">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">{description}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
