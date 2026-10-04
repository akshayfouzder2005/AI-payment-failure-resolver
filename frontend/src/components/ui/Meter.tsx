import { formatRatioPercent } from "../../lib/format";

/**
 * A single 0–1 value as a thin bar plus its exact figure. The fill colour is
 * the AI's (info) because the only things measured this way are model
 * outputs — keeping "advisory" one colour across the whole screen.
 * An absent value draws an empty track and an em dash, never a zero bar.
 */
export function Meter({ label, value }: { label: string; value: string | number | null | undefined }) {
  const ratio = value === null || value === undefined ? null : Number(value);
  const valid = ratio !== null && Number.isFinite(ratio);
  const width = valid ? Math.min(Math.max(ratio, 0), 1) * 100 : 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body-small text-text-muted">{label}</span>
        <span className="text-sm font-medium tabular-nums text-text">{formatRatioPercent(value)}</span>
      </div>
      <div
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-sm bg-border"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={valid ? ratio : undefined}
      >
        <div className="h-full rounded-sm bg-info" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
