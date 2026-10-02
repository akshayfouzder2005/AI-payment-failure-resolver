export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // text-on-accent, not text-canvas: canvas is the darkest neutral in
  // dark mode but the lightest in light mode, so it can't double as
  // "whatever contrasts against the accent fill" once a second theme
  // exists — see tailwind.config.js's on-accent token comment.
  primary: "bg-accent text-on-accent hover:bg-accent/90",
  secondary: "border border-border text-text hover:border-border-strong",
  quiet: "text-text-muted hover:text-text",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
};

const BASE_CLASSES =
  "focus-ring inline-flex items-center justify-center gap-2 rounded px-3.5 py-2 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Shared with anything that needs to *look* like a Button without being
 * one — e.g. a react-router `Link` styled as a primary action. Nesting a
 * real `<button>` inside an `<a>` (as GetStartedPage used to) is invalid,
 * nested-interactive markup; this lets a `Link` carry the exact same
 * classes directly instead.
 */
export function buttonClassName(variant: ButtonVariant = "secondary", className = ""): string {
  return `${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className}`;
}
