import { Link } from "react-router-dom";
import { formatDateTime, formatElapsedMs } from "../../lib/format";
import type { AuditSummary } from "../../lib/audit";
import { Amount } from "../ui/Amount";
import { CopyButton } from "../ui/CopyButton";
import { StatusChip } from "../ui/StatusChip";
import type { PaymentRead } from "../../types/api";

/** The subject of the trace and its measured extent — all from real records. */
export function TraceHeader({ payment, summary }: { payment: PaymentRead | null; summary: AuditSummary }) {
  return (
    <header className="border-b border-border pb-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="text-label uppercase text-text-muted">Trace subject</div>
          {payment ? (
            <>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-heading">
                  <Amount amount={payment.amount} currency={payment.currency} />
                </span>
                <StatusChip status={payment.status} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="break-all font-mono text-[13px] text-text">{payment.id}</span>
                <CopyButton value={payment.id} label="payment ID" />
              </div>
              <div className="mt-1 font-mono text-[11px] text-text-muted">{payment.gateway_payment_id}</div>
            </>
          ) : (
            <div className="mt-1 text-sm text-text-muted">Payment details unavailable.</div>
          )}
        </div>
        {payment && (
          <Link
            to={`/app/payments/${payment.id}`}
            className="focus-ring rounded text-body-small font-medium text-accent underline decoration-border-strong underline-offset-4 hover:decoration-accent"
          >
            Open payment
          </Link>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <Stat label="Events" value={String(summary.count)} />
        <Stat label="Trace span" value={summary.spanMs === null ? "—" : formatElapsedMs(summary.spanMs)} />
        <Stat label="First event" value={summary.startedAt ? formatDateTime(summary.startedAt) : "—"} mono />
        <Stat label="Last event" value={summary.endedAt ? formatDateTime(summary.endedAt) : "—"} mono />
      </dl>
    </header>
  );
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-label uppercase text-text-muted">{label}</dt>
      <dd className={`mt-1 text-sm text-text ${mono ? "font-mono text-xs" : "font-medium tabular-nums"}`}>{value}</dd>
    </div>
  );
}
