import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PaymentDetailPage } from "./PaymentDetailPage";
import * as api from "../lib/api";
import {
  ATTEMPT_ID,
  PAYMENT_ID,
  makeAttempt,
  makeAudit,
  makeDecision,
  makePayment,
} from "../test/fixtures";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    getPayment: vi.fn(),
    listAIDecisions: vi.fn(),
    listRecoveryAttempts: vi.fn(),
    getPaymentAuditTimeline: vi.fn(),
    executeRecovery: vi.fn(),
  };
});

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/app/payments/${PAYMENT_ID}`]}>
      <Routes>
        <Route path="/app/payments/:paymentId" element={<PaymentDetailPage />} />
        <Route path="/app/payments" element={<div>Payments List</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockAll(opts: {
  payment?: ReturnType<typeof makePayment>;
  decisions?: ReturnType<typeof makeDecision>[];
  attempts?: ReturnType<typeof makeAttempt>[];
  audit?: ReturnType<typeof makeAudit>[];
}) {
  vi.mocked(api.getPayment).mockResolvedValue(opts.payment ?? makePayment());
  vi.mocked(api.listAIDecisions).mockResolvedValue(opts.decisions ?? [makeDecision()]);
  vi.mocked(api.listRecoveryAttempts).mockResolvedValue(opts.attempts ?? [makeAttempt()]);
  vi.mocked(api.getPaymentAuditTimeline).mockResolvedValue(opts.audit ?? [makeAudit()]);
}

const node = (key: string) => document.querySelector(`[data-node="${key}"]`) as HTMLElement;

beforeEach(() => {
  vi.mocked(api.getPayment).mockReset();
  vi.mocked(api.listAIDecisions).mockReset();
  vi.mocked(api.listRecoveryAttempts).mockReset();
  vi.mocked(api.getPaymentAuditTimeline).mockReset();
  vi.mocked(api.executeRecovery).mockReset();
});
afterEach(() => vi.clearAllMocks());

describe("PaymentDetailPage — summary", () => {
  it("renders the precise amount, both identifiers and the customer", async () => {
    mockAll({});
    renderDetail();

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("₹12,999.00");

    const summary = screen.getByRole("region", { name: "Financial summary" });
    expect(within(summary).getByText(PAYMENT_ID)).toBeInTheDocument();
    expect(within(summary).getByText("pay_Qx7demo0001")).toBeInTheDocument();
    expect(within(summary).getByText("Ananya Rao")).toBeInTheDocument();
    expect(within(summary).getByText("ananya@example.com")).toBeInTheDocument();
  });

  it("shows the gateway's own failure code and message", async () => {
    mockAll({});
    renderDetail();

    const failure = await screen.findByRole("region", { name: "Failure context" });
    expect(within(failure).getByText("CARD_DECLINED")).toBeInTheDocument();
    expect(within(failure).getByText("Card declined by issuer")).toBeInTheDocument();
  });

  it("shows a not-found state for a 404", async () => {
    vi.mocked(api.getPayment).mockRejectedValue(new api.ApiError(404, "Payment not found"));
    vi.mocked(api.listAIDecisions).mockResolvedValue([]);
    vi.mocked(api.listRecoveryAttempts).mockResolvedValue([]);
    vi.mocked(api.getPaymentAuditTimeline).mockRejectedValue(new api.ApiError(404, "nf"));
    renderDetail();

    await screen.findByText("Payment not found");
    expect(screen.getByRole("link", { name: "Back to payments" })).toHaveAttribute("href", "/app/payments");
  });

  it("shows the real error with retry for a non-404 payment failure", async () => {
    vi.mocked(api.getPayment).mockRejectedValueOnce(new api.ApiError(500, "Internal server error"));
    vi.mocked(api.listAIDecisions).mockResolvedValue([]);
    vi.mocked(api.listRecoveryAttempts).mockResolvedValue([]);
    vi.mocked(api.getPaymentAuditTimeline).mockResolvedValue([]);
    renderDetail();

    await screen.findByText("Internal server error");
    vi.mocked(api.getPayment).mockResolvedValue(makePayment());
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("heading", { level: 1 });
  });
});

describe("PaymentDetailPage — Decision Chain", () => {
  it("reflects a fully recorded run, with AI advisory and policy authoritative", async () => {
    mockAll({});
    renderDetail();
    await screen.findByRole("region", { name: "Decision Chain" });

    expect(node("ai")).toHaveAttribute("data-kind", "advisory");
    expect(node("policy")).toHaveAttribute("data-kind", "authoritative");
    expect(node("ai")).toHaveTextContent("Recommends retry payment");
    expect(node("policy")).toHaveTextContent("Approved");
    expect(node("execution")).toHaveTextContent("Success");
    expect(node("outcome")).toHaveTextContent("Recovered");
    expect(["failure", "ai", "policy", "execution", "outcome"].map((k) => node(k).dataset.phase)).toEqual([
      "done", "done", "done", "done", "done",
    ]);
  });

  it("does not fake states: a payment with nothing recorded and no live pipeline reads 'Not run'", async () => {
    mockAll({
      payment: makePayment({ status: "failed", created_at: "2020-01-01T00:00:00Z", updated_at: "2020-01-01T00:00:00Z" }),
      decisions: [],
      attempts: [],
      audit: [],
    });
    renderDetail();
    await screen.findByRole("region", { name: "Decision Chain" });

    for (const key of ["ai", "policy", "execution"]) {
      expect(node(key).dataset.phase).toBe("idle");
      expect(node(key)).toHaveTextContent("Not run");
    }
    expect(screen.queryByText("Updating live")).not.toBeInTheDocument();
  });

  it("shows the pipeline as running and live for a fresh payment with nothing recorded yet", async () => {
    const now = new Date().toISOString();
    mockAll({ payment: makePayment({ status: "failed", created_at: now, updated_at: now }), decisions: [], attempts: [], audit: [] });
    renderDetail();
    await screen.findByRole("region", { name: "Decision Chain" });

    expect(node("ai").dataset.phase).toBe("running");
    expect(node("policy").dataset.phase).toBe("waiting");
    expect(screen.getByText("Updating live")).toBeInTheDocument();
  });

  it("shows 'stopped' with the backend's own explanation when the pipeline logged processing_stopped", async () => {
    const now = new Date().toISOString();
    mockAll({
      payment: makePayment({ status: "failed", created_at: now, updated_at: now }),
      decisions: [],
      attempts: [],
      audit: [makeAudit({ action: "processing_stopped", details: { message: "Pipeline stopped unexpectedly after ingestion." } })],
    });
    renderDetail();
    await screen.findByRole("region", { name: "Decision Chain" });

    expect(node("ai").dataset.phase).toBe("stopped");
    const aiSection = screen.getByRole("region", { name: "AI decision" });
    expect(within(aiSection).getByText("Pipeline stopped unexpectedly after ingestion.")).toBeInTheDocument();
    expect(screen.queryByText("Updating live")).not.toBeInTheDocument();
  });

  it("links each node to the section that holds its detail", async () => {
    mockAll({});
    renderDetail();
    await screen.findByRole("region", { name: "Decision Chain" });

    expect(within(node("ai")).getByRole("link")).toHaveAttribute("href", "#ai-decision");
    expect(within(node("policy")).getByRole("link")).toHaveAttribute("href", "#policy-gate");
    expect(within(node("execution")).getByRole("link")).toHaveAttribute("href", "#recovery");
  });

  it("lets you inspect an earlier run when there are several", async () => {
    const d1 = makeDecision({ id: "d1", recommended_action: "SEND_NOTIFICATION", created_at: "2026-10-03T09:00:01Z" });
    const d2 = makeDecision({ id: "d2", recommended_action: "ESCALATE_TO_MERCHANT", created_at: "2026-10-03T10:00:01Z" });
    const a1 = makeAttempt({ id: "a1", ai_decision_id: "d1", action_type: "SEND_NOTIFICATION", created_at: "2026-10-03T09:00:02Z", result_message: "Email sent to a@b.test via Brevo." });
    const a2 = makeAttempt({ id: "a2", ai_decision_id: "d2", action_type: "ESCALATE_TO_MERCHANT", attempt_number: 2, created_at: "2026-10-03T10:00:02Z", result_message: "Email sent to ops@x.test via Brevo." });
    mockAll({ decisions: [d1, d2], attempts: [a1, a2] });
    renderDetail();
    await screen.findByRole("region", { name: "Decision Chain" });

    // Latest run selected by default.
    expect(node("ai")).toHaveTextContent("escalate to merchant");

    await userEvent.click(within(screen.getByRole("group", { name: "Pipeline run" })).getByRole("button", { name: "1" }));
    expect(node("ai")).toHaveTextContent("send notification");
    expect(node("execution")).toHaveTextContent("Send notification");
  });
});

describe("PaymentDetailPage — AI decision", () => {
  it("shows category, root cause, reasoning, meters, risk factors and the raw output", async () => {
    mockAll({});
    renderDetail();

    const ai = await screen.findByRole("region", { name: "AI decision" });
    expect(within(ai).getByText("Advisory · AI")).toBeInTheDocument();
    expect(within(ai).getByText("Card declined")).toBeInTheDocument();
    expect(within(ai).getByText(/temporary limit/)).toBeInTheDocument();
    expect(within(ai).getByRole("meter", { name: "Recovery probability" })).toHaveAttribute("aria-valuenow", "0.725");
    expect(within(ai).getByText("72.5%")).toBeInTheDocument();
    expect(within(ai).getByText("88%")).toBeInTheDocument();
    expect(within(ai).getByText("first_failure")).toBeInTheDocument();
    expect(within(ai).getByText(/"confidence": 0.88/)).toBeInTheDocument();
  });

  it("says plainly when the decision is the deterministic fallback", async () => {
    mockAll({
      decisions: [makeDecision({ model_name: "fallback-deterministic", confidence: "0.000", recovery_probability: "0.000", recommended_action: "ESCALATE_TO_MERCHANT", risk_factors: ["fallback_decision_used"], raw_response: null, reason: "LLM provider error: timeout" })],
      attempts: [makeAttempt({ action_type: "ESCALATE_TO_MERCHANT", policy_decision: "ESCALATE", result_message: "Email sent to ops@x.test via Brevo." })],
    });
    renderDetail();

    const ai = await screen.findByRole("region", { name: "AI decision" });
    expect(within(ai).getByRole("note")).toHaveTextContent("This is not a model diagnosis.");
    expect(node("ai")).toHaveTextContent("Fallback");
  });
});

describe("PaymentDetailPage — Policy gate", () => {
  it("shows the verdict, the override, and the rule the audit trail cites", async () => {
    mockAll({
      decisions: [makeDecision({ recommended_action: "RETRY_PAYMENT" })],
      attempts: [makeAttempt({ action_type: "SEND_PAYMENT_LINK", policy_decision: "MODIFY", policy_reason: "Amount exceeds the high-value auto-retry threshold." })],
      audit: [
        makeAudit({
          id: "pol",
          entity_type: "RecoveryAttempt",
          entity_id: ATTEMPT_ID,
          action: "policy_decision_recorded",
          actor: "system",
          details: { message: "Policy engine MODIFY", violated_rules: ["HIGH_VALUE_AUTO_RETRY_DISALLOWED"] },
        }),
      ],
    });
    renderDetail();

    const policy = await screen.findByRole("region", { name: "Policy gate" });
    expect(within(policy).getByText("Authoritative · Policy")).toBeInTheDocument();
    expect(within(policy).getByText("Modified")).toBeInTheDocument();
    expect(within(policy).getByText("Overrides AI")).toBeInTheDocument();
    expect(within(policy).getByText("Amount exceeds the high-value auto-retry threshold.")).toBeInTheDocument();
    expect(within(policy).getByText("HIGH_VALUE_AUTO_RETRY_DISALLOWED")).toBeInTheDocument();
  });

  it("says 'none' only when the engine recorded an empty rule list, and 'not recorded' when it can't tell", async () => {
    mockAll({
      audit: [makeAudit({ entity_type: "RecoveryAttempt", entity_id: ATTEMPT_ID, action: "policy_decision_recorded", details: { message: "x", violated_rules: [] } })],
    });
    const { unmount } = renderDetail();
    expect(await screen.findByText(/None — every deterministic check passed/)).toBeInTheDocument();
    unmount();

    mockAll({ audit: [makeAudit()] });
    renderDetail();
    expect(await screen.findByText("Not recorded in the audit trail.")).toBeInTheDocument();
  });
});

describe("PaymentDetailPage — Recovery", () => {
  it("shows a real payment link as a safe external link and explains what 'retry' did", async () => {
    mockAll({});
    renderDetail();

    const recovery = await screen.findByRole("region", { name: "Recovery" });
    const link = within(recovery).getByRole("link", { name: "https://rzp.io/i/AbC123" });
    expect(link).toHaveAttribute("href", "https://rzp.io/i/AbC123");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(within(recovery).getByText(/no endpoint to retry a failed payment/)).toBeInTheDocument();
    expect(within(recovery).getByText("plink_Qx7ABC")).toBeInTheDocument();
    expect(within(recovery).getByRole("button", { name: "Copy payment link" })).toBeInTheDocument();
  });

  it("does not make a clickable link out of the mock gateway's URL", async () => {
    mockAll({
      attempts: [makeAttempt({ action_type: "SEND_PAYMENT_LINK", result_message: "Mock gateway created a simulated payment link for 100 INR: https://mock.razorpay.link/mock_plink_ab12" })],
    });
    renderDetail();

    const recovery = await screen.findByRole("region", { name: "Recovery" });
    expect(within(recovery).queryByRole("link", { name: /mock\.razorpay\.link/ })).not.toBeInTheDocument();
    expect(within(recovery).getByText("Simulated — not a live link")).toBeInTheDocument();
  });

  it("shows the actual Brevo result and message ID for an email notification", async () => {
    mockAll({
      decisions: [makeDecision({ recommended_action: "SEND_NOTIFICATION" })],
      attempts: [makeAttempt({ action_type: "SEND_NOTIFICATION", result_message: "Email sent to ananya@example.com via Brevo.", external_reference: "<202610030900.1@smtp-relay.brevo.com>" })],
    });
    renderDetail();

    const recovery = await screen.findByRole("region", { name: "Recovery" });
    expect(within(recovery).getByText("Email sent to ananya@example.com via Brevo.")).toBeInTheDocument();
    expect(within(recovery).getByText("Brevo response")).toBeInTheDocument();
    expect(within(recovery).getByText("Brevo message ID")).toBeInTheDocument();
    expect(within(recovery).getByText("<202610030900.1@smtp-relay.brevo.com>")).toBeInTheDocument();
    expect(within(recovery).getByText("Customer")).toBeInTheDocument();
    expect(within(recovery).getByText("Email")).toBeInTheDocument();
  });

  it("shows the actual Twilio result and SID for an SMS", async () => {
    mockAll({
      attempts: [makeAttempt({ action_type: "SEND_NOTIFICATION", result_message: "SMS sent to +919800000001 via Twilio.", external_reference: "SM0123456789abcdef" })],
    });
    renderDetail();

    const recovery = await screen.findByRole("region", { name: "Recovery" });
    expect(within(recovery).getByText("Twilio message SID")).toBeInTheDocument();
    expect(within(recovery).getByText("SM0123456789abcdef")).toBeInTheDocument();
    expect(within(recovery).getByText("SMS")).toBeInTheDocument();
  });

  it("shows the executor's error for a failed action and marks the node failed", async () => {
    mockAll({
      payment: makePayment({ status: "failed" }),
      attempts: [makeAttempt({ status: "failed", result_message: null, external_reference: null, error_message: "Razorpay returned 400 creating a payment link" })],
    });
    renderDetail();

    const recovery = await screen.findByRole("region", { name: "Recovery" });
    expect(within(recovery).getByRole("alert")).toHaveTextContent("Razorpay returned 400 creating a payment link");
    expect(node("execution")).toHaveTextContent("Failed");
    expect(node("outcome")).toHaveTextContent("Failed");
  });

  it("shows a skipped NO_ACTION result as recorded", async () => {
    mockAll({
      payment: makePayment({ status: "failed" }),
      decisions: [makeDecision({ recommended_action: "RETRY_PAYMENT" })],
      attempts: [makeAttempt({ action_type: "NO_ACTION", status: "skipped", policy_decision: "MODIFY", result_message: "No recovery action taken. Retry delay has not elapsed.", external_reference: null })],
    });
    renderDetail();

    const recovery = await screen.findByRole("region", { name: "Recovery" });
    expect(within(recovery).getByText("No recovery action taken. Retry delay has not elapsed.")).toBeInTheDocument();
    expect(within(recovery).getByText("Skipped")).toBeInTheDocument();
  });
});

describe("PaymentDetailPage — Audit trail", () => {
  it("lists every event with actor, raw action name, and expandable details", async () => {
    mockAll({
      audit: [
        makeAudit({ id: "a1", action: "ai_decision_created", actor: "ai_engine", details: { message: "AI decision created", model_name: "openai/gpt-oss-20b" }, created_at: "2026-10-03T09:00:01.000Z" }),
        makeAudit({ id: "a2", action: "action_approved", actor: "policy_engine", details: { message: "Policy verdict APPROVE" }, created_at: "2026-10-03T09:00:01.600Z" }),
      ],
    });
    renderDetail();

    const audit = await screen.findByRole("region", { name: "Audit trail" });
    expect(within(audit).getByText("2 events")).toBeInTheDocument();
    expect(within(audit).getByText("AI decision created", { selector: "span.text-sm" })).toBeInTheDocument();
    expect(within(audit).getByText("ai_engine")).toBeInTheDocument();
    expect(within(audit).getByText("policy_engine")).toBeInTheDocument();
    expect(within(audit).getByText("model_name")).toBeInTheDocument();
    expect(within(audit).getByText(/\+600ms/)).toBeInTheDocument();
  });

  it("keeps the rest of the page when only the audit trail fails to load", async () => {
    mockAll({});
    vi.mocked(api.getPaymentAuditTimeline).mockRejectedValue(new api.ApiError(500, "audit exploded"));
    renderDetail();

    await screen.findByText(/Could not load the audit trail: audit exploded/);
    expect(screen.getByRole("region", { name: "Decision Chain" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("shows a decision-trail error in place of the chain when decisions fail to load, keeping the summary", async () => {
    mockAll({});
    vi.mocked(api.listAIDecisions).mockRejectedValue(new api.ApiError(500, "decisions exploded"));
    renderDetail();

    await screen.findByText(/Could not load the decision trail: decisions exploded/);
    expect(screen.getByRole("region", { name: "Financial summary" })).toBeInTheDocument();
    expect(document.querySelector('[data-node="ai"]')).toBeNull();
  });
});

describe("PaymentDetailPage — refresh", () => {
  it("re-reads all four resources when Refresh is pressed", async () => {
    mockAll({});
    renderDetail();
    await screen.findByRole("heading", { level: 1 });
    const before = vi.mocked(api.getPayment).mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(vi.mocked(api.getPayment).mock.calls.length).toBe(before + 1));
    expect(api.listAIDecisions).toHaveBeenCalledTimes(before + 1);
    expect(api.listRecoveryAttempts).toHaveBeenCalledTimes(before + 1);
    expect(api.getPaymentAuditTimeline).toHaveBeenCalledTimes(before + 1);
  });
});

describe("PaymentDetailPage — notification recipient", () => {
  it("shows the customer's email on file as the recipient of an email notification", async () => {
    mockAll({
      decisions: [makeDecision({ recommended_action: "SEND_NOTIFICATION" })],
      attempts: [makeAttempt({ action_type: "SEND_NOTIFICATION", result_message: "Email sent to ananya@example.com via Brevo.", external_reference: "<id@brevo>" })],
    });
    renderDetail();
    const recovery = await screen.findByRole("region", { name: "Recovery" });
    expect(within(recovery).getByText("Recipient")).toBeInTheDocument();
    expect(within(recovery).getAllByText("ananya@example.com").length).toBeGreaterThan(0);
    expect(within(recovery).queryByText("+919800000001")).not.toBeInTheDocument();
  });

  it("shows the phone number for an SMS", async () => {
    mockAll({
      attempts: [makeAttempt({ action_type: "SEND_NOTIFICATION", result_message: "SMS sent to +919800000001 via Twilio.", external_reference: "SM1" })],
    });
    renderDetail();
    const recovery = await screen.findByRole("region", { name: "Recovery" });
    expect(within(recovery).getByText("+919800000001")).toBeInTheDocument();
  });

  it("does not invent a merchant address for an escalation", async () => {
    mockAll({
      attempts: [makeAttempt({ action_type: "ESCALATE_TO_MERCHANT", policy_decision: "ESCALATE", result_message: "Email sent to ops@x.co via Brevo." })],
    });
    renderDetail();
    const recovery = await screen.findByRole("region", { name: "Recovery" });
    expect(within(recovery).getByText("Merchant address (server config)")).toBeInTheDocument();
    expect(within(recovery).queryByText("ops@x.co")).not.toBeInTheDocument();
  });
});

describe("PaymentDetailPage — re-run recovery", () => {
  const executionResult = (over: Record<string, unknown> = {}, attempt: Record<string, unknown> = {}) => ({
    payment_id: PAYMENT_ID,
    ai_decision_id: "dddddddd-0000-0000-0000-000000000001",
    policy_decision: "APPROVE",
    policy_reason: "ok",
    violated_rules: [],
    recovery_attempt: makeAttempt(attempt),
    idempotent_replay: false,
    ...over,
  });

  it("asks first, names the address the email would go to, and does nothing on Cancel", async () => {
    mockAll({});
    renderDetail();
    const recovery = await screen.findByRole("region", { name: "Recovery" });
    await userEvent.click(within(recovery).getByRole("button", { name: "Re-run recovery" }));

    const dialog = within(recovery).getByRole("alertdialog", { name: "Confirm re-run recovery" });
    expect(dialog).toHaveTextContent("the email goes to ananya@example.com");
    expect(dialog).toHaveTextContent("returns it without repeating it");

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(api.executeRecovery).not.toHaveBeenCalled();
    expect(within(recovery).queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("re-runs for exactly this AI decision, reports the result, and refreshes the page data", async () => {
    mockAll({});
    vi.mocked(api.executeRecovery).mockResolvedValue(
      executionResult({}, { action_type: "SEND_NOTIFICATION", attempt_number: 2, result_message: "Email sent to ananya@example.com via Brevo." }) as never,
    );
    renderDetail();
    const recovery = await screen.findByRole("region", { name: "Recovery" });
    const readsBefore = vi.mocked(api.getPayment).mock.calls.length;

    await userEvent.click(within(recovery).getByRole("button", { name: "Re-run recovery" }));
    await userEvent.click(within(within(recovery).getByRole("alertdialog")).getByRole("button", { name: "Re-run recovery" }));

    await waitFor(() => expect(api.executeRecovery).toHaveBeenCalledWith(PAYMENT_ID, "dddddddd-0000-0000-0000-000000000001"));
    expect(await within(recovery).findByText(/Policy approved → send notification · success\. Email sent to ananya@example\.com via Brevo\./)).toBeInTheDocument();
    expect(vi.mocked(api.getPayment).mock.calls.length).toBeGreaterThan(readsBefore);
  });

  it("says nothing was sent again when the backend replays an earlier successful attempt", async () => {
    mockAll({});
    vi.mocked(api.executeRecovery).mockResolvedValue(executionResult({ idempotent_replay: true }, { attempt_number: 1 }) as never);
    renderDetail();
    const recovery = await screen.findByRole("region", { name: "Recovery" });

    await userEvent.click(within(recovery).getByRole("button", { name: "Re-run recovery" }));
    await userEvent.click(within(within(recovery).getByRole("alertdialog")).getByRole("button", { name: "Re-run recovery" }));

    expect(await within(recovery).findByText(/Nothing was sent again/)).toBeInTheDocument();
  });

  it("shows the backend's own error (e.g. 409 nothing to act on)", async () => {
    mockAll({});
    vi.mocked(api.executeRecovery).mockRejectedValue(new api.ApiError(409, "No AI decision exists for this payment yet"));
    renderDetail();
    const recovery = await screen.findByRole("region", { name: "Recovery" });

    await userEvent.click(within(recovery).getByRole("button", { name: "Re-run recovery" }));
    await userEvent.click(within(within(recovery).getByRole("alertdialog")).getByRole("button", { name: "Re-run recovery" }));

    expect(await within(recovery).findByRole("alert")).toHaveTextContent("No AI decision exists for this payment yet");
  });

  it("warns that a customer with no contact on file can't be notified", async () => {
    vi.mocked(api.getPayment).mockResolvedValue(makePayment({ customer: null }));
    vi.mocked(api.listAIDecisions).mockResolvedValue([makeDecision()]);
    vi.mocked(api.listRecoveryAttempts).mockResolvedValue([makeAttempt()]);
    vi.mocked(api.getPaymentAuditTimeline).mockResolvedValue([makeAudit()]);
    renderDetail();
    const recovery = await screen.findByRole("region", { name: "Recovery" });
    await userEvent.click(within(recovery).getByRole("button", { name: "Re-run recovery" }));
    expect(within(recovery).getByRole("alertdialog")).toHaveTextContent("no customer email or phone on file");
  });

  it("is not offered while an attempt is still executing", async () => {
    mockAll({ attempts: [makeAttempt({ status: "in_progress", completed_at: null })] });
    renderDetail();
    const recovery = await screen.findByRole("region", { name: "Recovery" });
    expect(within(recovery).queryByRole("button", { name: "Re-run recovery" })).not.toBeInTheDocument();
  });

  it("is not offered when there is no AI decision to re-run", async () => {
    mockAll({ decisions: [], attempts: [] });
    renderDetail();
    await screen.findByRole("region", { name: "Recovery" });
    expect(screen.queryByRole("button", { name: "Re-run recovery" })).not.toBeInTheDocument();
  });
});
