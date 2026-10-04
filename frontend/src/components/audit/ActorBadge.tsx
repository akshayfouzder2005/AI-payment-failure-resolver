/**
 * Who wrote an audit event, in the same visual grammar as the Decision Chain
 * and Policy panels: the AI engine is dashed/info (advisory), the policy
 * engine is solid inverted (authoritative), the executor and system are
 * neutral. The raw actor string is always the label.
 */
export function ActorBadge({ actor }: { actor: string }) {
  const style =
    actor === "ai_engine"
      ? "border border-dashed border-info/60 bg-info/10 text-info"
      : actor === "policy_engine"
        ? "border border-text bg-text text-canvas"
        : actor === "executor"
          ? "border border-border-strong text-text"
          : "border border-border text-text-muted";

  return (
    <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[11px] ${style}`} title="Actor">
      {actor}
    </span>
  );
}
