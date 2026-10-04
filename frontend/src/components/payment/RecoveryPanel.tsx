import { formatDateTime, formatElapsedMs, humanizeCode } from "../../lib/format";
import {
  describeNotification,
  elapsedBetween,
  extractPaymentLink,
  LINK_ACTIONS,
  type ChainNode,
  type Run,
} from "../../lib/investigation";
import { CopyButton } from "../ui/CopyButton";
import { Field, IdValue } from "../ui/Field";
import { KindBadge } from "../ui/KindBadge";
import { StatusChip } from "../ui/StatusChip";
import { DetailSection } from "./DetailSection";
import { StepEmpty } from "./StepEmpty";
import { RerunRecovery } from "./RerunRecovery";
import type { PaymentRead, RecoveryAttemptRead } from "../../types/api";

/**
 * What the system actually did, and what came back. The result block is
 * action-specific but always built from the executor's own recorded output:
 * the gateway's message and (for links) its URL, the notification
 * provider's message and message ID, or the error. Nothing is paraphrased
 * into a friendlier claim than the backend made.
 */
export function RecoveryPanel({
  run,
  node,
  stopMessage,
  customer,
  onRerun,
}: {
  run: Run | null;
  node: ChainNode;
  stopMessage: string | null;
  customer: PaymentRead["customer"];
  /** present only when a manual re-run makes sense (a decision exists, nothing is mid-flight) */
  onRerun?: () => Promise<{ message: string; replay: boolean }>;
}) {
  const attempt = run?.attempt ?? null;

  return (
    <DetailSection
      id="recovery"
      title="Recovery"
      badge={<KindBadge kind="executor" />}
      aside={attempt ? <span>Attempt #{attempt.attempt_number}</span> : undefined}
    >
      {!attempt ? (
        <StepEmpty node={node} noun="Recovery action" stopMessage={stopMessage} />
      ) : (
        <div className="rounded-lg border border-border bg-surface-raised p-5">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div>
              <div className="text-label uppercase text-text-muted">Action taken</div>
              <div className="mt-1 text-heading text-text">{humanizeCode(attempt.action_type)}</div>
              <div className="mt-0.5 font-mono text-xs text-text-muted">{attempt.action_type}</div>
            </div>
            <StatusChip status={attempt.status} />
          </div>

          <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-3">
            <Field label="Started">
              {attempt.started_at ? <time dateTime={attempt.started_at}>{formatDateTime(attempt.started_at)}</time> : "—"}
            </Field>
            <Field label="Completed">
              {attempt.completed_at ? (
                <time dateTime={attempt.completed_at}>{formatDateTime(attempt.completed_at)}</time>
              ) : (
                "—"
              )}
            </Field>
            <Field label="Duration">
              {(() => {
                const ms = elapsedBetween(attempt.started_at, attempt.completed_at);
                return ms === null ? "—" : <span className="tabular-nums">{formatElapsedMs(ms)}</span>;
              })()}
            </Field>
          </dl>

          <ActionResult attempt={attempt} customer={customer} />
          {onRerun && <RerunRecovery recipient={customer?.email ?? customer?.phone ?? null} onRun={onRerun} />}
        </div>
      )}
    </DetailSection>
  );
}

function ActionResult({ attempt, customer }: { attempt: RecoveryAttemptRead; customer: PaymentRead["customer"] }) {
  const link = extractPaymentLink(attempt);
  const notification = describeNotification(attempt);
  const isLinkAction = (LINK_ACTIONS as readonly string[]).includes(attempt.action_type);

  return (
    <div className="mt-5 space-y-4 border-t border-border pt-5">
      {isLinkAction && link && (
        <div>
          <div className="text-label uppercase text-text-muted">Payment link</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {link.simulated ? (
              <>
                <span className="break-all font-mono text-[13px] text-text">{link.url}</span>
                <span className="rounded border border-border px-1.5 py-0.5 text-label uppercase text-text-muted">
                  Simulated — not a live link
                </span>
              </>
            ) : (
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring break-all rounded font-mono text-[13px] text-accent underline decoration-border-strong underline-offset-4 transition-colors duration-150 hover:decoration-accent"
              >
                {link.url}
              </a>
            )}
            <CopyButton value={link.url} label="payment link" />
          </div>
          {attempt.action_type === "RETRY_PAYMENT" && !link.simulated && (
            <p className="mt-2 max-w-xl text-body-small text-text-muted">
              Razorpay has no endpoint to retry a failed payment. “Retry” issued this new Payment Link for the customer
              to complete.
            </p>
          )}
        </div>
      )}

      {notification && (
        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Audience">{notification.audience}</Field>
          <Field label="Channel">{notification.channel ?? "—"}</Field>
          <Field label="Provider">{notification.vendor ?? "—"}</Field>
          <Field label="Recipient">{recipientFor(notification, customer)}</Field>
        </dl>
      )}

      {attempt.result_message && (
        <div>
          <div className="text-label uppercase text-text-muted">
            {notification?.vendor
              ? `${notification.vendor} response`
              : isLinkAction
                ? "Gateway response"
                : "Result"}
          </div>
          <p className="mt-1.5 break-words rounded border border-border bg-surface px-3 py-2 font-mono text-[13px] leading-5 text-text">
            {attempt.result_message}
          </p>
        </div>
      )}

      {attempt.external_reference && (
        <Field label={notification?.referenceLabel ?? (isLinkAction ? "Gateway reference" : "Provider reference")}>
          <IdValue value={attempt.external_reference} label="provider reference" />
        </Field>
      )}

      {attempt.error_message && (
        <div role="alert" className="rounded border border-danger/40 bg-danger/10 px-3 py-2.5">
          <div className="text-label uppercase text-danger">Error</div>
          <p className="mt-1 break-words font-mono text-[13px] leading-5 text-text">{attempt.error_message}</p>
        </div>
      )}

      {!attempt.result_message && !attempt.external_reference && !attempt.error_message && (
        <p className="text-sm text-text-muted">
          {attempt.status === "pending" || attempt.status === "in_progress"
            ? "No result yet — the action has not finished."
            : "The executor recorded no result for this attempt."}
        </p>
      )}
    </div>
  );
}

/**
 * The address the notification went to. For customers it is the contact on
 * the payment's customer record (what the executor reads); a merchant
 * escalation goes to a server-configured address the API doesn't expose, so
 * it says that rather than guessing one.
 */
function recipientFor(notification: NonNullable<ReturnType<typeof describeNotification>>, customer: PaymentRead["customer"]) {
  if (notification.audience === "Merchant") return <span className="text-text-muted">Merchant address (server config)</span>;
  const value =
    notification.channel === "SMS"
      ? customer?.phone
      : notification.channel === "Email"
        ? customer?.email
        : (customer?.email ?? customer?.phone);
  return value ? <span className="break-all font-mono text-[13px]">{value}</span> : <span className="text-text-muted">None on file</span>;
}
