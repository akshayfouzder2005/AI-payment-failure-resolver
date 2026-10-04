import type { ChainNode } from "../../lib/investigation";

/**
 * What a section says when its step has no record yet. The wording follows
 * the chain node's real phase: running/waiting only while the pipeline is
 * plausibly in flight, "stopped" with the backend's own explanation, and a
 * plain "not run" otherwise — never a spinner implying work that isn't
 * happening.
 */
export function StepEmpty({
  node,
  noun,
  stopMessage,
}: {
  node: ChainNode;
  noun: string;
  stopMessage: string | null;
}) {
  const text =
    node.phase === "running"
      ? `${noun} is running now.`
      : node.phase === "waiting"
        ? `Waiting on an earlier step before ${noun.toLowerCase()} can start.`
        : node.phase === "stopped"
          ? (stopMessage ?? "The automatic pipeline stopped before this step.")
          : `No ${noun.toLowerCase()} has been recorded for this payment.`;

  return (
    <p
      className={`rounded-lg border border-dashed px-4 py-5 text-sm ${
        node.phase === "stopped" ? "border-danger/40 text-danger" : "border-border text-text-muted"
      }`}
    >
      {text}
    </p>
  );
}
