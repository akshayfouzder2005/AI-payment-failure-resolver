import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RecoveryLabPage } from "./RecoveryLabPage";
import * as api from "../lib/api";
import { DEMO_SCENARIOS } from "../lib/simulation";
import { makeAttempt, makeAudit, makeDecision, makeIngest, makeMetrics, makePayment } from "../test/fixtures";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { user_id: "u1", name: "Priya", email: "p@x.test", merchant_id: "m-test", merchant_name: "Acme" } }),
}));

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    simulateFailedPayment: vi.fn(),
    getPayment: vi.fn(),
    listAIDecisions: vi.fn(),
    listRecoveryAttempts: vi.fn(),
    getPaymentAuditTimeline: vi.fn(),
    getMetricsSummary: vi.fn(),
    listPayments: vi.fn(),
    getHealth: vi.fn(),
  };
});

function renderLab() {
  return render(
    <MemoryRouter initialEntries={["/app/recovery-lab"]}>
      <Routes>
        <Route path="/app/recovery-lab" element={<RecoveryLabPage pollIntervalMs={1} />} />
        <Route path="/app/payments/:id" element={<div>Payment Route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const stage = (key: string) => document.querySelector(`[data-stage="${key}"]`) as HTMLElement;

/** Stubs the four per-payment reads to a fully settled, recovered run. */
function stubSettled(paymentId: string, overrides: { status?: string; action?: string } = {}) {
  vi.mocked(api.getPayment).mockResolvedValue(makePayment({ id: paymentId, status: overrides.status ?? "retry_scheduled" }));
  vi.mocked(api.listAIDecisions).mockResolvedValue([makeDecision({ payment_id: paymentId })]);
  vi.mocked(api.listRecoveryAttempts).mockResolvedValue([
    makeAttempt({ payment_id: paymentId, action_type: overrides.action ?? "SEND_PAYMENT_LINK", policy_decision: "APPROVE" }),
  ]);
  vi.mocked(api.getPaymentAuditTimeline).mockResolvedValue([
    makeAudit({ id: "a1", action: "webhook_received", created_at: "2026-10-03T09:00:00.000Z" }),
    makeAudit({ id: "a2", action: "ai_decision_created", actor: "ai_engine", created_at: "2026-10-03T09:00:01.000Z", details: { message: "AI decision created" } }),
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getHealth).mockResolvedValue({
    status: "ok",
    environment: "LOCAL",
    providers: { ai: "mock", recovery_gateway: "mock", notifications: "mock" },
  });
  vi.mocked(api.getMetricsSummary).mockResolvedValue(makeMetrics());
  vi.mocked(api.listPayments).mockResolvedValue([]);
});
afterEach(() => vi.clearAllMocks());

describe("RecoveryLabPage — scenario builder", () => {
  it("rejects an invalid amount without calling the backend", async () => {
    renderLab();
    const amount = screen.getByLabelText("Amount (INR)");
    await userEvent.clear(amount);
    await userEvent.type(amount, "abc");
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/positive amount/);
    expect(api.simulateFailedPayment).not.toHaveBeenCalled();
  });

  it("previews the exact request, including this workspace's merchant id", async () => {
    renderLab();
    await userEvent.click(screen.getByText("Request preview"));
    const pre = screen.getByText(/POST \/simulate\/failed-payment/);
    expect(pre).toHaveTextContent('"merchant_id": "m-test"');
    expect(pre).toHaveTextContent('"failure_code": "BAD_REQUEST_ERROR"');
  });

  it("warns that approved actions will act for real when providers are live", async () => {
    vi.mocked(api.getHealth).mockResolvedValue({
      status: "ok",
      environment: "PROD",
      providers: { ai: "groq", recovery_gateway: "razorpay", notifications: "brevo" },
    });
    renderLab();
    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent("recovery gateway (razorpay)");
    expect(note).toHaveTextContent("notifications (brevo)");
  });

  it("shows no live-provider warning when everything is mock", async () => {
    renderLab();
    await waitFor(() => expect(api.getHealth).toHaveBeenCalled());
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});

describe("RecoveryLabPage — single run", () => {
  it("sends the form to the real endpoint and renders the trace from polled backend state", async () => {
    vi.mocked(api.simulateFailedPayment).mockResolvedValue(makeIngest({ payment_id: "pay-1" }));
    // Three reads: nothing yet → decision + executing → settled.
    vi.mocked(api.getPayment).mockResolvedValue(makePayment({ id: "pay-1", status: "failed" }));
    vi.mocked(api.listAIDecisions).mockResolvedValueOnce([]).mockResolvedValue([makeDecision()]);
    vi.mocked(api.listRecoveryAttempts)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeAttempt({ status: "in_progress" })])
      .mockResolvedValue([makeAttempt({ status: "success" })]);
    vi.mocked(api.getPaymentAuditTimeline).mockResolvedValue([makeAudit({ id: "a1" })]);
    vi.mocked(api.getMetricsSummary)
      .mockResolvedValueOnce(makeMetrics({ payments_analyzed: 10 }))
      .mockResolvedValue(makeMetrics({ payments_analyzed: 11 }));
    vi.mocked(api.listPayments).mockResolvedValue([makePayment({ id: "pay-1", status: "retry_scheduled" }), makePayment({ id: "other" })]);

    renderLab();
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));

    // Exact request: default form → mock adapter's shape + this merchant.
    await waitFor(() => expect(api.simulateFailedPayment).toHaveBeenCalledTimes(1));
    expect(api.simulateFailedPayment).toHaveBeenCalledWith({
      amount: "1499.00",
      failure_code: "BAD_REQUEST_ERROR",
      failure_message: "Insufficient funds in the customer's account",
      customer_name: "Ananya Rao",
      customer_email: "ananya.rao@example.com",
      customer_phone: "+919800000001",
      merchant_id: "m-test",
    });

    // Settles, and the polling really happened (>= 3 reads of the real endpoints).
    await waitFor(() => expect(stage("recovery").dataset.phase).toBe("done"));
    expect(vi.mocked(api.listRecoveryAttempts).mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(stage("event").dataset.phase).toBe("done");
    expect(stage("ai").dataset.phase).toBe("done");
    expect(stage("policy")).toHaveTextContent("Approved");
    expect(stage("recovery")).toHaveTextContent("Success");
    expect(stage("audit")).toHaveTextContent("1 event recorded");

    // The result stage appears only once settled, and shows the payment's real status then.
    expect(stage("result").dataset.phase).toBe("done");
    expect(stage("result")).toHaveTextContent("Failed");
  });

  it("links to the resulting payment and audit trace, and shows refreshed workspace impact", async () => {
    vi.mocked(api.simulateFailedPayment).mockResolvedValue(makeIngest({ payment_id: "pay-1" }));
    stubSettled("pay-1");
    vi.mocked(api.getMetricsSummary)
      .mockResolvedValueOnce(makeMetrics({ payments_analyzed: 10, revenue_at_risk: "5000.00", revenue_recovered: "2000.00" }))
      .mockResolvedValue(makeMetrics({ payments_analyzed: 11, revenue_at_risk: "6499.00", revenue_recovered: "2000.00" }));
    vi.mocked(api.listPayments).mockResolvedValue([
      makePayment({ id: "pay-1", gateway_payment_id: "pay_sim_new", amount: "1499.00", status: "retry_scheduled" }),
      makePayment({ id: "pay-old", gateway_payment_id: "pay_old" }),
    ]);

    renderLab();
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));

    const impact = await screen.findByRole("region", { name: "Workspace impact" });
    expect(within(impact).getByText(/was 10 · \+1/)).toBeInTheDocument();
    expect(within(impact).getByText(/was ₹5,000.00 · \+₹1,499.00/)).toBeInTheDocument();
    expect(within(impact).getByText(/was ₹2,000.00 · no change/)).toBeInTheDocument();
    // Only the payment this session created is listed — not the other one in the workspace.
    expect(within(impact).getByText(/pay_sim_new/)).toBeInTheDocument();
    expect(within(impact).queryByText(/pay_old/)).not.toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Open payment" })).toHaveAttribute("href", "/app/payments/pay-1");
    expect(screen.getByRole("link", { name: "Open audit trace" })).toHaveAttribute("href", "/app/audit?payment=pay-1");
  });

  it("navigates into the resulting payment", async () => {
    vi.mocked(api.simulateFailedPayment).mockResolvedValue(makeIngest({ payment_id: "pay-1" }));
    stubSettled("pay-1");
    renderLab();
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    await userEvent.click(await screen.findByRole("link", { name: "Open payment" }));
    expect(screen.getByText("Payment Route")).toBeInTheDocument();
  });

  it("does not poll or invent a payment when the event was not processed", async () => {
    vi.mocked(api.simulateFailedPayment).mockResolvedValue(
      makeIngest({ status: "duplicate", payment_id: null, detail: "Event already processed" }),
    );
    renderLab();
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));

    await waitFor(() => expect(stage("event")).toHaveTextContent("Duplicate"));
    expect(api.getPayment).not.toHaveBeenCalled();
    expect(stage("payment").dataset.phase).toBe("idle");
    expect(stage("ai").dataset.phase).toBe("idle");
    expect(screen.queryByRole("link", { name: "Open payment" })).not.toBeInTheDocument();
  });

  it("shows the backend's own error when the simulation call fails, and leaves the trace empty", async () => {
    vi.mocked(api.simulateFailedPayment).mockRejectedValue(new api.ApiError(500, "Simulator exploded"));
    renderLab();
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));

    expect(await screen.findByText("Simulator exploded")).toBeInTheDocument();
    expect(stage("event").dataset.phase).toBe("idle");
    expect(screen.queryByRole("region", { name: "Workspace impact" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run simulation" })).toBeEnabled();
  });

  it("disables the builder while a run is in flight", async () => {
    let resolve!: (value: ReturnType<typeof makeIngest>) => void;
    vi.mocked(api.simulateFailedPayment).mockReturnValue(new Promise((r) => (resolve = r)));
    renderLab();
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));

    expect(screen.getByRole("button", { name: "Running…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Load demo workspace" })).toBeDisabled();
    resolve(makeIngest({ status: "ignored", payment_id: null }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Run simulation" })).toBeEnabled());
  });
});

describe("RecoveryLabPage — demo workspace", () => {
  it("runs all scenarios sequentially against the real endpoint, then refreshes metrics and payments", async () => {
    let n = 0;
    vi.mocked(api.simulateFailedPayment).mockImplementation(async () => makeIngest({ payment_id: `pay-${++n}` }));
    vi.mocked(api.getPayment).mockImplementation(async (id: string) => makePayment({ id, status: "retry_scheduled" }));
    vi.mocked(api.listAIDecisions).mockResolvedValue([makeDecision()]);
    vi.mocked(api.listRecoveryAttempts).mockResolvedValue([makeAttempt({ policy_decision: "MODIFY", action_type: "SEND_PAYMENT_LINK" })]);
    vi.mocked(api.getPaymentAuditTimeline).mockResolvedValue([makeAudit()]);
    vi.mocked(api.listPayments).mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => makePayment({ id: `pay-${i + 1}`, gateway_payment_id: `pay_sim_${i + 1}` })),
    );

    renderLab();
    await userEvent.click(screen.getByRole("button", { name: "Load demo workspace" }));

    await waitFor(() => expect(screen.getByText("9 of 9 settled")).toBeInTheDocument(), { timeout: 5000 });

    // Exactly the fixed inputs, in order.
    const calls = vi.mocked(api.simulateFailedPayment).mock.calls.map(([req]) => req!);
    expect(calls).toHaveLength(DEMO_SCENARIOS.length);
    expect(calls.map((c) => c.amount)).toEqual(DEMO_SCENARIOS.map((s) => Number(s.amount).toFixed(2)));
    expect(calls.every((c) => c.merchant_id === "m-test")).toBe(true);
    // Repeat-customer scenarios share one customer; others differ.
    expect(calls[6].customer_email).toBe(calls[7].customer_email);
    expect(calls[7].customer_email).toBe(calls[8].customer_email);
    expect(calls[0].customer_email).not.toBe(calls[1].customer_email);

    // Each row reports the real outcome and links to its payment.
    const row = document.querySelector('[data-scenario="d5"]') as HTMLElement;
    expect(row).toHaveTextContent("Modified · send payment link · Retry scheduled");
    expect(within(row).getByRole("link", { name: "Open" })).toHaveAttribute("href", "/app/payments/pay-5");

    // Metrics read before and after; payments refreshed; impact lists every created payment.
    expect(vi.mocked(api.getMetricsSummary).mock.calls.length).toBeGreaterThanOrEqual(2);
    const impact = await screen.findByRole("region", { name: "Workspace impact" });
    expect(within(impact).getAllByRole("link", { name: /pay_sim_/ })).toHaveLength(9);
    expect(screen.getByRole("button", { name: "Run again" })).toBeInTheDocument();
  });

  it("waits for each pipeline to settle before sending the next scenario", async () => {
    const order: string[] = [];
    let n = 0;
    vi.mocked(api.simulateFailedPayment).mockImplementation(async () => {
      order.push(`simulate-${++n}`);
      return makeIngest({ payment_id: `pay-${n}` });
    });
    vi.mocked(api.getPayment).mockImplementation(async (id: string) => {
      order.push(`read-${id}`);
      return makePayment({ id });
    });
    vi.mocked(api.listAIDecisions).mockResolvedValue([makeDecision()]);
    vi.mocked(api.listRecoveryAttempts).mockResolvedValue([makeAttempt()]);
    vi.mocked(api.getPaymentAuditTimeline).mockResolvedValue([]);

    renderLab();
    await userEvent.click(screen.getByRole("button", { name: "Load demo workspace" }));
    await waitFor(() => expect(screen.getByText("9 of 9 settled")).toBeInTheDocument(), { timeout: 5000 });

    // Scenario 2 is sent only after scenario 1's payment was read.
    expect(order.indexOf("read-pay-1")).toBeLessThan(order.indexOf("simulate-2"));
    expect(order.indexOf("read-pay-8")).toBeLessThan(order.indexOf("simulate-9"));
  });

  it("stops at a backend failure, marks the row failed with the real message, and marks the rest stopped", async () => {
    let n = 0;
    vi.mocked(api.simulateFailedPayment).mockImplementation(async () => {
      if (++n === 3) throw new api.ApiError(503, "Gateway unavailable");
      return makeIngest({ payment_id: `pay-${n}` });
    });
    vi.mocked(api.getPayment).mockImplementation(async (id: string) => makePayment({ id }));
    vi.mocked(api.listAIDecisions).mockResolvedValue([makeDecision()]);
    vi.mocked(api.listRecoveryAttempts).mockResolvedValue([makeAttempt()]);
    vi.mocked(api.getPaymentAuditTimeline).mockResolvedValue([]);

    renderLab();
    await userEvent.click(screen.getByRole("button", { name: "Load demo workspace" }));
    await waitFor(() => expect(document.querySelector('[data-scenario="d3"]')).toHaveAttribute("data-status", "failed"), { timeout: 5000 });

    expect(document.querySelector('[data-scenario="d3"]')).toHaveTextContent("Gateway unavailable");
    expect(document.querySelector('[data-scenario="d1"]')).toHaveAttribute("data-status", "done");
    await waitFor(() => expect(document.querySelector('[data-scenario="d9"]')).toHaveAttribute("data-status", "stopped"));
    expect(api.simulateFailedPayment).toHaveBeenCalledTimes(3); // nothing sent after the failure
  });

  it("Stop halts the run and marks unreached scenarios stopped", async () => {
    let resolveFirst!: (v: ReturnType<typeof makeIngest>) => void;
    vi.mocked(api.simulateFailedPayment).mockReturnValue(new Promise((r) => (resolveFirst = r)));
    renderLab();
    await userEvent.click(screen.getByRole("button", { name: "Load demo workspace" }));
    await userEvent.click(await screen.findByRole("button", { name: "Stop" }));
    resolveFirst(makeIngest({ payment_id: "pay-1" }));

    await waitFor(() => expect(document.querySelector('[data-scenario="d2"]')).toHaveAttribute("data-status", "stopped"));
    expect(api.simulateFailedPayment).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Load demo workspace|Run again/ })).toBeEnabled();
  });
});
