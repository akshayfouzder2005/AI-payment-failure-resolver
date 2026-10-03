import { Skeleton } from "../ui/Skeleton";
import { DashboardRow } from "./DashboardRow";

/**
 * Skeleton blocks matching the real layout shape (not spinners on blank
 * pages): the same three asymmetric bands as the populated dashboard —
 * revenue numeral + bar + stat strip beside a rail, table beside a list,
 * insights beside the demo panel.
 */
export function OverviewSkeleton() {
  return (
    <div className="space-y-10" role="status" aria-busy="true" aria-label="Loading dashboard">
      <DashboardRow
        main={
          <div className="space-y-4">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-11 w-56" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        }
        rail={
          <div className="space-y-4">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        }
      />
      <DashboardRow
        main={
          <div className="space-y-4">
            <Skeleton className="h-3 w-44" />
            <Skeleton className="h-52 w-full" />
          </div>
        }
        rail={
          <div className="space-y-4">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-52 w-full" />
          </div>
        }
      />
      <DashboardRow
        main={
          <div className="space-y-4">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-32 w-full" />
          </div>
        }
        rail={<Skeleton className="h-32 w-full rounded-lg" />}
      />
    </div>
  );
}
