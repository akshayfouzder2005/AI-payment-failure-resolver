import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme } from "./ThemeContext";

function Probe() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button onClick={toggleTheme} aria-label="probe-toggle">
      {theme}
    </button>
  );
}

function renderProbe() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

describe("ThemeContext", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to dark when nothing is stored, matching the app's existing look", () => {
    renderProbe();
    expect(screen.getByText("dark")).toBeInTheDocument();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("reads a previously stored preference on mount", () => {
    localStorage.setItem("recoverai_theme", "light");
    renderProbe();
    expect(screen.getByText("light")).toBeInTheDocument();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("toggling flips the theme, updates the document attribute, and persists it", async () => {
    renderProbe();
    await userEvent.click(screen.getByRole("button", { name: "probe-toggle" }));

    expect(screen.getByText("light")).toBeInTheDocument();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("recoverai_theme")).toBe("light");

    await userEvent.click(screen.getByRole("button", { name: "probe-toggle" }));
    expect(screen.getByText("dark")).toBeInTheDocument();
    expect(localStorage.getItem("recoverai_theme")).toBe("dark");
  });

  it("ignores a corrupt stored value rather than crashing", () => {
    localStorage.setItem("recoverai_theme", "not-a-real-theme");
    renderProbe();
    expect(screen.getByText("dark")).toBeInTheDocument();
  });
});
