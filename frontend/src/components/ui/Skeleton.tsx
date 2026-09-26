/**
 * A single pulsing block, composed by each page into a skeleton that
 * matches its real layout shape (design spec §24) — never a lone
 * spinner on a blank page. `aria-hidden` since the loading state itself
 * is announced once, by the page, not per block.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-raised ${className}`} aria-hidden="true" />;
}
