import type { ReactNode } from "react";

/**
 * Shared empty-state block — every empty state names why it's empty and
 * what to do next (design spec §24), never a blank panel. Reused across
 * Overview (new-merchant workspace) and, in later phases, Payments
 * (filter returns nothing) and Audit Explorer (nothing selected yet).
 */
export function EmptyState({
  title,
  description,
  action,
  note,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  note?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-6 py-10 text-center">
      <h2 className="text-heading">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">{description}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
      {note && <p className="mx-auto mt-4 max-w-md text-xs text-text-faint">{note}</p>}
    </div>
  );
}
