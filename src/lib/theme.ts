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
