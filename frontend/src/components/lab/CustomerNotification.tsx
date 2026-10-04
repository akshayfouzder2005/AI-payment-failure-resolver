import { CopyButton } from "../ui/CopyButton";
import { ToneChip } from "../ui/ToneChip";
import { humanizeCode } from "../../lib/format";
import type { NotificationState } from "../../lib/notification";

/**
 * Answers "did the customer get an email, and where did it go?" from the
 * recorded attempt. "Accepted" means the provider took the message (it
 * returned an ID); the backend has no delivery receipts, so the card never
 * claims inbox delivery. When the pipeline chose a different action it says
 * so, naming the action, rather than implying a notification that never
 * happened.
 */
export function CustomerNotification({ state }: { state: NotificationState }) {
  return (
    <section aria-labelledby="notify-title" data-notification={state.kind}>
      <h2 id="notify-title" className="mb-3 text-subhead text-text">
        Customer notification
      </h2>

      <div className="rounded-lg border border-border bg-surface-raised p-4">
        {state.kind === "none" && (
          <p className="text-sm text-text-muted">Run a scenario to see whether the customer is notified.</p>
        )}

        {state.kind === "pending" && (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <ToneChip tone="info" label="In progress" />
            Waiting for the pipeline to record the notification…
          </div>
        )}

        {state.kind === "not-applicable" && (
          <div>
            <ToneChip tone="muted" label="No customer email" />
            <p className="mt-2 text-sm text-text">
              {state.toMerchant
                ? "This run escalated to the merchant, so the email went to the merchant, not the customer."
                : state.action
                  ? `The pipeline chose “${humanizeCode(state.action).toLowerCase()}”, which doesn't email the customer.`
                  : "The pipeline took no action, so nothing was sent."}
            </p>
            <p className="mt-1 text-body-small text-text-muted">
              Only the “send notification” action emails the customer. Which action runs is decided by the AI
              recommendation and the policy gate, not by this screen.
            </p>
          </div>
        )}

        {state.kind === "sent" && (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <ToneChip tone="success" label={state.vendor ? `Accepted by ${state.vendor}` : "Sent"} />
              {state.channel && <span className="text-body-small text-text-muted">{state.channel}</span>}
            </div>
            <dl className="mt-3 space-y-2.5 text-sm">
              <Row label="Sent to">
                {state.recipient ? (
                  <span className="inline-flex items-start gap-2">
                    <span className="break-all font-medium text-text">{state.recipient}</span>
                    <CopyButton value={state.recipient} label="recipient" />
                  </span>
                ) : (
                  <span className="text-text-muted">No address on file</span>
                )}
              </Row>
              {state.reference && (
                <Row label={state.referenceLabel}>
                  <span className="break-all font-mono text-[13px]">{state.reference}</span>
                </Row>
              )}
              {state.message && (
                <Row label="Provider response">
                  <span className="break-words font-mono text-[13px]">{state.message}</span>
                </Row>
              )}
            </dl>
            {state.vendor && (
              <p className="mt-3 text-body-small text-text-muted">
                {state.vendor} accepted the message. Delivery to the inbox isn't confirmed by the backend — check the
                mailbox.
              </p>
            )}
          </div>
        )}

        {state.kind === "failed" && (
          <div role="alert">
            <ToneChip tone="danger" label="Notification failed" />
            <dl className="mt-3 space-y-2.5 text-sm">
              <Row label="Intended for">
                {state.recipient ? <span className="break-all font-medium text-text">{state.recipient}</span> : "No address on file"}
              </Row>
              <Row label={state.vendor ? `${state.vendor} error` : "Error"}>
                <span className="break-words font-mono text-[13px]">{state.error}</span>
              </Row>
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
      <dt className="w-36 shrink-0 text-text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-text">{children}</dd>
    </div>
  );
}
