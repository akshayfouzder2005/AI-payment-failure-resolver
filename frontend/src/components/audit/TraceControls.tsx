import { laneDotClass } from "../../lib/audit";
import { Button } from "../ui/Button";

/**
 * Actor chips double as the lane legend and the filter: each carries the
 * lane's dot colour and the real event count for that actor. Selecting none
 * means "all". Search matches action, actor, entity and any metadata text.
 */
export function TraceControls({
  actorCounts,
  selectedActors,
  onToggleActor,
  query,
  onQuery,
  allExpanded,
  onToggleExpandAll,
  onExport,
  onCopy,
  shown,
  total,
}: {
  actorCounts: { actor: string; count: number }[];
  selectedActors: Set<string>;
  onToggleActor: (actor: string) => void;
  query: string;
  onQuery: (query: string) => void;
  allExpanded: boolean;
  onToggleExpandAll: () => void;
  onExport: () => void;
  onCopy: () => void;
  shown: number;
  total: number;
}) {
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Filter by actor" className="flex flex-wrap items-center gap-1.5">
        {actorCounts.map(({ actor, count }) => {
          const active = selectedActors.has(actor);
          return (
            <button
              key={actor}
              type="button"
              aria-pressed={active}
              aria-label={`${actor}, ${count} ${count === 1 ? "event" : "events"}`}
              onClick={() => onToggleActor(actor)}
              className={`focus-ring inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-xs transition-colors duration-150 ${
                active ? "border-border-strong bg-surface-raised text-text" : "border-border text-text-muted hover:border-border-strong hover:text-text"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${laneDotClass(actor)}`} aria-hidden="true" />
              {actor}
              <span className="tabular-nums text-text-muted">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="sr-only" htmlFor="audit-search">
          Search events
        </label>
        <input
          id="audit-search"
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search action, actor, entity, metadata…"
          className="focus-ring min-w-[14rem] flex-1 rounded border border-border bg-surface-raised px-3 py-1.5 text-sm text-text transition-colors duration-150 placeholder:text-text-faint hover:border-border-strong"
        />
        <Button variant="secondary" onClick={onToggleExpandAll} className="py-1.5">
          {allExpanded ? "Collapse all metadata" : "Expand all metadata"}
        </Button>
        <Button variant="secondary" onClick={onCopy} className="py-1.5">
          Copy JSON
        </Button>
        <Button variant="secondary" onClick={onExport} className="py-1.5">
          Export JSON
        </Button>
      </div>

      <p className="text-body-small tabular-nums text-text-muted" role="status">
        Showing {shown} of {total} {total === 1 ? "event" : "events"}
      </p>
    </div>
  );
}
