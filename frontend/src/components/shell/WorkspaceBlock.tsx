/**
 * The active workspace — the merchant this session is scoped to (every
 * authenticated route is merchant-scoped from the bearer token alone, so
 * there is exactly one). Deliberately a static block, not a switcher: no
 * chevron, no menu, because there is nothing to switch to.
 */
export function WorkspaceBlock({ name }: { name?: string }) {
  const label = name?.trim() ?? "";
  const initial = label.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-accent/15 text-sm font-semibold text-accent"
        aria-hidden="true"
      >
        {initial || "·"}
      </span>
      <span className="min-w-0">
        <span className="block text-label uppercase text-text-muted">Workspace</span>
        <span className="block truncate text-sm font-medium text-text">{label || "—"}</span>
      </span>
    </div>
  );
}
