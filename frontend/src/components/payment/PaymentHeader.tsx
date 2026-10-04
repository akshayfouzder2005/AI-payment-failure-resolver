import { Link } from "react-router-dom";
import { Amount } from "../ui/Amount";
import { Button } from "../ui/Button";
import { StatusChip } from "../ui/StatusChip";
import { formatDateTime } from "../../lib/format";
import type { PaymentRead } from "../../types/api";

export function PaymentHeader({
  payment,
  refreshing,
  onRefresh,
}: {
  payment: PaymentRead;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="mb-6">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-body-small text-text-muted">
        <Link to="/app/payments" className="focus-ring rounded transition-colors duration-150 hover:text-text">
          Payments
        </Link>
        <span aria-hidden="true">/</span>
        <span className="min-w-0 truncate font-mono text-[13px] text-text" aria-current="page">
          {payment.gateway_payment_id}
        </span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <Amount amount={payment.amount} currency={payment.currency} size="lg" />
            <StatusChip status={payment.status} />
          </h1>
          <p className="mt-2 text-body-small text-text-muted">
            Failed {formatDateTime(payment.created_at)}
            {payment.customer?.name ? ` · ${payment.customer.name}` : ""} · via {payment.gateway}
          </p>
        </div>

        <Button variant="secondary" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
    </header>
  );
}
