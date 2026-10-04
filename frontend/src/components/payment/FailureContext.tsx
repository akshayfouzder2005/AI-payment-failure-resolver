import { humanizeCode } from "../../lib/format";
import type { PaymentRead } from "../../types/api";

/**
 * Why the gateway says this payment failed — its own code and message,
 * verbatim. This is the one place on the page that is purely observed
 * fact; the AI's interpretation of it is a separate, labelled advisory
 * section. The counts below are of records the backend actually holds.
 */
export function FailureContext({
  payment,
  diagnosisCount,
  attemptCount,
}: {
  payment: PaymentRead;
  diagnosisCount: number | null;
  attemptCount: number | null;
}) {
  return (
    <section id="failure-context" aria-labelledby="failure-context-title" className="scroll-mt-6">
      <h2 id="failure-context-title" className="mb-4 text-subhead text-text">
        Failure context
      </h2>

      <div className="rounded-lg border border-danger/30 bg-danger/5 p-4">
        <div className="text-label uppercase text-danger">Gateway failure code</div>
        {payment.failure_code ? (
          <>
            <div className="mt-1 break-all font-mono text-sm font-medium text-text">{payment.failure_code}</div>
            <div className="mt-0.5 text-body-small text-text-muted">{humanizeCode(payment.failure_code)}</div>
          </>
        ) : (
          <div className="mt-1 text-sm text-text-muted">The gateway did not report a failure code.</div>
        )}

        <div className="mt-4 text-label uppercase text-danger">Gateway message</div>
        <p className="mt-1 break-words text-sm text-text">
          {payment.failure_message ?? <span className="text-text-muted">No message was provided.</span>}
        </p>
      </div>

      <dl className="mt-4 divide-y divide-border border-y border-border">
        <CountRow label="AI diagnoses on record" value={diagnosisCount} />
        <CountRow label="Recovery attempts" value={attemptCount} />
      </dl>
    </section>
  );
}

function CountRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="text-sm font-medium tabular-nums text-text">{value === null ? "—" : value}</dd>
    </div>
  );
}
