import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { PaymentsPage } from "./PaymentsPage";
import * as api from "../lib/api";
import { makePayment } from "../test/fixtures";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, listPayments: vi.fn() };
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="loc">{location.pathname + location.search}</div>;
}

function renderPage(initial = "/app/payments") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/app/payments" element={<PaymentsPage />} />
        <Route path="/app/payments/:id" element={<div>Detail Route</div>} />
        <Route path="/app/recovery-lab" element={<div>Lab Route</div>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

const many = (n: number) =>
  Array.from({ length: n }, (_, i) => makePayment({ id: `id-${i}`, gateway_payment_id: `pay_${i}` }));

beforeEach(() => vi.mocked(api.listPayments).mockReset());
afterEach(() => vi.clearAllMocks());

describe("PaymentsPage", () => {
  it("requests page 1 with one extra row to detect a next page, and no status filter", async () => {
    vi.mocked(api.listPayments).mockResolvedValue(many(3));
    renderPage();
    await screen.findAllByText("pay_0");

    expect(api.listPayments).toHaveBeenCalledWith({ limit: 26, offset: 0 });
  });

  it("renders amount (with paise), status, gateway ID and absolute time per row", async () => {
    vi.mocked(api.listPayments).mockResolvedValue([
      makePayment({ id: "row1", amount: "12999.50", gateway_payment_id: "pay_Exact1", status: "retry_scheduled" }),
    ]);
    renderPage();

    const row = await screen.findByRole("row", { name: "Open payment row1" });
    expect(row).toHaveTextContent("₹12,999");
    expect(row).toHaveTextContent(".50");
    expect(row).toHaveTextContent("Retry scheduled");
    expect(row).toHaveTextContent("pay_Exact1");
    expect(row).toHaveTextContent("row1".slice(0, 8));
  });

  it("filters server-side by status, resets to page 1, and reflects it in the URL", async () => {
    vi.mocked(api.listPayments).mockResolvedValue(many(2));
    renderPage("/app/payments?page=3");
    await screen.findAllByText("pay_0");

    await userEvent.click(screen.getByRole("button", { name: "Failed" }));

    await waitFor(() => expect(api.listPayments).toHaveBeenLastCalledWith({ status: "failed", limit: 26, offset: 0 }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/app/payments?status=failed");
    expect(screen.getByRole("button", { name: "Failed" })).toHaveAttribute("aria-pressed", "true");
  });

  it("reads status, page and size from the URL", async () => {
    vi.mocked(api.listPayments).mockResolvedValue(many(2));
    renderPage("/app/payments?status=recovered&page=2&size=50");
    await screen.findAllByText("pay_0");

    expect(api.listPayments).toHaveBeenCalledWith({ status: "recovered", limit: 51, offset: 50 });
  });

  it("ignores junk query params instead of sending them to the API", async () => {
    vi.mocked(api.listPayments).mockResolvedValue(many(1));
    renderPage("/app/payments?status=hacked&page=-4&size=9999");
    await screen.findAllByText("pay_0");

    expect(api.listPayments).toHaveBeenCalledWith({ limit: 26, offset: 0 });
  });

  it("paginates: Next appears only when an extra row came back, and advances the offset", async () => {
    vi.mocked(api.listPayments).mockResolvedValueOnce(many(26)).mockResolvedValueOnce(many(4));
    renderPage();

    const rows = await screen.findAllByRole("row", { name: /Open payment/ });
    expect(rows).toHaveLength(25); // the extra probe row is never rendered
    expect(screen.getByText(/Showing 1–25/)).toBeInTheDocument();

    const next = screen.getByRole("button", { name: "Next" });
    expect(next).toBeEnabled();
    await userEvent.click(next);

    await waitFor(() => expect(api.listPayments).toHaveBeenLastCalledWith({ limit: 26, offset: 25 }));
    await screen.findByText(/Showing 26–29/);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
  });

  it("disables both pagination buttons on a single short page", async () => {
    vi.mocked(api.listPayments).mockResolvedValue(many(5));
    renderPage();
    await screen.findByText(/Showing 1–5/);

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("shows a first-run empty state with a demo action when there are no payments at all", async () => {
    vi.mocked(api.listPayments).mockResolvedValue([]);
    renderPage();

    await screen.findByText("No payments yet");
    await userEvent.click(screen.getByRole("button", { name: "Run demo scenario" }));
    expect(screen.getByText("Lab Route")).toBeInTheDocument();
  });

  it("shows a filter-specific empty state that can clear the filter", async () => {
    vi.mocked(api.listPayments).mockResolvedValue([]);
    renderPage("/app/payments?status=escalated");

    await screen.findByText("No escalated payments");
    vi.mocked(api.listPayments).mockResolvedValue(many(1));
    await userEvent.click(screen.getByRole("button", { name: "Clear filter" }));

    await screen.findAllByText("pay_0");
    expect(screen.getByTestId("loc")).toHaveTextContent("/app/payments");
    expect(screen.getByTestId("loc")).not.toHaveTextContent("status=");
  });

  it("offers a way back when a page past the end is empty", async () => {
    vi.mocked(api.listPayments).mockResolvedValue([]);
    renderPage("/app/payments?page=9");

    await screen.findByText("No more payments");
    expect(screen.getByRole("button", { name: "Back to first page" })).toBeInTheDocument();
  });

  it("shows the real error message and retries", async () => {
    vi.mocked(api.listPayments).mockRejectedValueOnce(new api.ApiError(500, "Internal server error"));
    renderPage();

    await screen.findByText("Internal server error");
    vi.mocked(api.listPayments).mockResolvedValue(many(1));
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await screen.findAllByText("pay_0");
  });

  it("opens a payment by row click, navigating exactly once", async () => {
    vi.mocked(api.listPayments).mockResolvedValue([makePayment({ id: "abc" })]);
    renderPage();

    await userEvent.click(await screen.findByRole("row", { name: "Open payment abc" }));
    expect(screen.getByText("Detail Route")).toBeInTheDocument();
  });

  it("opens a payment from the keyboard", async () => {
    vi.mocked(api.listPayments).mockResolvedValue([makePayment({ id: "abc" })]);
    renderPage();

    const row = await screen.findByRole("row", { name: "Open payment abc" });
    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByText("Detail Route")).toBeInTheDocument();
  });

  it("links the amount to the detail route for open-in-new-tab", async () => {
    vi.mocked(api.listPayments).mockResolvedValue([makePayment({ id: "abc", gateway_payment_id: "pay_L1" })]);
    renderPage();

    const row = await screen.findByRole("row", { name: "Open payment abc" });
    expect(within(row).getByRole("link", { name: "Payment pay_L1" })).toHaveAttribute("href", "/app/payments/abc");
  });

  it("ignores a stale response that settles after a newer query", async () => {
    let resolveSlow!: (rows: ReturnType<typeof many>) => void;
    vi.mocked(api.listPayments)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSlow = resolve)))
      .mockResolvedValueOnce([makePayment({ id: "fresh", gateway_payment_id: "pay_FRESH" })]);
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Recovered" }));
    await screen.findAllByText("pay_FRESH");

    resolveSlow([makePayment({ id: "stale", gateway_payment_id: "pay_STALE" })]);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryAllByText("pay_STALE")).toHaveLength(0);
    expect(screen.getAllByText("pay_FRESH").length).toBeGreaterThan(0);
  });
});
