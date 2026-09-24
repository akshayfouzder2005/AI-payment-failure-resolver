import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GetStartedPage } from "./GetStartedPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <GetStartedPage />
    </MemoryRouter>,
  );
}

describe("GetStartedPage", () => {
  it("renders the decision chain steps in the documented order", () => {
    const { container } = renderPage();
    const steps = ["Payment failed", "AI diagnosis", "Policy gate", "Recovery action", "Audited result"];
    steps.forEach((step) => expect(screen.getByText(step)).toBeInTheDocument());

    const text = container.textContent ?? "";
    const positions = steps.map((step) => text.indexOf(step));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("links Register and Log in to the real auth routes", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });

  it("lists exactly the three documented How It Works points", () => {
    renderPage();
    expect(screen.getByText(/An AI model recommends a recovery action\./)).toBeInTheDocument();
    expect(screen.getByText(/A deterministic policy engine.*decides whether/)).toBeInTheDocument();
    expect(screen.getByText(/The AI never moves money directly\./)).toBeInTheDocument();
  });

  it("has no dead links — every link on the page goes somewhere real", () => {
    renderPage();
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).not.toHaveAttribute("href", "#");
    }
  });
});
