#!/usr/bin/env bash
# design_system_v2_foundation_create_new_files.sh
# RecoverAI Financial Instrumentation design system v2 -- visual foundation pass.
# Creates NEW files only. Run from the repository's frontend/ directory.
set -euo pipefail

mkdir -p "src/lib"
cat > "src/lib/theme.ts" << 'RECOVERAI_EOF'
export type Theme = "dark" | "light";

// Kept in sync by hand with the inline bootstrap script in index.html —
// that script runs before any JS module loads, so it can't import this
// constant. If this key ever changes, index.html's copy must change too.
const THEME_KEY = "recoverai_theme";

export function getStoredTheme(): Theme | null {
  const value = localStorage.getItem(THEME_KEY);
  return value === "dark" || value === "light" ? value : null;
}

export function setStoredTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme);
}
RECOVERAI_EOF

mkdir -p "src/context"
cat > "src/context/ThemeContext.tsx" << 'RECOVERAI_EOF'
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getStoredTheme, setStoredTheme, type Theme } from "../lib/theme";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Dark is the default whenever nothing is stored yet — that's the app's
// existing, already-shipped look, so a first-time visitor sees exactly
// what they saw before this pass. It deliberately does not fall back to
// prefers-color-scheme; that's a product decision to revisit later; see
// design system v2 §23 migration notes.
const DEFAULT_THEME: Theme = "dark";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme() ?? DEFAULT_THEME);

  // The single place that keeps <html data-theme="..."> (what every CSS
  // variable in index.css keys off) and localStorage (what survives a
  // reload) in sync with React state. index.html's inline script already
  // set the attribute once, synchronously, before this component ever
  // mounts — this effect exists for every change *after* that, including
  // the very first render if the inline script and this state disagree.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    setStoredTheme(theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
RECOVERAI_EOF

mkdir -p "src/context"
cat > "src/context/ThemeContext.test.tsx" << 'RECOVERAI_EOF'
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
RECOVERAI_EOF

mkdir -p "src/components/ui"
cat > "src/components/ui/ThemeToggle.tsx" << 'RECOVERAI_EOF'
import { useTheme } from "../../context/ThemeContext";

/**
 * A text-only control, matching TopBar's existing environment-chip
 * style — no icon library, per the no-sparkle-iconography rule. Labeled
 * with the theme it switches *to*, not the current one, matching how a
 * light-switch is usually labeled by the action, not the state.
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const target = theme === "dark" ? "light" : "dark";

  return (
    <button
      onClick={toggleTheme}
      aria-label={`Switch to ${target} theme`}
      className="focus-ring rounded px-2 py-1 text-label uppercase text-text-muted transition-colors duration-150 hover:text-text"
    >
      {target}
    </button>
  );
}
RECOVERAI_EOF

mkdir -p "src/components/ui"
cat > "src/components/ui/Input.tsx" << 'RECOVERAI_EOF'
import type { InputHTMLAttributes } from "react";

/**
 * Input system — the label/input/hint structure Login and Register each
 * hand-duplicated identically. Same classes, same markup shape as
 * before; this is an extraction, not a redesign, so existing pages don't
 * change visually by adopting it. `wrapperClassName` exists solely so a
 * form's last field can keep the extra `mb-6` breathing room before its
 * submit button that both pages already had — `className` itself stays
 * scoped to the `<input>` element, matching InputHTMLAttributes.
 */
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  wrapperClassName?: string;
}

export function Input({ label, hint, wrapperClassName = "mb-3", className = "", id, ...props }: InputProps) {
  return (
    <label className={`block text-sm ${wrapperClassName}`}>
      <span className="mb-1 block text-text-muted">{label}</span>
      <input
        id={id}
        className={`focus-ring w-full rounded border border-border bg-surface px-3 py-2 text-text outline-none ${className}`}
        {...props}
      />
      {hint && <span className="mt-1 block text-xs text-text-faint">{hint}</span>}
    </label>
  );
}
RECOVERAI_EOF

mkdir -p "src/components/ui"
cat > "src/components/ui/GradientField.tsx" << 'RECOVERAI_EOF'
/**
 * Gradient system (design system v2 §6) — a decorative "Amber Drift"
 * wash for public marketing surfaces only. Not wired into Get Started,
 * Login, or Register yet: that page-level composition is the next
 * visual phase's job, not this foundation pass. Purely decorative
 * (aria-hidden), so it must never be the only thing conveying
 * information, and it must sit behind real content (a caller places it
 * absolutely inside a `relative` container).
 */
export function GradientField({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`bg-gradient-amber-drift ${className}`} />;
}
RECOVERAI_EOF

mkdir -p "src/components/ui"
cat > "src/components/ui/BackgroundGrid.tsx" << 'RECOVERAI_EOF'
/**
 * Grid/background system (design system v2 §7) — the faint vertical
 * rule grid for public marketing surfaces only, meant to read as almost
 * subliminal. Not wired into any page yet; that composition work
 * belongs to the next visual phase. Purely decorative (aria-hidden) and
 * never used inside the authenticated app, which gets its structure
 * from real borders instead.
 */
export function BackgroundGrid({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`bg-grid-faint ${className}`} />;
}
RECOVERAI_EOF

echo "Created 7 new files."
