import { PAYMENT_STATUSES, statusEntry, type PaymentStatus } from "../../lib/status";
import { formatDateTimeParts } from "../../lib/format";
import { Amount } from "../ui/Amount";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";
import { StatusChip } from "../ui/StatusChip";
import type { PaymentRead } from "../../types/api";

/** Chooses which payment's trace to inspect. Real list, server-side status filter, load-more paging. */
export function PaymentPicker({
  payments,
  loading,
  error,
  status,
  selectedId,
  hasMore,
  loadingMore,
  onStatus,
  onSelect,
  onLoadMore,
  onRetry,
}: {
  payments: PaymentRead[] | null;
  loading: boolean;
  error: string | null;
  status: PaymentStatus | null;
  selectedId: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  onStatus: (status: PaymentStatus | null) => void;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  return (
    <section aria-labelledby="picker-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="picker-title" className="text-subhead text-text">
          Payments
        </h2>
        <label className="flex items-center gap-2 text-body-small text-text-muted">
          <span className="sr-only">Status</span>
          <select
            value={status ?? ""}
            onChange={(event) => onStatus(event.target.value === "" ? null : (event.target.value as PaymentStatus))}
            className="focus-ring rounded border border-border bg-surface-raised px-2 py-1 text-sm text-text transition-colors duration-150 hover:border-border-strong"
          >
            <option value="">All statuses</option>
            {PAYMENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {statusEntry(value).label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <div role="alert" className="rounded border border-danger/40 bg-danger/10 px-3 py-3 text-sm text-text">
          <p>{error}</p>
          <Button variant="secondary" onClick={onRetry} className="mt-2 py-1">
            Retry
          </Button>
        </div>
      ) : loading && !payments ? (
        <div role="status" aria-busy="true" aria-label="Loading payments" className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : payments && payments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-text-muted">
          {status ? `No ${statusEntry(status).label.toLowerCase()} payments.` : "No payments yet. Run a scenario in the Recovery Lab to create one."}
        </p>
      ) : (
        <>
          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border xl:max-h-[calc(100dvh-16rem)]">
            {(payments ?? []).map((payment) => {
              const active = payment.id === selectedId;
              const created = formatDateTimeParts(payment.created_at);
              return (
                <li key={payment.id}>
                  <button
                    type="button"
                    aria-current={active ? "true" : undefined}
                    aria-label={`Trace payment ${payment.id}`}
                    onClick={() => onSelect(payment.id)}
                    className={`focus-ring relative flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors duration-150 ${
                      active
                        ? "bg-surface-raised before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-accent"
                        : "hover:bg-surface-raised"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-[15px]">
                        <Amount amount={payment.amount} currency={payment.currency} />
                      </span>
                      <span className="block truncate font-mono text-[11px] text-text-muted">{payment.gateway_payment_id}</span>
                      <span className="block font-mono text-[11px] tabular-nums text-text-muted">
                        {created.date}, {created.time}
                      </span>
                    </span>
                    <StatusChip status={payment.status} className="shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
          {hasMore && (
            <Button variant="secondary" onClick={onLoadMore} disabled={loadingMore} className="mt-3 w-full py-1.5">
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
