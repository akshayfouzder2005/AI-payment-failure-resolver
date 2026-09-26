import { Skeleton } from "../ui/Skeleton";

/**
 * Design spec §24: "skeleton blocks matching the real layout shape (not
 * spinners on blank pages)." Mirrors the populated dashboard's actual
 * regions (Revenue Position + Recovery Posture row, then the stacked
 * bar / list / table sections below) rather than a generic placeholder.
 */
export function OverviewSkeleton() {
  return (
    <div
      className="space-y-12"
      role="status"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <Skeleton className="h-3 w-32" />
          <div className="flex gap-8">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-10 w-40" />
          </div>
          <Skeleton className="h-2 w-full max-w-xl" />
        </div>
        <div className="space-y-4 lg:col-span-4">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </div>

      <div className="space-y-12 border-t border-border pt-12">
        <div className="space-y-4">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-2 w-full max-w-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}
