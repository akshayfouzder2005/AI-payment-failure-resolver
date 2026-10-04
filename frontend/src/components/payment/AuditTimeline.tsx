import { formatDateTime, formatElapsedMs, humanizeCode } from "../../lib/format";
import { auditExtras, auditMessage, elapsedBetween } from "../../lib/investigation";
import { DetailSection } from "./DetailSection";
import type { AuditLogRead } from "../../types/api";

/**
 * The full append-only audit trail for the payment, oldest first, exactly as
 * recorded. Actors are drawn in the same grammar as the Decision Chain
 * (ai_engine dashed/info, policy_engine inverted/solid) so who did what
 * reads the same way here as above.
 */
export function AuditTimeline({ entries }: { entries: AuditLogRead[] }) {
  return (
    <DetailSection
      id="audit"
      title="Audit trail"
      aside={
        <span className="tabular-nums">
          {entries.length} {entries.length === 1 ? "event" : "events"}
        </span>
      }
    >
      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-text-muted">
          No audit events have been recorded for this payment.
        </p>
      ) : (
        <ol className="relative">
          {entries.map((entry, index) => {
            const message = auditMessage(entry);
            const extras = auditExtras(entry);
            const gap = index > 0 ? elapsedBetween(entries[index - 1].created_at, entry.created_at) : null;
            const isLast = index === entries.length - 1;

            return (
              <li key={entry.id} className="relative flex gap-4" data-action={entry.action}>
                <div className="flex w-3 shrink-0 flex-col items-center">
                  <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-border-strong" />
                  {!isLast && <span aria-hidden="true" className="w-px flex-1 bg-border" />}
                </div>

                <div className="min-w-0 flex-1 pb-6">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-medium text-text">{humanizeCode(entry.action)}</span>
                    <ActorChip actor={entry.actor} />
                    <time dateTime={entry.created_at} className="font-mono text-[11px] text-text-muted">
                      {formatDateTime(entry.created_at)}
                      {gap !== null && <span title="Since the previous event"> · +{formatElapsedMs(gap)}</span>}
                    </time>
                  </div>

                  {message && <p className="mt-1 break-words text-body-small text-text-muted">{message}</p>}

                  <div className="mt-1 font-mono text-[11px] text-text-muted">
                    <span>{entry.action}</span>
                    <span aria-hidden="true"> · </span>
                    <span title={entry.entity_id}>
                      {entry.entity_type} {entry.entity_id.slice(0, 8)}
                    </span>
                  </div>

                  {extras.length > 0 && (
                    <details className="mt-2">
                      <summary className="focus-ring inline-block cursor-pointer rounded text-body-small text-text-muted transition-colors duration-150 hover:text-text">
                        Details
                      </summary>
                      <dl className="mt-2 space-y-1 rounded border border-border bg-surface-raised px-3 py-2">
                        {extras.map(([key, value]) => (
                          <div key={key} className="flex flex-wrap gap-x-3 font-mono text-xs">
                            <dt className="text-text-muted">{key}</dt>
                            <dd className="min-w-0 break-all text-text">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </DetailSection>
  );
}

function ActorChip({ actor }: { actor: string }) {
  const style =
    actor === "ai_engine"
      ? "border border-dashed border-info/60 bg-info/10 text-info"
      : actor === "policy_engine"
        ? "border border-text bg-text text-canvas"
        : "border border-border text-text-muted";

  return (
    <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${style}`} title="Actor">
      {actor}
    </span>
  );
}
