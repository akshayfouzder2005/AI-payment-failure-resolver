import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { OverviewPage } from "./OverviewPage";
import * as api from "../lib/api";
import type { MetricsSummary, PaymentRead } from "../types/api";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, getMetricsSummary: vi.fn(), listPayments: vi.fn() };
});

const METRICS: MetricsSummary = {
  merchant_id: "m1",
  payments_analyzed: 40,
  revenue_at_risk: "125000.00",
  revenue_recovered: "375000.00",
  recovered_count: 24,
  escalated_count: 4,
  automatically_recovered_count: 18,
  recovery_rate: 0.6,
  automatic_recovery_rate: 0.45,
  escalation_rate: 0.1,
  recovery_attempt_success_rate: 0.72,
  average_recovery_time_seconds: 3600,
  failed_or_blocked_intervention_count: 3,
  generated_at: "2026-09-26T10:00:00Z",
};

const EMPTY_METRICS: MetricsSummary = { ...METRICS, payments_analyzed: 0 };

function payment(overrides: Partial<PaymentRead>): PaymentRead {
  return {
    id: "pay_default",
    merchant_id: "m1",
    customer: { id: "cust_1", name: "Ananya Rao", email: "ananya@example.com", phone: null },
    gateway: "razorpay",
    gateway_payment_id: "rzp_1",
    amount: "1000.00",
    currency: "INR",
    status: "failed",
    failure_code: "CARD_DECLINED",
    failure_message: "Card declined by issuer",
    original_transaction_at: null,
    created_at: "2026-09-20T09:00:00Z",
    updated_at: "2026-09-20T09:00:00Z",
    ...overrides,
  };
}

// Newest-created first, matching the real backend contract
// (PaymentRepository.list_for_merchant orders by created_at desc).
const PAYMENTS: PaymentRead[] = [
  payment({
    id: "pay_1",
    status: "failed",
    amount: "5000.00",
    customer: { id: "c1", name: "Ananya Rao", email: null, phone: null },
    created_at: "2026-09-26T09:00:00Z",
    updated_at: "2026-09-26T09:00:00Z",
  }),
  payment({
    id: "pay_2",
    status: "recovered",
    amount: "12000.00",
    customer: { id: "c2", name: "Karthik Iyer", email: null, phone: null },
    created_at: "2026-09-25T09:00:00Z",
    updated_at: "2026-09-26T08:00:00Z",
  }),
  payment({
    id: "pay_3",
    status: "escalated",
    amount: "8000.00",
    customer: { id: "c3", name: "Meera Nair", email: null, phone: null },
    created_at: "2026-09-24T09:00:00Z",
    updated_at: "2026-09-25T09:00:00Z",
  }),
  payment({
    id: "pay_4",
    status: "retry_scheduled",
    amount: "3000.00",
    customer: { id: "c4", name: "Ravi Shah", email: null, phone: null },
    created_at: "2026-09-23T09:00:00Z",
    updated_at: "2026-09-23T09:00:00Z",
  }),
];

function renderOverview() {
  return render(
    <MemoryRouter initialEntries={["/app"]}>
      <Routes>
        <Route path="/app" element={<OverviewPage />} />
        <Route path="/app/recovery-lab" element={<div>Recovery Lab Page</div>} />
        <Route path="/app/payments/:paymentId" element={<div>Payment Detail Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function sectionFor(headingText: string): HTMLElement {
  const heading = screen.getByText(headingText);
  const section = heading.closest("section");
  if (!section) throw new Error(`No <section> ancestor found for heading "${headingText}"`);
  return section;
}

describe("OverviewPage", () => {
  afterEach(() => {
    vi.mocked(api.getMetricsSummary).mockReset();
    vi.mocked(api.listPayments).mockReset();
  });

  it("shows a loading skeleton while the dashboard is fetching", () => {
    vi.mocked(api.getMetricsSummary).mockReturnValue(new Promise(() => {}));
    vi.mocked(api.listPayments).mockReturnValue(new Promise(() => {}));

    renderOverview();

    expect(screen.getByRole("status", { name: "Loading dashboard" })).toBeInTheDocument();
  });

  it("shows the real backend error message with a retry action, and recovers on retry", async () => {
    vi.mocked(api.getMetricsSummary).mockRejectedValueOnce(new api.ApiError(500, "Internal server error"));
    vi.mocked(api.listPayments).mockRejectedValueOnce(new api.ApiError(500, "Internal server error"));

    renderOverview();

    expect(await screen.findByText("Internal server error")).toBeInTheDocument();

    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Revenue Position")).toBeInTheDocument();
    expect(screen.queryByText("Internal server error")).not.toBeInTheDocument();
  });

  it("shows the workspace-ready empty state when no payments have been analyzed yet", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(EMPTY_METRICS);
    vi.mocked(api.listPayments).mockResolvedValue([]);

    renderOverview();

    expect(await screen.findByText("Your workspace is ready")).toBeInTheDocument();
    // Design spec §24: "do not show empty charts."
    expect(screen.queryByText("Revenue Position")).not.toBeInTheDocument();
    expect(screen.queryByText("Outcome Distribution")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Run demo scenario" }));
    expect(await screen.findByText("Recovery Lab Page")).toBeInTheDocument();
  });

  it("renders real revenue, recovery-rate, and recovery-time figures from the metrics summary", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Revenue Position");

    const revenue = sectionFor("Revenue Position");
    // Each money figure appears twice within this section — once as a
    // headline/stat figure, once again in the proportion-bar legend.
    expect(within(revenue).getAllByText("₹3,75,000")).toHaveLength(2); // revenue_recovered
    expect(within(revenue).getAllByText("₹1,25,000")).toHaveLength(2); // revenue_at_risk
    expect(within(revenue).getByText("60%")).toBeInTheDocument(); // recovery_rate
    expect(within(revenue).getByText("1h")).toBeInTheDocument(); // average_recovery_time_seconds: 3600
  });

  it("renders a dash, not 0s, for average recovery time before anything has been recovered", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue({ ...METRICS, average_recovery_time_seconds: null });
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Revenue Position");

    const revenue = sectionFor("Revenue Position");
    expect(within(revenue).getByText("Average recovery time").parentElement).toHaveTextContent("—");
  });

  it("renders payments analyzed, automatic recoveries and attempt success in Recovery Performance", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Recovery Performance");

    const performance = sectionFor("Recovery Performance");
    expect(within(performance).getByText("40")).toBeInTheDocument(); // payments_analyzed
    expect(within(performance).getByText("18")).toBeInTheDocument(); // automatically_recovered_count
    expect(within(performance).getByText("72%")).toBeInTheDocument(); // recovery_attempt_success_rate
  });

  it("derives the outcome bar's at-risk count from payments_analyzed minus recovered and escalated", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Recovery Performance");
    const performance = sectionFor("Recovery Performance");

    // 40 analyzed - 24 recovered - 4 escalated = 12 still at risk.
    expect(within(performance).getByText("12")).toBeInTheDocument();
    expect(within(performance).getByText("24")).toBeInTheDocument();
    expect(within(performance).getByText("4")).toBeInTheDocument();
  });

  it("shows Recovery Activity ordered by most-recently-changed, excluding untouched failures", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Recovery Activity");

    const activity = sectionFor("Recovery Activity");
    const links = within(activity).getAllByRole("link");

    // pay_1 (still "failed") must not appear at all.
    expect(within(activity).queryByText("₹5,000")).not.toBeInTheDocument();
    // Ordered by updated_at desc: pay_2 (08:00) > pay_3 (25th) > pay_4 (23rd).
    expect(links[0]).toHaveTextContent("₹12,000");
    expect(links[1]).toHaveTextContent("₹8,000");
    expect(links[2]).toHaveTextContent("₹3,000");
  });

  it("shows Recent Failed Payments in real arrival order (created_at, as returned by the backend)", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Recent Failed Payments");

    const table = sectionFor("Recent Failed Payments");
    const rows = within(table).getAllByRole("row").slice(1); // drop the header row

    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("Ananya Rao");
    expect(rows[1]).toHaveTextContent("Karthik Iyer");
    expect(rows[2]).toHaveTextContent("Meera Nair");
    expect(rows[3]).toHaveTextContent("Ravi Shah");
  });

  it("navigates to Payment Detail when a recent payment row is activated", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Recent Failed Payments");

    await userEvent.click(screen.getByRole("row", { name: "Open payment pay_2" }));
    expect(await screen.findByText("Payment Detail Page")).toBeInTheDocument();
  });

  it("always shows the Quick Demo Entry panel on a populated dashboard, linking to Recovery Lab", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Test the full pipeline with a simulated failure");

    await userEvent.click(screen.getByRole("button", { name: "Open Recovery Lab" }));
    expect(await screen.findByText("Recovery Lab Page")).toBeInTheDocument();
  });

  it("shows the gateway's failure message, then the humanized code, then a dash, as the failure reason", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue([
      payment({ id: "p_msg", failure_message: "Issuer declined the card", failure_code: "CARD_DECLINED" }),
      payment({ id: "p_code", failure_message: null, failure_code: "INSUFFICIENT_FUNDS" }),
      payment({ id: "p_none", failure_message: null, failure_code: null }),
    ]);

    renderOverview();
    await screen.findByText("Recent Failed Payments");
    const table = sectionFor("Recent Failed Payments");

    const byId = (id: string) => within(table).getByRole("row", { name: `Open payment ${id}` });
    expect(byId("p_msg")).toHaveTextContent("Issuer declined the card");
    expect(byId("p_code")).toHaveTextContent("Insufficient funds");
    expect(byId("p_none")).not.toHaveTextContent("Insufficient funds");
  });

  it("links Recent Failed Payments to the full Payments list", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Recent Failed Payments");

    const table = sectionFor("Recent Failed Payments");
    expect(within(table).getByRole("link", { name: "View all" })).toHaveAttribute("href", "/app/payments");
  });

  it("shows automation rates from the metrics summary and failure reasons counted from the loaded payments", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue([
      payment({ id: "a", failure_code: "CARD_DECLINED" }),
      payment({ id: "b", failure_code: "CARD_DECLINED" }),
      payment({ id: "c", failure_code: "INSUFFICIENT_FUNDS" }),
    ]);

    renderOverview();
    await screen.findByText("Decision Insights");
    const insights = sectionFor("Decision Insights");

    expect(within(insights).getByText("45%")).toBeInTheDocument(); // automatic_recovery_rate
    expect(within(insights).getByText("10%")).toBeInTheDocument(); // escalation_rate
    expect(within(insights).getByText("3")).toBeInTheDocument(); // failed_or_blocked_intervention_count

    const reasons = within(insights).getAllByRole("listitem");
    expect(reasons[0]).toHaveTextContent("Card declined");
    expect(reasons[0]).toHaveTextContent("2");
    expect(reasons[1]).toHaveTextContent("Insufficient funds");
    // The sample size is stated, so a page of payments is never mistaken for all-time.
    expect(within(insights).getByText("From the latest 3 payments.")).toBeInTheDocument();
  });

  it("states the data window in the page header from the metrics timestamp", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Revenue Position");

    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText(/Updated/)).toBeInTheDocument();
  });
});
