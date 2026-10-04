import { Button } from "../ui/Button";
import { formatCount } from "../../lib/format";

/**
 * The backend returns a bare list (no total), so this is honest about what
 * it knows: the range on screen and whether a further page exists — found
 * by requesting one row more than the page size. It never prints "of N".
 */
export function PaymentsPagination({
  page,
  size,
  shown,
  hasNext,
  loading,
  onPrevious,
  onNext,
}: {
  page: number;
  size: number;
  shown: number;
  hasNext: boolean;
  loading: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const start = (page - 1) * size + 1;
  const end = (page - 1) * size + shown;

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5"
    >
      <p className="text-body-small tabular-nums text-text-muted">
        {shown === 0 ? "No rows" : `Showing ${formatCount(start)}–${formatCount(end)}`}
        <span className="text-text-muted"> · Page {formatCount(page)}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={onPrevious} disabled={page <= 1 || loading} className="py-1.5">
          Previous
        </Button>
        <Button variant="secondary" onClick={onNext} disabled={!hasNext || loading} className="py-1.5">
          Next
        </Button>
      </div>
    </nav>
  );
}
