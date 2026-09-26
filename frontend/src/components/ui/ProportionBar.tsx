/**
 * A single horizontal proportion bar with a label/value legend beneath
 * it — the one instrument the design spec allows in place of a "chart
 * for chart's sake" (§12-A/§12-C): "a simple horizontal proportion bar
 * ... not a gauge or donut." Used for both the Revenue Position
 * recovered-vs-at-risk split and the Outcome Distribution stacked bar.
 * Every segment must trace to a real field the caller passed in —
 * this component does no fetching or invented math of its own.
 */

export interface ProportionSegment {
  label: string;
  value: number;
  formattedValue: string;
  colorClass: string; // e.g. "bg-success" — Tailwind can't resolve interpolated class names
}

export function ProportionBar({ segments }: { segments: ProportionSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0);

  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-sm bg-surface-raised" role="img" aria-label={buildAriaLabel(segments)}>
        {total > 0 ? (
          segments.map((segment) =>
            segment.value > 0 ? (
              <div
                key={segment.label}
                className={segment.colorClass}
                style={{ width: `${(segment.value / total) * 100}%` }}
                aria-hidden="true"
              />
            ) : null,
          )
        ) : (
          <div className="w-full bg-surface-raised" aria-hidden="true" />
        )}
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${segment.colorClass}`} aria-hidden="true" />
            <dt className="text-body-small text-text-muted">{segment.label}</dt>
            <dd className="text-body-small tabular-nums text-text">{segment.formattedValue}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function buildAriaLabel(segments: ProportionSegment[]): string {
  return segments.map((s) => `${s.label}: ${s.formattedValue}`).join(", ");
}
