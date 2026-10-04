import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as api from "../lib/api";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "../lib/pagination";
import { PAYMENT_STATUSES, statusEntry, type PaymentStatus } from "../lib/status";
import type { PaymentRead } from "../types/api";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { ErrorState } from "../components/ui/ErrorState";
import { PaymentsToolbar } from "../components/payment/PaymentsToolbar";
import { PanelEmpty, PaymentsTable, PaymentsTableSkeleton } from "../components/payment/PaymentsTable";
import { PaymentsPagination } from "../components/payment/PaymentsPagination";

// What the last settled request produced, tagged with the query it answered
// so a stale response can never be mistaken for the current one.
type Settled =
  | { key: string; rows: PaymentRead[]; hasNext: boolean }
  | { key: string; error: string };

/**
 * /app/payments. The whole query — status filter, page, page size — lives
 * in the URL, so a filtered view survives refresh, back/forward and being
 * shared. Filtering is server-side; pagination uses limit/offset and
 * requests one extra row to learn whether a next page exists (the API
 * returns no total). Changing the filter or page size returns to page 1.
 */
export function PaymentsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [reloadToken, setReloadToken] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);

  const rawStatus = searchParams.get("status");
  const status: PaymentStatus | null = (PAYMENT_STATUSES as readonly string[]).includes(rawStatus ?? "")
    ? (rawStatus as PaymentStatus)
    : null;
  const rawSize = Number(searchParams.get("size"));
  const size = (PAGE_SIZES as readonly number[]).includes(rawSize) ? rawSize : DEFAULT_PAGE_SIZE;
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

  const key = `${status ?? "all"}|${page}|${size}|${reloadToken}`;

  useEffect(() => {
    let cancelled = false;
    api
      .listPayments({
        ...(status ? { status } : {}),
        limit: size + 1,
        offset: (page - 1) * size,
      })
      .then((result) => {
        if (cancelled) return;
        setSettled({ key, rows: result.slice(0, size), hasNext: result.length > size });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSettled({ key, error: err instanceof api.ApiError ? err.message : "Could not load payments." });
      });
    return () => {
      cancelled = true;
    };
  }, [key, status, page, size]);

  const update = useCallback(
    (next: { status?: PaymentStatus | null; page?: number; size?: number }) => {
      const params = new URLSearchParams(searchParams);
      if ("status" in next) {
        if (next.status) params.set("status", next.status);
        else params.delete("status");
      }
      if (next.size !== undefined) {
        if (next.size === DEFAULT_PAGE_SIZE) params.delete("size");
        else params.set("size", String(next.size));
      }
      if (next.page !== undefined && next.page > 1) params.set("page", String(next.page));
      else params.delete("page");
      setSearchParams(params);
    },
    [searchParams, setSearchParams],
  );

  const loading = settled?.key !== key;
  const rows = settled && "rows" in settled ? settled.rows : null;
  const error = settled && "error" in settled && !loading ? settled.error : null;
  const hasNext = settled && "rows" in settled && !loading ? settled.hasNext : false;

  const filtered = status !== null;
  const noResultsAtAll = !loading && rows !== null && rows.length === 0;

  return (
    <div>
      <PageHeader title="Payments" description="Every payment this workspace has recorded, newest first." />

      <div className="overflow-hidden rounded-lg border border-border bg-surface-raised">
        <PaymentsToolbar
          status={status}
          size={size}
          loading={loading}
          onStatusChange={(next) => update({ status: next, page: 1 })}
          onSizeChange={(next) => update({ size: next, page: 1 })}
          onRefresh={() => setReloadToken((token) => token + 1)}
        />

        {error ? (
          <div className="p-6">
            <ErrorState message={error} onRetry={() => setReloadToken((token) => token + 1)} />
          </div>
        ) : rows === null || (loading && rows.length === 0) ? (
          <PaymentsTableSkeleton />
        ) : noResultsAtAll ? (
          page > 1 ? (
            <PanelEmpty
              title="No more payments"
              description="There are no rows on this page."
              action={
                <Button variant="secondary" onClick={() => update({ page: 1 })}>
                  Back to first page
                </Button>
              }
            />
          ) : filtered ? (
            <PanelEmpty
              title={`No ${statusEntry(status).label.toLowerCase()} payments`}
              description="Nothing matches this status right now."
              action={
                <Button variant="secondary" onClick={() => update({ status: null, page: 1 })}>
                  Clear filter
                </Button>
              }
            />
          ) : (
            <PanelEmpty
              title="No payments yet"
              description="Failed payments appear here as soon as they are received from Razorpay or simulated."
              action={
                <Button variant="primary" onClick={() => navigate("/app/recovery-lab")}>
                  Run demo scenario
                </Button>
              }
            />
          )
        ) : (
          <PaymentsTable payments={rows} dimmed={loading} />
        )}

        {!error && rows !== null && !noResultsAtAll && (
          <PaymentsPagination
            page={page}
            size={size}
            shown={rows.length}
            hasNext={hasNext}
            loading={loading}
            onPrevious={() => update({ page: page - 1 })}
            onNext={() => update({ page: page + 1 })}
          />
        )}
      </div>
    </div>
  );
}
