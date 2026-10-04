import { DOT_CLASSES, RING_CLASSES } from "../../lib/status";
import { barGeometry, type Trace, type TraceStage } from "../../lib/trace";
import { formatElapsedMs } from "../../lib/format";
import { ToneChip } from "../ui/ToneChip";

/**
 * Seven stages as a trace: state on the left, a waterfall on the right whose
 * bars are positioned from real recorded timestamps. A stage with no
 * timestamps has no bar — the track stays empty rather than inventing a
 * duration. The time axis is the span between the earliest and latest real
 * timestamp seen so far, so it grows as the backend produces more.
 */
export function TraceWaterfall({ trace }: { trace: Trace }) {
  const span = trace.window ? trace.window.endMs - trace.window.startMs : null;

  return (
    <ol className="relative" aria-label="Execution trace">
      <li className="mb-1 hidden items-center md:flex" aria-hidden="true">
        <div className="w-[min(46%,22rem)] shrink-0" />
        <div className="flex flex-1 justify-between px-1 font-mono text-[11px] text-text-muted">
          <span>T+0</span>
          <span>{span === null ? "—" : `T+${formatElapsedMs(span)}`}</span>
        </div>
      </li>

      {trace.stages.map((stage, index) => (
        <StageRow key={stage.key} stage={stage} trace={trace} isLast={index === trace.stages.length - 1} />
      ))}
    </ol>
  );
}

function StageRow({ stage, trace, isLast }: { stage: TraceStage; trace: Trace; isLast: boolean }) {
  const geometry = stage.bar && trace.window ? barGeometry(stage.bar, trace.window) : null;
  const duration = stage.bar ? stage.bar.endMs - stage.bar.startMs : null;
  const muted = stage.phase === "idle" || stage.phase === "waiting";

  return (
    <li
      data-stage={stage.key}
      data-phase={stage.phase}
      className="relative flex flex-col gap-2 border-t border-border py-3 first:border-t-0 md:flex-row md:items-center md:gap-0"
    >
      <div className="flex min-w-0 gap-3 md:w-[min(46%,22rem)] md:shrink-0 md:pr-4">
        <div className="flex w-3 shrink-0 flex-col items-center pt-1.5">
          <Dot phase={stage.phase} tone={stage.tone} />
          {!isLast && <span aria-hidden="true" className="mt-1 w-px flex-1 bg-border md:hidden" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-label uppercase text-text-muted">{stage.title}</span>
            <ToneChip tone={stage.tone} label={stage.stateLabel} />
          </div>
          <div className={`mt-1 break-words text-sm font-medium ${muted ? "text-text-muted" : "text-text"}`}>
            {stage.headline}
          </div>
          {stage.detail && <p className="mt-0.5 line-clamp-2 break-words text-body-small text-text-muted">{stage.detail}</p>}
        </div>
      </div>

      <div className="relative h-5 flex-1 md:px-1" aria-hidden="true">
        <div className="absolute inset-x-0 top-1/2 h-px bg-border md:inset-x-1" />
        {geometry && (
          <div
            className={`absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm ${DOT_CLASSES[stage.tone]} ${
              stage.kind === "advisory" ? "opacity-60" : ""
            }`}
            style={{ left: `${geometry.left}%`, width: `${geometry.width}%` }}
            title={duration !== null ? formatElapsedMs(duration) : undefined}
          />
        )}
      </div>
      {geometry && duration !== null && (
        <span className="font-mono text-[11px] text-text-muted md:w-16 md:text-right">{formatElapsedMs(duration)}</span>
      )}
      {!geometry && <span className="hidden w-16 md:block" aria-hidden="true" />}
    </li>
  );
}

function Dot({ phase, tone }: { phase: TraceStage["phase"]; tone: TraceStage["tone"] }) {
  const base = "relative block h-3 w-3 shrink-0 rounded-full";
  if (phase === "done") return <span aria-hidden="true" className={`${base} ${DOT_CLASSES[tone]}`} />;
  if (phase === "running") {
    return (
      <span aria-hidden="true" className={`${base} ${DOT_CLASSES.info}`}>
        <span className="absolute inset-0 rounded-full bg-info/50 motion-safe:animate-ping" />
      </span>
    );
  }
  if (phase === "stopped") return <span aria-hidden="true" className={`${base} border-2 bg-danger/20 ${RING_CLASSES.danger}`} />;
  if (phase === "waiting") return <span aria-hidden="true" className={`${base} border-2 border-text-faint`} />;
  return <span aria-hidden="true" className={`${base} border-2 border-dashed border-border-strong`} />;
}
