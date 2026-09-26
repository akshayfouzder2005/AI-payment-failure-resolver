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
