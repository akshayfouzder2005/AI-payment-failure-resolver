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
