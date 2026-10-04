import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import * as api from "../lib/api";
import type { PaymentStatus } from "../lib/status";
import { exportJson, filterEntries, summarize } from "../lib/audit";
import type { AuditLogRead, PaymentRead } from "../types/api";
import { PageHeader } from "../components/ui/PageHeader";
import { ErrorState } from "../components/ui/ErrorState";
import { Skeleton } from "../components/ui/Skeleton";
import { PaymentPicker } from "../components/audit/PaymentPicker";
import { TraceHeader } from "../components/audit/TraceHeader";
import { TraceControls } from "../components/audit/TraceControls";
import { AuditTimeline } from "../components/audit/AuditTimeline";

const PICKER_PAGE = 25;

// A stable empty list: a fresh [] each render would defeat the useMemo below.
const NO_ENTRIES: AuditLogRead[] = [];

type TraceState =
  | { status: "empty" }
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error"; message: string }
  | { status: "ready"; payment: PaymentRead | null; entries: AuditLogRead[] };

/**
 * /app/audit — a forensic trace explorer. The backend exposes the audit trail
 * per payment (GET /audit/payment/{id}); there is no merchant-wide audit
 * endpoint yet, so this screen is "pick a payment, inspect its complete
 * trace" rather than a global feed, and says so instead of stitching one
 * together from partial reads. The selected payment lives in the URL
 * (?payment=<id>) so a trace can be linked to and survives refresh.
 */
export function AuditPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramId = searchParams.get("payment");

  // --- picker ---
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [payments, setPayments] = useState<PaymentRead[] | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pickerToken, setPickerToken] = useState(0);
  const pickerSeq = useRef(0);

  useEffect(() => {
    const seq = ++pickerSeq.current;
    api
      .listPayments({ ...(status ? { status } : {}), limit: PICKER_PAGE + 1, offset: 0 })
      .then((rows) => {
        if (seq !== pickerSeq.current) return;
        setPayments(rows.slice(0, PICKER_PAGE));
        setHasMore(rows.length > PICKER_PAGE);
        setPickerError(null);
      })
      .catch((err: unknown) => {
        if (seq !== pickerSeq.current) return;
        setPickerError(err instanceof api.ApiError ? err.message : "Could not load payments.");
      });
  }, [status, pickerToken]);

  async function loadMore() {
    if (!payments) return;
    setLoadingMore(true);
    try {
      const rows = await api.listPayments({
        ...(status ? { status } : {}),
        limit: PICKER_PAGE + 1,
        offset: payments.length,
      });
      setPayments([...payments, ...rows.slice(0, PICKER_PAGE)]);
      setHasMore(rows.length > PICKER_PAGE);
    } catch (err) {
      setPickerError(err instanceof api.ApiError ? err.message : "Could not load more payments.");
    } finally {
      setLoadingMore(false);
    }
  }

  // The trace shows the URL's payment, else the newest payment in the picker.
  const selectedId = paramId ?? payments?.[0]?.id ?? null;

  // --- trace ---
  const [trace, setTrace] = useState<TraceState>({ status: "loading" });
  const [traceToken, setTraceToken] = useState(0);
  const traceSeq = useRef(0);

  useEffect(() => {
    if (!selectedId) {
      // Nothing to inspect yet: either the picker is still loading (stay
      // loading) or it came back empty.
      // oxlint-disable-next-line react/set-state-in-effect
      setTrace(payments && payments.length === 0 && !paramId ? { status: "empty" } : { status: "loading" });
      return;
    }
    const seq = ++traceSeq.current;
    setTrace({ status: "loading" });
    Promise.allSettled([api.getPayment(selectedId), api.getPaymentAuditTimeline(selectedId)]).then(([payment, audit]) => {
      if (seq !== traceSeq.current) return;
      if (audit.status === "rejected") {
        const reason = audit.reason;
        setTrace(
          reason instanceof api.ApiError && reason.status === 404
            ? { status: "not-found" }
            : { status: "error", message: reason instanceof api.ApiError ? reason.message : "Could not load the audit trail." },
        );
        return;
      }
      setTrace({ status: "ready", payment: payment.status === "fulfilled" ? payment.value : null, entries: audit.value });
    });
  }, [selectedId, traceToken, payments, paramId]);

  const select = useCallback(
    (id: string) => {
      setSearchParams({ payment: id });
    },
    [setSearchParams],
  );

  // --- controls ---
  const [actors, setActors] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const entries = trace.status === "ready" ? trace.entries : NO_ENTRIES;
  const visible = useMemo(() => filterEntries(entries, { actors, query }), [entries, actors, query]);
  const summary = useMemo(() => summarize(entries), [entries]);
  const allExpanded = visible.length > 0 && visible.every((entry) => openIds.has(entry.id));

  function toggleActor(actor: string) {
    setActors((current) => {
      const next = new Set(current);
      if (next.has(actor)) next.delete(actor);
      else next.add(actor);
      return next;
    });
  }

  function toggleOpen(id: string) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpandAll() {
    setOpenIds(allExpanded ? new Set() : new Set(visible.map((entry) => entry.id)));
  }

  function download() {
    if (trace.status !== "ready" || !selectedId) return;
    try {
      const blob = new Blob([exportJson(selectedId, trace.entries)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit-${trace.payment?.gateway_payment_id ?? selectedId}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // downloads unavailable in this environment: nothing to claim
    }
  }

  async function copyJson() {
    if (trace.status !== "ready" || !selectedId) return;
    try {
      await navigator.clipboard.writeText(exportJson(selectedId, trace.entries));
    } catch {
      // clipboard refused: stay silent rather than claim a copy
    }
  }

  const selectStatus = (next: PaymentStatus | null) => {
    setPayments(null);
    setStatus(next);
  };

  return (
    <div>
      <PageHeader
        title="Audit"
        description="A forensic trace of everything the system recorded for a payment, in order."
      />

      <div className="grid grid-cols-1 gap-x-10 gap-y-8 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="min-w-0">
          <PaymentPicker
            payments={payments}
            loading={payments === null}
            error={pickerError}
            status={status}
            selectedId={selectedId}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onStatus={selectStatus}
            onSelect={select}
            onLoadMore={() => void loadMore()}
            onRetry={() => {
              setPickerError(null);
              setPickerToken((token) => token + 1);
            }}
          />
        </div>

        <div className="min-w-0 border-border xl:border-l xl:pl-10">
          {trace.status === "loading" && (
            <div role="status" aria-busy="true" aria-label="Loading trace" className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-64 w-full" />
            </div>
          )}

          {trace.status === "empty" && (
            <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
              <h2 className="text-heading">Nothing to trace yet</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-text-muted">
                Audit events are written as payments move through the pipeline. Run a scenario in the Recovery Lab to
                generate a trace.
              </p>
            </div>
          )}

          {trace.status === "not-found" && (
            <div>
              <h2 className="text-heading">Payment not found</h2>
              <p className="mt-2 text-sm text-text-muted">No payment with this ID exists in your workspace.</p>
            </div>
          )}

          {trace.status === "error" && (
            <ErrorState message={trace.message} onRetry={() => setTraceToken((token) => token + 1)} />
          )}

          {trace.status === "ready" && (
            <div className="space-y-6">
              <TraceHeader payment={trace.payment} summary={summary} />
              {trace.entries.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-text-muted">
                  No audit events have been recorded for this payment.
                </p>
              ) : (
                <>
                  <TraceControls
                    actorCounts={summary.actorCounts}
                    selectedActors={actors}
                    onToggleActor={toggleActor}
                    query={query}
                    onQuery={setQuery}
                    allExpanded={allExpanded}
                    onToggleExpandAll={toggleExpandAll}
                    onExport={download}
                    onCopy={() => void copyJson()}
                    shown={visible.length}
                    total={entries.length}
                  />
                  {visible.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-text-muted">
                      No events match these filters.{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setActors(new Set());
                          setQuery("");
                        }}
                        className="focus-ring rounded text-accent underline underline-offset-4"
                      >
                        Clear filters
                      </button>
                    </p>
                  ) : (
                    <AuditTimeline entries={visible} allEntries={entries} openIds={openIds} onToggle={toggleOpen} />
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
