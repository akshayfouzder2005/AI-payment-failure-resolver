import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RecoveryActivity } from "./RecoveryActivity";
import type { PaymentRead } from "../../types/api";

function payment(overrides: Partial<PaymentRead>): PaymentRead {
  return {
    id: "pay_default",
    merchant_id: "m1",
    customer: null,
    gateway: "razorpay",
    gateway_payment_id: "rzp_1",
    amount: "1000.00",
    currency: "INR",
    status: "failed",
    failure_code: null,
    failure_message: null,
    original_transaction_at: null,
    created_at: "2026-09-20T09:00:00Z",
    updated_at: "2026-09-20T09:00:00Z",
    ...overrides,
  };
}

function renderActivity(payments: PaymentRead[]) {
  return render(
    <MemoryRouter>
      <RecoveryActivity payments={payments} />
    </MemoryRouter>,
  );
}

describe("RecoveryActivity", () => {
  it("excludes payments still sitting at the untouched 'failed' status", () => {
    const untouched = payment({ id: "pay_untouched", status: "failed", amount: "5000.00" });
    const recovered = payment({ id: "pay_recovered", status: "recovered", amount: "12000.00" });

    renderActivity([untouched, recovered]);

    expect(screen.queryByText("₹5,000")).not.toBeInTheDocument();
    expect(screen.getByText("₹12,000")).toBeInTheDocument();
  });

  it("orders items by most-recently-changed (updated_at), not arrival order", () => {
    // Deliberately passed in an order that does NOT match updated_at order,
    // the way a real /payments response (sorted by created_at) wouldn't
    // either — this is the whole point of the section.
    const oldestChange = payment({
      id: "pay_oldest_change",
      status: "retry_scheduled",
      amount: "3000.00",
      updated_at: "2026-09-23T09:00:00Z",
    });
    const mostRecentChange = payment({
      id: "pay_most_recent_change",
      status: "recovered",
      amount: "12000.00",
      updated_at: "2026-09-26T08:00:00Z",
    });
    const middleChange = payment({
      id: "pay_middle_change",
      status: "escalated",
      amount: "8000.00",
      updated_at: "2026-09-25T09:00:00Z",
    });

    renderActivity([oldestChange, mostRecentChange, middleChange]);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveTextContent("₹12,000");
    expect(links[1]).toHaveTextContent("₹8,000");
    expect(links[2]).toHaveTextContent("₹3,000");
  });

  it("shows at most 8 items even when more recovery-relevant payments are loaded", () => {
    const payments = Array.from({ length: 12 }, (_, i) =>
      payment({ id: `pay_${i}`, status: "recovered", amount: `${(i + 1) * 1000}.00` }),
    );

    renderActivity(payments);

    expect(screen.getAllByRole("link")).toHaveLength(8);
  });

  it("links each item to its Payment Detail page", () => {
    renderActivity([payment({ id: "pay_abc123", status: "recovered" })]);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/app/payments/pay_abc123");
  });

  it("shows a plain message, not an empty list, when nothing has changed yet", () => {
    renderActivity([payment({ id: "pay_still_failed", status: "failed" })]);
    expect(screen.getByText("No recovery activity yet.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders the real status label alongside each amount, not a bare color", () => {
    renderActivity([payment({ id: "pay_escalated", status: "escalated", amount: "9000.00" })]);
    const link = screen.getByRole("link");
    expect(within(link).getByText("Escalated")).toBeInTheDocument();
    expect(within(link).getByText("₹9,000")).toBeInTheDocument();
  });
});
