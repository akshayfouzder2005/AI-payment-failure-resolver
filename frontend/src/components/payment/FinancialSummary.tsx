import { Field, IdValue, Missing } from "../ui/Field";
import { Amount } from "../ui/Amount";
import { StatusChip } from "../ui/StatusChip";
import { formatDateTime } from "../../lib/format";
import type { PaymentRead } from "../../types/api";

/**
 * The ledger facts, exactly as stored: precise amount, both identifiers
 * (ours and the gateway's, copyable), customer contact, and the three
 * timestamps. No derived or interpreted values live here — interpretation
 * belongs to the AI and policy sections.
 */
export function FinancialSummary({ payment }: { payment: PaymentRead }) {
  const customer = payment.customer;

  return (
    <section id="financial-summary" aria-labelledby="financial-summary-title" className="scroll-mt-6">
      <h2 id="financial-summary-title" className="mb-4 text-subhead text-text">
        Financial summary
      </h2>

      {/* Dense on purpose: identifiers side by side, then three-up facts, so
          the Decision Chain below starts inside the first screen. */}
      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        <Field label="Payment ID">
          <IdValue value={payment.id} label="payment ID" />
        </Field>
        <Field label="Gateway payment ID">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <IdValue value={payment.gateway_payment_id} label="gateway payment ID" />
            <span className="rounded border border-border px-1.5 py-0.5 text-label uppercase text-text-muted">
              {payment.gateway}
            </span>
          </span>
        </Field>
      </dl>

      <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 border-t border-border pt-4 sm:grid-cols-3">
        <Field label="Amount">
          <Amount amount={payment.amount} currency={payment.currency} />
          <span className="ml-2 font-mono text-xs text-text-muted">{payment.currency}</span>
        </Field>
        <Field label="Status">
          <StatusChip status={payment.status} />
        </Field>
        <Field label="Merchant">
          <span className="break-all font-mono text-[13px]">{payment.merchant_id}</span>
        </Field>

        <Field label="Customer">{customer?.name ?? <Missing />}</Field>
        <Field label="Email">
          {customer?.email ? <span className="break-all">{customer.email}</span> : <Missing />}
        </Field>
        <Field label="Phone">
          {customer?.phone ? <span className="font-mono text-[13px]">{customer.phone}</span> : <Missing />}
        </Field>
      </dl>

      <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 border-t border-border pt-4 sm:grid-cols-3">
        <Field label="Original transaction">
          {payment.original_transaction_at ? <TimeValue iso={payment.original_transaction_at} /> : <Missing />}
        </Field>
        <Field label="Recorded">
          <TimeValue iso={payment.created_at} />
        </Field>
        <Field label="Last updated">
          <TimeValue iso={payment.updated_at} />
        </Field>
      </dl>
    </section>
  );
}

function TimeValue({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} className="tabular-nums">
      {formatDateTime(iso)}
    </time>
  );
}
