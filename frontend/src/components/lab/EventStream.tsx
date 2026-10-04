import { useEffect, useRef } from "react";
import { formatOffset, formatTimeMs, offsetFromStart } from "../../lib/audit";
import { auditMessage } from "../../lib/investigation";
import { ActorBadge } from "../audit/ActorBadge";
import type { AuditLogRead } from "../../types/api";

/**
 * The raw audit events as the backend writes them, appended as polling
 * discovers them — a console view of the trace. Each line is a real
 * audit_logs row; the stream only ever grows from what the API returns.
 */
export function EventStream({ entries, live }: { entries: AuditLogRead[]; live: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  const startedAt = entries[0]?.created_at ?? null;

  // A console follows its newest line. This runs on every new event rather
  // than only while "live": the last events arrive in the same render that
  // ends the live state, and must still end up in view.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [entries.length]);

  return (
    <div
      ref={scroller}
      role="log"
      aria-label="Audit event stream"
      className="max-h-72 overflow-auto rounded-lg border border-border bg-surface-raised"
    >
      {entries.length === 0 ? (
        <p className="px-4 py-5 text-sm text-text-muted">
          {live ? "Waiting for the first audit event…" : "No audit events yet. Run a scenario to see them arrive."}
        </p>
      ) : (
        <ul className="divide-y divide-border font-mono text-xs">
          {entries.map((entry, index) => {
            const offset = offsetFromStart(entry, startedAt);
            const message = auditMessage(entry);
            const newest = live && index === entries.length - 1;
            return (
              <li
                key={entry.id}
                className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 px-3 py-2 ${
                  newest ? "border-l-info bg-info/5" : "border-l-transparent"
                }`}
              >
                <span className="w-[5.5rem] shrink-0 tabular-nums text-text-muted">
                  {offset === null ? "—" : formatOffset(offset)}
                </span>
                <span className="shrink-0 tabular-nums text-text-muted">{formatTimeMs(entry.created_at)}</span>
                <ActorBadge actor={entry.actor} />
                <span className="font-medium text-text">{entry.action}</span>
                {message && <span className="min-w-0 basis-full break-words font-sans text-body-small text-text-muted sm:basis-auto">{message}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
