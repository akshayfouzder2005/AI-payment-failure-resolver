import { DOT_CLASSES, RING_CLASSES } from "../../lib/status";
import { formatDateTime, formatElapsedMs } from "../../lib/format";
import { elapsedBetween, type ChainNode, type ChainPhase, type Run } from "../../lib/investigation";
import { KindBadge } from "../ui/KindBadge";
import { ToneChip } from "../ui/ToneChip";
import type { Tone } from "../../lib/status";

/**
 * The execution trace: failure → AI → (trust boundary) → policy → action →
 * current status. Every node is derived from recorded backend state by
 * lib/investigation.ts#deriveChain; a node with nothing recorded is drawn as
 * not-yet-happened (waiting / not run / stopped), never as a success.
 *
 * Layout: a horizontal rail at xl and up, a vertical trace below it — the
 * same DOM both ways, only the flex/grid direction changes. The trust
 * boundary is a real (decorative) element between the AI and policy nodes.
 */
export function DecisionChain({
  nodes,
  runs,
  selectedRunId,
  onSelectRun,
  live,
}: {
  nodes: ChainNode[];
  runs: Run[];
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
  live: boolean;
}) {
  return (
    <section id="decision-chain" aria-labelledby="decision-chain-title" className="scroll-mt-6 border-t border-border pt-8">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="decision-chain-title" className="text-subhead text-text">
          Decision Chain
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          {live && (
            <span className="flex items-center gap-2 text-body-small text-text-muted" role="status">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inset-0 rounded-full bg-info/50 motion-safe:animate-ping" />
                <span className="relative h-2 w-2 rounded-full bg-info" />
              </span>
              Updating live
            </span>
          )}
          <RunSelector runs={runs} selectedId={selectedRunId} onSelect={onSelectRun} />
        </div>
      </div>
      <p className="mb-6 max-w-2xl text-body-small text-text-muted">
        Each step shows what the backend recorded. The dashed step is an AI suggestion; everything right of the trust
        boundary is deterministic code.
      </p>

      <ol className="grid grid-cols-1 xl:grid-cols-[repeat(2,minmax(0,1fr))_2.25rem_repeat(3,minmax(0,1fr))]">
        {nodes.map((node, index) => (
          <ChainStep
            key={node.key}
            node={node}
            previous={index > 0 ? nodes[index - 1] : null}
            next={index < nodes.length - 1 ? nodes[index + 1] : null}
            boundaryBefore={node.key === "policy"}
          />
        ))}
      </ol>
    </section>
  );
}

function ChainStep({
  node,
  previous,
  next,
  boundaryBefore,
}: {
  node: ChainNode;
  previous: ChainNode | null;
  next: ChainNode | null;
  boundaryBefore: boolean;
}) {
  const muted = node.phase === "idle" || node.phase === "waiting";
  const elapsed = node.key === "outcome" ? null : elapsedBetween(previous?.timestamp ?? null, node.timestamp);

  return (
    <>
      {boundaryBefore && <TrustBoundary />}
      <li
        className="relative flex gap-4 xl:flex-col xl:gap-0"
        data-node={node.key}
        data-kind={node.kind}
        data-phase={node.phase}
      >
        <div className="flex w-6 shrink-0 flex-col items-center xl:h-6 xl:w-auto xl:flex-row">
          <span className="mt-4 flex h-3 items-center xl:mt-0">
            <PhaseDot phase={node.phase} tone={node.tone} />
          </span>
          {next && (
            <span
              aria-hidden="true"
              className={`mt-1 w-0 flex-1 border-l xl:ml-2 xl:mt-0 xl:h-0 xl:w-auto xl:border-l-0 xl:border-t ${
                next.phase === "done" ? "border-border-strong" : "border-dashed border-border"
              }`}
            />
          )}
        </div>

        <a
          href={`#${node.anchor}`}
          aria-label={`${node.title}, ${node.stateLabel}: ${node.headline}`}
          className={`focus-ring mb-4 block min-w-0 flex-1 rounded-lg border p-3.5 transition-colors duration-150 hover:border-border-strong xl:mb-0 xl:mr-3 xl:mt-3 ${cardStyle(node)}`}
        >
          <KindBadge kind={node.kind} />

          <div className="mt-3 text-label uppercase text-text-muted">{node.title}</div>
          <div className={`mt-1 text-sm font-semibold ${muted ? "text-text-muted" : "text-text"}`}>{node.headline}</div>
          {node.detail && <p className="mt-1 line-clamp-2 break-words text-body-small text-text-muted">{node.detail}</p>}

          <div className="mt-3">
            <ToneChip tone={node.tone} label={node.stateLabel} />
          </div>
          {node.timestamp && (
            <div className="mt-2.5 font-mono text-[11px] leading-4 text-text-muted">
              <time dateTime={node.timestamp} className="block whitespace-nowrap">
                {formatDateTime(node.timestamp)}
              </time>
              {elapsed !== null && (
                <span className="block" title="Elapsed since the previous step">
                  +{formatElapsedMs(elapsed)} since previous
                </span>
              )}
            </div>
          )}
        </a>
      </li>
    </>
  );
}

function cardStyle(node: ChainNode): string {
  switch (node.kind) {
    case "advisory":
      return "border-dashed border-info/50 bg-info/5";
    case "authoritative":
      return "border-border-strong bg-surface-raised";
    default:
      return node.phase === "idle" || node.phase === "waiting"
        ? "border-border bg-transparent"
        : "border-border bg-surface-raised";
  }
}

function PhaseDot({ phase, tone }: { phase: ChainPhase; tone: Tone }) {
  const base = "relative block h-3 w-3 shrink-0 rounded-full";

  if (phase === "done") return <span aria-hidden="true" className={`${base} ${DOT_CLASSES[tone]}`} />;
  if (phase === "running") {
    return (
      <span aria-hidden="true" className={`${base} ${DOT_CLASSES.info}`}>
        <span className="absolute inset-0 rounded-full bg-info/50 motion-safe:animate-ping" />
      </span>
    );
  }
  if (phase === "stopped") {
    return <span aria-hidden="true" className={`${base} border-2 bg-danger/20 ${RING_CLASSES.danger}`} />;
  }
  if (phase === "waiting") return <span aria-hidden="true" className={`${base} border-2 border-text-faint`} />;
  return <span aria-hidden="true" className={`${base} border-2 border-dashed border-border-strong`} />;
}

/**
 * Everything left of this line is advisory input; everything right of it is
 * authoritative. Decorative (aria-hidden): the same distinction is carried
 * in text by each node's KindBadge.
 */
function TrustBoundary() {
  return (
    <li aria-hidden="true" className="relative my-1 flex items-center justify-center xl:my-0 xl:w-9">
      <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-border-strong xl:inset-x-auto xl:inset-y-0 xl:left-1/2 xl:top-0 xl:border-l xl:border-t-0" />
      <span className="relative bg-surface px-2 text-label uppercase text-text-muted xl:px-0 xl:py-2 xl:[writing-mode:vertical-rl] xl:rotate-180">
        Trust boundary
      </span>
    </li>
  );
}

function RunSelector({
  runs,
  selectedId,
  onSelect,
}: {
  runs: Run[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (runs.length < 2) return null;

  return (
    <div role="group" aria-label="Pipeline run" className="flex items-center gap-1.5">
      <span className="text-body-small text-text-muted">Run</span>
      {runs.map((run) => (
        <button
          key={run.id}
          type="button"
          aria-pressed={run.id === selectedId}
          onClick={() => onSelect(run.id)}
          className={`focus-ring rounded border px-2 py-0.5 text-xs font-medium tabular-nums transition-colors duration-150 ${
            run.id === selectedId
              ? "border-border-strong bg-surface-raised text-text"
              : "border-transparent text-text-muted hover:border-border hover:text-text"
          }`}
        >
          {run.index}
        </button>
      ))}
      <span className="text-body-small text-text-muted">of {runs.length}</span>
    </div>
  );
}
