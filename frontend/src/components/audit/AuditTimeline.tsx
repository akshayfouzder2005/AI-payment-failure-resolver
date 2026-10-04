import { Fragment, useMemo } from "react";
import { classifyPhase, dayKey, formatOffset, formatTimeMs, laneDotClass, laneOrder, offsetFromStart } from "../../lib/audit";
import { formatDateTime, humanizeCode } from "../../lib/format";
import { auditExtras, auditMessage } from "../../lib/investigation";
import { CopyButton } from "../ui/CopyButton";
import { ActorBadge } from "./ActorBadge";
import type { AuditLogRead } from "../../types/api";

/**
 * The forensic timeline. Time hierarchy: millisecond wall-clock time first
 * (so same-second events stay ordered), the offset from the trace's first
 * event under it, and a date divider only where the day changes. Each actor
 * gets a swim lane — a continuous vertical line with a dot on the rows that
 * actor wrote — so who-did-what and handoffs between actors read at a glance.
 * Metadata is closed by default and opens per event (or all at once).
 */
export function AuditTimeline({
  entries,
  allEntries,
  openIds,
  onToggle,
}: {
  entries: AuditLogRead[];
  /** the unfiltered list: lanes and T+ offsets are always relative to the whole trace */
  allEntries: AuditLogRead[];
  openIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const lanes = useMemo(() => laneOrder(allEntries), [allEntries]);
  const startedAt = allEntries[0]?.created_at ?? null;

  return (
    <ol aria-label="Audit events" className="relative">
      {entries.map((entry, index) => {
        const previous = index > 0 ? entries[index - 1] : null;
        const newDay = !previous || dayKey(previous.created_at) !== dayKey(entry.created_at);
        const offset = offsetFromStart(entry, startedAt);
        const open = openIds.has(entry.id);
        const message = auditMessage(entry);
        const extras = auditExtras(entry);
        const phase = classifyPhase(entry.action);

        return (
          <Fragment key={entry.id}>
            {newDay && (
              <li aria-hidden="true" className="flex items-center gap-3 pb-2 pt-4 first:pt-0">
                <span className="text-label uppercase text-text-muted">
                  {formatDateTime(entry.created_at, { seconds: false }).split(",")[0]}
                </span>
                <span className="h-px flex-1 bg-border" />
              </li>
            )}
            <li data-action={entry.action} data-actor={entry.actor} className="flex gap-3 md:gap-4">
              <div className="w-[5.75rem] shrink-0 pt-2.5 md:w-32">
                <time dateTime={entry.created_at} className="block font-mono text-[13px] font-semibold tabular-nums text-text">
                  {formatTimeMs(entry.created_at)}
                </time>
                <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-text-muted" title="Offset from the first event">
                  {offset === null ? "—" : formatOffset(offset)}
                </span>
              </div>

              <div className="flex shrink-0" aria-hidden="true">
                {lanes.map((lane) => (
                  <span key={lane} className="relative w-4 border-l border-border sm:w-5 md:w-6" title={lane}>
                    {lane === entry.actor && (
                      <span className={`absolute -left-[5px] top-3.5 h-[9px] w-[9px] rounded-full ring-2 ring-surface ${laneDotClass(lane)}`} />
                    )}
                  </span>
                ))}
              </div>

              <div className="min-w-0 flex-1 pb-6 pt-2">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="text-sm font-semibold text-text">{humanizeCode(entry.action)}</span>
                  <ActorBadge actor={entry.actor} />
                  <span className="rounded border border-border px-1.5 py-0.5 text-label uppercase text-text-muted" title="Pipeline phase (derived from the action name)">
                    {phase}
                  </span>
                </div>
                <div className="mt-1 break-all font-mono text-[11px] text-text-muted">
                  <span>{entry.action}</span>
                  <span aria-hidden="true"> · </span>
                  <span title={entry.entity_id}>
                    {entry.entity_type} {entry.entity_id.slice(0, 8)}
                  </span>
                </div>
                {message && <p className="mt-1.5 break-words text-body-small text-text">{message}</p>}

                <button
                  type="button"
                  onClick={() => onToggle(entry.id)}
                  aria-expanded={open}
                  className="focus-ring mt-2 inline-flex items-center gap-1.5 rounded text-body-small text-text-muted transition-colors duration-150 hover:text-text"
                >
                  <span aria-hidden="true" className="inline-block w-3 font-mono">
                    {open ? "−" : "+"}
                  </span>
                  Metadata{extras.length > 0 ? ` (${extras.length})` : ""}
                </button>

                {open && (
                  <div className="mt-2 space-y-3 rounded-lg border border-border bg-surface-raised p-3">
                    <dl className="space-y-1.5 font-mono text-xs">
                      <MetaRow label="event id" value={entry.id} />
                      <MetaRow label="entity" value={`${entry.entity_type}  ${entry.entity_id}`} copy={entry.entity_id} copyLabel="entity ID" />
                      {extras.map(([key, value]) => (
                        <MetaRow key={key} label={key} value={value} />
                      ))}
                    </dl>
                    <details className="group">
                      <summary className="focus-ring cursor-pointer rounded text-body-small text-text-muted transition-colors duration-150 hover:text-text">
                        Raw event JSON
                      </summary>
                      <div className="mt-2 flex items-start gap-2">
                        <pre className="max-h-64 min-w-0 flex-1 overflow-auto rounded border border-border bg-surface p-2.5 font-mono text-xs leading-5 text-text">
                          {JSON.stringify(entry, null, 2)}
                        </pre>
                        <CopyButton value={JSON.stringify(entry, null, 2)} label="event JSON" />
                      </div>
                    </details>
                  </div>
                )}
              </div>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

function MetaRow({ label, value, copy, copyLabel }: { label: string; value: string; copy?: string; copyLabel?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <dt className="min-w-24 max-w-[12rem] shrink-0 break-all text-text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 break-all text-text">{value}</dd>
      {copy && copyLabel && <CopyButton value={copy} label={copyLabel} />}
    </div>
  );
}
