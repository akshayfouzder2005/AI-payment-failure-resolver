/**
 * What happened to the customer notification for a pipeline run, derived only
 * from the recorded attempt and the customer on file. Used by the Recovery
 * Lab to answer the question the trace alone doesn't: "did the customer get
 * an email, and where did it go?"
 *
 * "sent" means the provider ACCEPTED the message (Brevo returns a message ID
 * on acceptance); the backend has no delivery receipts, so nothing here
 * claims the message reached an inbox.
 */
import { describeNotification } from "./investigation";
import type { PipelineSnapshot } from "./pipelineTracker";

export type NotificationState =
  | { kind: "none" }
  | { kind: "pending" }
  | {
      kind: "sent";
      recipient: string | null;
      channel: "Email" | "SMS" | null;
      vendor: "Brevo" | "Twilio" | null;
      referenceLabel: string;
      reference: string | null;
      message: string | null;
    }
  | { kind: "failed"; recipient: string | null; vendor: "Brevo" | "Twilio" | null; error: string }
  | { kind: "not-applicable"; action: string | null; toMerchant: boolean };

export function deriveNotification(snapshot: PipelineSnapshot | null): NotificationState {
  if (!snapshot || !snapshot.payment) return { kind: "none" };

  const run = snapshot.runs[snapshot.runs.length - 1] ?? null;
  const attempt = run?.attempt ?? null;
  const inFlight = !snapshot.settled && !snapshot.stopped && !snapshot.timedOut;

  if (!attempt) {
    return inFlight ? { kind: "pending" } : { kind: "not-applicable", action: null, toMerchant: false };
  }

  if (attempt.action_type === "ESCALATE_TO_MERCHANT") {
    if (attempt.status === "pending" || attempt.status === "in_progress") return { kind: "pending" };
    return { kind: "not-applicable", action: attempt.action_type, toMerchant: true };
  }
  if (attempt.action_type !== "SEND_NOTIFICATION") {
    return { kind: "not-applicable", action: attempt.action_type, toMerchant: false };
  }
  if (attempt.status === "pending" || attempt.status === "in_progress") return { kind: "pending" };
  if (attempt.status === "skipped") return { kind: "not-applicable", action: attempt.action_type, toMerchant: false };

  const detail = describeNotification(attempt);
  const customer = snapshot.payment.customer;
  // The executor emails when an email is on file, otherwise texts; the vendor's
  // own message tells us which actually happened when it names one.
  const recipient =
    detail?.channel === "SMS"
      ? (customer?.phone ?? null)
      : detail?.channel === "Email"
        ? (customer?.email ?? null)
        : (customer?.email ?? customer?.phone ?? null);

  if (attempt.status === "failed") {
    return {
      kind: "failed",
      recipient,
      vendor: detail?.vendor ?? null,
      error: attempt.error_message ?? attempt.result_message ?? "The notification could not be sent.",
    };
  }

  return {
    kind: "sent",
    recipient,
    channel: detail?.channel ?? null,
    vendor: detail?.vendor ?? null,
    referenceLabel: detail?.referenceLabel ?? "Provider reference",
    reference: attempt.external_reference,
    message: attempt.result_message,
  };
}
