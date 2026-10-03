import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DecisionInsights } from "./DecisionInsights";
import type { MetricsSummary, PaymentRead } from "../../types/api";

const METRICS: MetricsSummary = {
  merchant_id: "m1",
  payments_analyzed: 10,
  revenue_at_risk: "0",
  revenue_recovered: "0",
  recovered_count: 0,
  escalated_count: 0,
  automatically_recovered_count: 0,
  recovery_rate: 0,
  automatic_recovery_rate: 0.5,
  escalation_rate: 0.2,
  recovery_attempt_success_rate: 0,
  average_recovery_time_seconds: null,
  failed_or_blocked_intervention_count: 7,
  generated_at: "2026-09-26T10:00:00Z",
};

function payment(id: string, failure_code: string | null): PaymentRead {
  return {
    id,
    merchant_id: "m1",
    customer: null,
    gateway: "razorpay",
    gateway_payment_id: `rzp_${id}`,
    amount: "100.00",
    currency: "INR",
    status: "failed",
    failure_code,
    failure_message: null,
    original_transaction_at: null,
    created_at: "2026-09-20T09:00:00Z",
    updated_at: "2026-09-20T09:00:00Z",
  };
}

describe("DecisionInsights", () => {
  it("shows at most five failure reasons, most frequent first", () => {
    const payments = [
      ...["A", "A", "A"].map((c, i) => payment(`a${i}`, c)),
      ...["B", "B"].map((c, i) => payment(`b${i}`, c)),
      payment("c", "C"),
      payment("d", "D"),
      payment("e", "E"),
      payment("f", "F"),
    ];
    render(<DecisionInsights metrics={METRICS} payments={payments} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent("A");
    expect(items[0]).toHaveTextContent("3");
    expect(items[1]).toHaveTextContent("B");
  });

  it("groups payments with no failure code as Unspecified instead of dropping them", () => {
    render(<DecisionInsights metrics={METRICS} payments={[payment("x", null), payment("y", null)]} />);
    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("Unspecified");
    expect(item).toHaveTextContent("2");
  });

  it("says so, rather than drawing an empty chart, when there are no payments", () => {
    render(<DecisionInsights metrics={METRICS} payments={[]} />);
    expect(screen.getByText("No failure reasons recorded yet.")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("uses singular wording for a one-payment sample", () => {
    render(<DecisionInsights metrics={METRICS} payments={[payment("only", "CARD_DECLINED")]} />);
    expect(screen.getByText("From the latest 1 payment.")).toBeInTheDocument();
  });

  it("renders the automation rates and blocked-intervention count from metrics", () => {
    render(<DecisionInsights metrics={METRICS} payments={[]} />);
    const section = screen.getByText("Decision Insights").closest("section")!;
    expect(within(section).getByText("50%")).toBeInTheDocument();
    expect(within(section).getByText("20%")).toBeInTheDocument();
    expect(within(section).getByText("7")).toBeInTheDocument();
  });
});
