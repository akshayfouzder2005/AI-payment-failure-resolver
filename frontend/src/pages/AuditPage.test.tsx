import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuditPage } from "./AuditPage";
import * as api from "../lib/api";
import { makeAudit, makePayment } from "../test/fixtures";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, listPayments: vi.fn(), getPayment: vi.fn(), getPaymentAuditTimeline: vi.fn() };
});

function Probe() {
  const location = useLocation();
  return <div data-testid="loc">{location.pathname + location.search}</div>;
}

function renderAudit(initial = "/app/audit") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/app/audit" element={<AuditPage />} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  );
}

const PAY_A = makePayment({ id: "pay-a", gateway_payment_id: "pay_A", amount: "1499.00", status: "retry_scheduled" });
const PAY_B = makePayment({ id: "pay-b", gateway_payment_id: "pay_B", amount: "72000.00", status: "escalated" });

const TRACE = [
  makeAudit({ id: "e1", action: "webhook_received", actor: "system", entity_type: "PaymentEvent", created_at: "2026-10-03T09:00:00.000Z", details: { message: "Webhook event received" } }),
  makeAudit({ id: "e2", action: "ai_decision_created", actor: "ai_engine", entity_type: "AIDecision", created_at: "2026-10-03T09:00:01.250Z", details: { message: "AI decision created", model_name: "openai/gpt-oss-20b", confidence: "0.880" } }),
  makeAudit({ id: "e3", action: "policy_decision_recorded", actor: "system", entity_type: "RecoveryAttempt", created_at: "2026-10-03T09:00:01.600Z", details: { message: "Policy engine MODIFY", violated_rules: ["HIGH_VALUE_AUTO_RETRY_DISALLOWED"] } }),
  makeAudit({ id: "e4", action: "action_approved", actor: "policy_engine", entity_type: "RecoveryAttempt", created_at: "2026-10-03T09:00:01.650Z", details: { message: "Policy verdict MODIFY" } }),
  makeAudit({ id: "e5", action: "action_executed", actor: "executor", entity_type: "RecoveryAttempt", created_at: "2026-10-03T09:00:02.900Z", details: { message: "SEND_PAYMENT_LINK executed successfully.", provider_reference: "plink_X1" } }),
];

function stub() {
  vi.mocked(api.listPayments).mockResolvedValue([PAY_A, PAY_B]);
  vi.mocked(api.getPayment).mockImplementation(async (id: string) => (id === "pay-b" ? PAY_B : PAY_A));
  vi.mocked(api.getPaymentAuditTimeline).mockResolvedValue(TRACE);
}

const events = () => within(screen.getByRole("list", { name: "Audit events" })).getAllByRole("listitem").filter((li) => li.dataset.action);

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("AuditPage — selection", () => {
  it("traces the newest payment by default", async () => {
    stub();
    renderAudit();
    await screen.findByRole("list", { name: "Audit events" });
    expect(api.getPaymentAuditTimeline).toHaveBeenCalledWith("pay-a");
    expect(screen.getByRole("button", { name: "Trace payment pay-a" })).toHaveAttribute("aria-current", "true");
  });

  it("traces the payment named in the URL", async () => {
    stub();
    renderAudit("/app/audit?payment=pay-b");
    await screen.findByRole("list", { name: "Audit events" });
    expect(api.getPaymentAuditTimeline).toHaveBeenCalledWith("pay-b");
    expect(screen.getByRole("button", { name: "Trace payment pay-b" })).toHaveAttribute("aria-current", "true");
  });

  it("switches traces from the picker and records the choice in the URL", async () => {
    stub();
    renderAudit();
    await screen.findByRole("list", { name: "Audit events" });
    await userEvent.click(screen.getByRole("button", { name: "Trace payment pay-b" }));

    await waitFor(() => expect(api.getPaymentAuditTimeline).toHaveBeenLastCalledWith("pay-b"));
    expect(screen.getByTestId("loc")).toHaveTextContent("/app/audit?payment=pay-b");
  });

  it("filters the picker by status, server-side", async () => {
    stub();
    renderAudit();
    await screen.findByRole("list", { name: "Audit events" });
    await userEvent.selectOptions(screen.getByRole("combobox"), "escalated");
    await waitFor(() => expect(api.listPayments).toHaveBeenLastCalledWith({ status: "escalated", limit: 26, offset: 0 }));
  });

  it("shows an empty state when there are no payments at all", async () => {
    vi.mocked(api.listPayments).mockResolvedValue([]);
    renderAudit();
    expect(await screen.findByText("Nothing to trace yet")).toBeInTheDocument();
    expect(api.getPaymentAuditTimeline).not.toHaveBeenCalled();
  });

  it("says so for an unknown payment id", async () => {
    vi.mocked(api.listPayments).mockResolvedValue([PAY_A]);
    vi.mocked(api.getPayment).mockRejectedValue(new api.ApiError(404, "nf"));
    vi.mocked(api.getPaymentAuditTimeline).mockRejectedValue(new api.ApiError(404, "Payment not found"));
    renderAudit("/app/audit?payment=ghost");
    expect(await screen.findByText("Payment not found")).toBeInTheDocument();
  });

  it("shows the real error with a working retry", async () => {
    vi.mocked(api.listPayments).mockResolvedValue([PAY_A]);
    vi.mocked(api.getPayment).mockResolvedValue(PAY_A);
    vi.mocked(api.getPaymentAuditTimeline).mockRejectedValueOnce(new api.ApiError(500, "Audit exploded"));
    renderAudit();
    expect(await screen.findByText("Audit exploded")).toBeInTheDocument();

    vi.mocked(api.getPaymentAuditTimeline).mockResolvedValue(TRACE);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("list", { name: "Audit events" });
  });

  it("pages the picker with Load more", async () => {
    const page1 = Array.from({ length: 26 }, (_, i) => makePayment({ id: `p${i}`, gateway_payment_id: `pay_${i}` }));
    vi.mocked(api.listPayments).mockResolvedValueOnce(page1).mockResolvedValueOnce([makePayment({ id: "p26", gateway_payment_id: "pay_26" })]);
    vi.mocked(api.getPayment).mockResolvedValue(PAY_A);
    vi.mocked(api.getPaymentAuditTimeline).mockResolvedValue(TRACE);
    renderAudit();

    await userEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await waitFor(() => expect(api.listPayments).toHaveBeenLastCalledWith({ limit: 26, offset: 25 }));
    expect(await screen.findByRole("button", { name: "Trace payment p26" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });
});

describe("AuditPage — forensic timeline", () => {
  it("summarises the trace from real timestamps", async () => {
    stub();
    renderAudit();
    await screen.findByRole("list", { name: "Audit events" });

    const header = document.querySelector("header") as HTMLElement;
    expect(within(header).getByText("5")).toBeInTheDocument(); // events
    expect(within(header).getByText("2.9s")).toBeInTheDocument(); // span: 09:00:00.000 → 09:00:02.900
    expect(within(header).getByText("pay-a")).toBeInTheDocument();
    expect(within(header).getByRole("link", { name: "Open payment" })).toHaveAttribute("href", "/app/payments/pay-a");
  });

  it("renders every event with ms time, T+ offset, raw action, actor and phase", async () => {
    stub();
    renderAudit();
    await screen.findByRole("list", { name: "Audit events" });

    const rows = events();
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent("T+0ms");
    expect(rows[1]).toHaveTextContent("T+1.250s");
    expect(rows[1]).toHaveTextContent("ai_decision_created");
    expect(rows[1]).toHaveTextContent("ai_engine");
    expect(rows[1]).toHaveTextContent("AI"); // derived phase
    expect(rows[3]).toHaveTextContent("Policy");
    expect(rows[4]).toHaveTextContent("T+2.900s");
    expect(rows[1].querySelector("time")).toHaveTextContent(/^\d{2}:\d{2}:\d{2}\.250$/);
  });

  it("draws one swim lane per actor present, with a dot only on that actor's rows", async () => {
    stub();
    renderAudit();
    await screen.findByRole("list", { name: "Audit events" });

    const rows = events();
    const lanes = (row: HTMLElement) => row.querySelectorAll('[title="system"], [title="ai_engine"], [title="policy_engine"], [title="executor"]');
    expect(lanes(rows[0])).toHaveLength(4); // system, ai_engine, policy_engine, executor
    // each row has exactly one dot
    for (const row of rows) expect(row.querySelectorAll(".rounded-full.ring-2")).toHaveLength(1);
    // the AI row's dot sits in the ai_engine lane
    expect(rows[1].querySelector('[title="ai_engine"] .rounded-full')).not.toBeNull();
    expect(rows[3].querySelector('[title="policy_engine"] .rounded-full')).not.toBeNull();
  });

  it("keeps metadata closed until opened, then shows decoded fields and the raw event JSON", async () => {
    stub();
    renderAudit();
    await screen.findByRole("list", { name: "Audit events" });

    const rows = events();
    expect(within(rows[4]).queryByText("provider_reference")).not.toBeInTheDocument();

    await userEvent.click(within(rows[4]).getByRole("button", { name: /Metadata/ }));
    expect(within(rows[4]).getByText("provider_reference")).toBeInTheDocument();
    expect(within(rows[4]).getByText("plink_X1")).toBeInTheDocument();
    expect(within(rows[4]).getByText("event id")).toBeInTheDocument();
    expect(within(rows[4]).getByText(/"actor": "executor"/)).toBeInTheDocument();
  });

  it("expands and collapses all metadata at once", async () => {
    stub();
    renderAudit();
    await screen.findByRole("list", { name: "Audit events" });

    await userEvent.click(screen.getByRole("button", { name: "Expand all metadata" }));
    expect(screen.getAllByText("event id")).toHaveLength(5);
    await userEvent.click(screen.getByRole("button", { name: "Collapse all metadata" }));
    expect(screen.queryAllByText("event id")).toHaveLength(0);
  });

  it("filters by actor with real counts, and keeps T+ offsets relative to the whole trace", async () => {
    stub();
    renderAudit();
    await screen.findByRole("list", { name: "Audit events" });

    const chip = screen.getByRole("button", { name: "executor, 1 event" });
    await userEvent.click(chip);

    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(events()).toHaveLength(1);
    expect(events()[0]).toHaveTextContent("T+2.900s"); // not reset to T+0 by the filter
    expect(screen.getByText("Showing 1 of 5 events")).toBeInTheDocument();
  });

  it("searches across metadata and offers to clear when nothing matches", async () => {
    stub();
    renderAudit();
    await screen.findByRole("list", { name: "Audit events" });

    await userEvent.type(screen.getByRole("searchbox"), "gpt-oss");
    expect(events()).toHaveLength(1);
    expect(events()[0]).toHaveTextContent("ai_decision_created");

    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.type(screen.getByRole("searchbox"), "zzz-nothing");
    expect(screen.getByText(/No events match these filters/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(events()).toHaveLength(5);
  });

  it("copies the exact trace JSON", async () => {
    stub();
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText");
    renderAudit();
    await screen.findByRole("list", { name: "Audit events" });
    await user.click(screen.getByRole("button", { name: "Copy JSON" }));

    await waitFor(() => expect(write).toHaveBeenCalled());
    const parsed = JSON.parse(write.mock.calls[0][0]);
    expect(parsed.payment_id).toBe("pay-a");
    expect(parsed.event_count).toBe(5);
    expect(parsed.events[4].details.provider_reference).toBe("plink_X1");
  });

  it("exports a JSON file named for the gateway payment id", async () => {
    stub();
    const created: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => (created.push(blob), "blob:x"));
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    renderAudit();
    await screen.findByRole("list", { name: "Audit events" });
    await userEvent.click(screen.getByRole("button", { name: "Export JSON" }));

    expect(click).toHaveBeenCalledTimes(1);
    expect(created[0].type).toBe("application/json");
    expect(JSON.parse(await created[0].text()).event_count).toBe(5);
  });

  it("inserts a date divider only where the day changes", async () => {
    vi.mocked(api.listPayments).mockResolvedValue([PAY_A]);
    vi.mocked(api.getPayment).mockResolvedValue(PAY_A);
    vi.mocked(api.getPaymentAuditTimeline).mockResolvedValue([
      makeAudit({ id: "d1", action: "webhook_received", created_at: new Date(2026, 9, 3, 23, 59, 59).toISOString() }),
      makeAudit({ id: "d2", action: "action_executed", actor: "executor", created_at: new Date(2026, 9, 4, 0, 0, 1).toISOString() }),
    ]);
    renderAudit();
    await screen.findByRole("list", { name: "Audit events" });

    const dividers = document.querySelectorAll('ol[aria-label="Audit events"] > li[aria-hidden="true"]');
    expect(dividers).toHaveLength(2); // one for each distinct day
    expect(dividers[0]).toHaveTextContent("3 Oct 2026");
    expect(dividers[1]).toHaveTextContent("4 Oct 2026");
  });

  it("handles a payment with no audit events", async () => {
    vi.mocked(api.listPayments).mockResolvedValue([PAY_A]);
    vi.mocked(api.getPayment).mockResolvedValue(PAY_A);
    vi.mocked(api.getPaymentAuditTimeline).mockResolvedValue([]);
    renderAudit();
    expect(await screen.findByText("No audit events have been recorded for this payment.")).toBeInTheDocument();
  });
});
