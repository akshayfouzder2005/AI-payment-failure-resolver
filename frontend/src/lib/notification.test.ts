import { describe, expect, it } from "vitest";
import { deriveNotification } from "./notification";
import { buildRuns } from "./investigation";
import type { PipelineSnapshot } from "./pipelineTracker";
import { makeAttempt, makeDecision, makePayment } from "../test/fixtures";
import type { RecoveryAttemptRead } from "../types/api";

function snap(attempt: Partial<RecoveryAttemptRead> | null, extra: Partial<PipelineSnapshot> = {}): PipelineSnapshot {
  const attempts = attempt ? [makeAttempt(attempt)] : [];
  return {
    payment: makePayment({ customer: { id: "c", name: "A", email: "ananya@gmail.com", phone: "+919800000001" } }),
    decisions: [makeDecision()],
    attempts,
    audit: [],
    runs: buildRuns([makeDecision()], attempts),
    settled: true,
    stopped: false,
    timedOut: false,
    error: null,
    reads: 1,
    ...extra,
  };
}

describe("deriveNotification", () => {
  it("is none before there is a payment", () => {
    expect(deriveNotification(null)).toEqual({ kind: "none" });
    expect(deriveNotification({ ...snap(null), payment: null })).toEqual({ kind: "none" });
  });

  it("reports a Brevo email as accepted, addressed to the customer's email on file, with the message ID", () => {
    const state = deriveNotification(
      snap({ action_type: "SEND_NOTIFICATION", result_message: "Email sent to ananya@gmail.com via Brevo.", external_reference: "<msg-1@brevo>" }),
    );
    expect(state).toEqual({
      kind: "sent",
      recipient: "ananya@gmail.com",
      channel: "Email",
      vendor: "Brevo",
      referenceLabel: "Brevo message ID",
      reference: "<msg-1@brevo>",
      message: "Email sent to ananya@gmail.com via Brevo.",
    });
  });

  it("addresses a Twilio SMS to the phone number, not the email", () => {
    const state = deriveNotification(
      snap({ action_type: "SEND_NOTIFICATION", result_message: "SMS sent to +919800000001 via Twilio.", external_reference: "SM1" }),
    );
    expect(state).toMatchObject({ kind: "sent", recipient: "+919800000001", channel: "SMS", vendor: "Twilio" });
  });

  it("does not name a vendor for a mock-provider result", () => {
    const state = deriveNotification(
      snap({ action_type: "SEND_NOTIFICATION", result_message: "Mock email notification sent to customer (a@b.co).", external_reference: "mock_1" }),
    );
    expect(state).toMatchObject({ kind: "sent", vendor: null, channel: null, referenceLabel: "Provider reference" });
  });

  it("reports a failed notification with the executor's error and the intended recipient", () => {
    const state = deriveNotification(
      snap({ action_type: "SEND_NOTIFICATION", status: "failed", result_message: null, error_message: "Brevo returned 400 sending email: invalid sender" }),
    );
    expect(state).toEqual({ kind: "failed", recipient: "ananya@gmail.com", vendor: null, error: "Brevo returned 400 sending email: invalid sender" });
  });

  it("says the customer was not emailed when the pipeline chose another action", () => {
    expect(deriveNotification(snap({ action_type: "SEND_PAYMENT_LINK" }))).toEqual({
      kind: "not-applicable",
      action: "SEND_PAYMENT_LINK",
      toMerchant: false,
    });
    expect(deriveNotification(snap({ action_type: "NO_ACTION", status: "skipped" }))).toMatchObject({ kind: "not-applicable" });
  });

  it("distinguishes an escalation: that email goes to the merchant", () => {
    expect(deriveNotification(snap({ action_type: "ESCALATE_TO_MERCHANT" }))).toEqual({
      kind: "not-applicable",
      action: "ESCALATE_TO_MERCHANT",
      toMerchant: true,
    });
  });

  it("is pending while the attempt is executing or the pipeline is still going", () => {
    expect(deriveNotification(snap({ action_type: "SEND_NOTIFICATION", status: "in_progress" }, { settled: false }))).toEqual({ kind: "pending" });
    expect(deriveNotification(snap(null, { settled: false }))).toEqual({ kind: "pending" });
  });

  it("says nothing was sent when the run ended without any action", () => {
    expect(deriveNotification(snap(null, { settled: true }))).toEqual({ kind: "not-applicable", action: null, toMerchant: false });
  });
});
