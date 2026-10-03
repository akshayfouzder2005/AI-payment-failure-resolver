import type { ReactNode } from "react";

/**
 * Title row for a dashboard section: heading left, optional quiet aside
 * right (a link or a one-line caption). Baseline-aligned so a small aside
 * sits on the heading's text line, not its box.
 */
export function SectionHeader({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 className="text-subhead text-text">{title}</h2>
      {aside && <div className="shrink-0 text-body-small text-text-muted">{aside}</div>}
    </div>
  );
}
