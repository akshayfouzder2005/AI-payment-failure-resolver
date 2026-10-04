import type { ChainNodeKind } from "../../lib/investigation";

const LABELS: Record<ChainNodeKind, string> = {
  observed: "Observed",
  advisory: "Advisory · AI",
  authoritative: "Authoritative · Policy",
  executor: "Executor",
  result: "Result",
};

/**
 * The trust-boundary marker. AI and the policy engine are drawn with
 * deliberately different grammars everywhere they appear:
 *   advisory      — dashed outline, info tint (a suggestion)
 *   authoritative — solid, inverted ink fill (a ruling)
 * so no screen state can make an AI recommendation look like a decision.
 */
export function KindBadge({ kind }: { kind: ChainNodeKind }) {
  const style =
    kind === "advisory"
      ? "border border-dashed border-info/60 bg-info/10 text-info"
      : kind === "authoritative"
        ? "border border-text bg-text text-canvas"
        : "border border-border text-text-muted";

  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-label uppercase ${style}`}>
      {LABELS[kind]}
    </span>
  );
}
