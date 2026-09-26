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
