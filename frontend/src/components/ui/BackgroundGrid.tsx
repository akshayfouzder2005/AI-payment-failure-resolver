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
