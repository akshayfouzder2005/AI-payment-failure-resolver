import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "./Sidebar";

function renderSidebar(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe("Sidebar active state", () => {
  it("marks exactly the current route as selected, via aria-current and the selected styling", () => {
    renderSidebar("/app");
    const overview = screen.getByRole("link", { name: "Overview" });

    expect(overview).toHaveAttribute("aria-current", "page");
    // Selected = soft raised fill + strong text. Accent is reserved for the
    // short rail and the icon, never a filled accent pill.
    expect(overview.className).toContain("bg-surface-raised");
    expect(overview.className).toContain("font-medium");
    expect(overview.className).not.toMatch(/(^|\s)bg-accent(\s|$)/);
  });

  it("leaves inactive items unselected", () => {
    renderSidebar("/app");
    const payments = screen.getByRole("link", { name: "Payments" });

    expect(payments).not.toHaveAttribute("aria-current");
    expect(payments.className).not.toContain("bg-surface-raised");
    expect(payments.className).not.toContain("font-medium");
  });

  it("keeps Payments selected on a nested payment-detail route, but not Overview", () => {
    renderSidebar("/app/payments/pay_123");

    expect(screen.getByRole("link", { name: "Payments" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("lists all five nav destinations", () => {
    renderSidebar("/app");
    ["Overview", "Payments", "Recovery Lab", "Audit", "Account"].forEach((label) =>
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument(),
    );
  });

  it("groups destinations under Monitor, Recovery and Settings", () => {
    renderSidebar("/app");

    expect(within(screen.getByRole("list", { name: "Monitor" })).getAllByRole("link")).toHaveLength(2);
    expect(within(screen.getByRole("list", { name: "Recovery" })).getAllByRole("link")).toHaveLength(2);
    expect(within(screen.getByRole("list", { name: "Settings" })).getAllByRole("link")).toHaveLength(1);
  });
});

describe("Sidebar workspace block", () => {
  it("shows the active workspace name when one is provided", () => {
    render(
      <MemoryRouter initialEntries={["/app"]}>
        <Sidebar workspaceName="Acme Retail" />
      </MemoryRouter>,
    );
    expect(screen.getByText("Acme Retail")).toBeInTheDocument();
  });

  it("shows a dash rather than inventing a name before the session resolves", () => {
    renderSidebar("/app");
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
