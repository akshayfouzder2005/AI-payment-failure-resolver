import type { ReactNode } from "react";

/**
 * One horizontal band of the dashboard: a wide main column and a narrow
 * rail, divided by real rules instead of card chrome. Source order is the
 * mobile reading order (main, then rail) — the rail only moves beside the
 * main column at xl (1280px+), and its top rule turns into a left rule there.
 * Below that the workspace is too narrow for an 8/4 split to keep table
 * columns and chips readable, so the bands stack at full width instead.
 *
 * Each band is deliberately unequal (8/12 vs 4/12): the dashboard's
 * hierarchy comes from that asymmetry, not from four matching tiles.
 */
export function DashboardRow({ main, rail }: { main: ReactNode; rail: ReactNode }) {
  return (
    <div className="grid grid-cols-1 border-t border-border pt-8 xl:grid-cols-12">
      <div className="min-w-0 xl:col-span-8 xl:pr-10">{main}</div>
      <div className="mt-10 min-w-0 border-t border-border pt-8 xl:col-span-4 xl:mt-0 xl:border-l xl:border-t-0 xl:pl-8 xl:pt-0">
        {rail}
      </div>
    </div>
  );
}
