import { DOT_CLASSES } from "../../lib/status";
import { PAYMENT_STATUSES, statusEntry, type PaymentStatus } from "../../lib/status";
import { PAGE_SIZES } from "../../lib/pagination";
import { Button } from "../ui/Button";

/**
 * Status filter (server-side — GET /payments filters on exact status),
 * page size, and a manual refresh. The filter is a row of toggle buttons,
 * not tabs: it narrows one list, it doesn't switch between views.
 */
export function PaymentsToolbar({
  status,
  size,
  loading,
  onStatusChange,
  onSizeChange,
  onRefresh,
}: {
  status: PaymentStatus | null;
  size: number;
  loading: boolean;
  onStatusChange: (status: PaymentStatus | null) => void;
  onSizeChange: (size: number) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border px-4 py-3 sm:px-5">
      <div role="group" aria-label="Filter by status" className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1">
        <FilterButton active={status === null} onClick={() => onStatusChange(null)}>
          All
        </FilterButton>
        {PAYMENT_STATUSES.map((value) => {
          const entry = statusEntry(value);
          return (
            <FilterButton key={value} active={status === value} onClick={() => onStatusChange(value)}>
              <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[entry.tone]}`} aria-hidden="true" />
              {entry.label}
            </FilterButton>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-body-small text-text-muted">
          Rows
          <select
            value={size}
            onChange={(event) => onSizeChange(Number(event.target.value))}
            className="focus-ring rounded border border-border bg-surface-raised px-2 py-1 text-sm text-text transition-colors duration-150 hover:border-border-strong"
          >
            {PAGE_SIZES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" onClick={onRefresh} disabled={loading} className="py-1.5">
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`focus-ring inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 text-body-small transition-colors duration-150 ${
        active
          ? "border-border-strong bg-surface font-medium text-text"
          : "border-transparent text-text-muted hover:border-border hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}
