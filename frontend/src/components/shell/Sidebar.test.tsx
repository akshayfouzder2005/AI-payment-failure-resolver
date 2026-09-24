import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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
  it("marks the active item with the spec's left-rail + accent-text combination, and nothing else", () => {
    renderSidebar("/app");
    const overview = screen.getByRole("link", { name: "Overview" });

    expect(overview.className).toContain("border-border-strong");
    expect(overview.className).toContain("text-accent");
    // The spec is explicit: rail + text color only, "not a filled pill" —
    // no background tint on top of that, however subtle.
    expect(overview.className).not.toContain("bg-accent-muted");
    expect(overview.className).not.toContain("border-accent");
  });

  it("leaves inactive items unstyled as active", () => {
    renderSidebar("/app");
    const payments = screen.getByRole("link", { name: "Payments" });

    expect(payments.className).not.toContain("text-accent");
    expect(payments.className).not.toContain("border-border-strong");
  });

  it("lists all five nav destinations", () => {
    renderSidebar("/app");
    ["Overview", "Payments", "Recovery Lab", "Audit", "Account"].forEach((label) =>
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument(),
    );
  });
});
