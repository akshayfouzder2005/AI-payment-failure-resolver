import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../lib/api";
import type { MetricsSummary, PaymentRead } from "../types/api";
import { RevenuePosition } from "../components/overview/RevenuePosition";
import { RecoveryPosture } from "../components/overview/RecoveryPosture";
import { OutcomeDistribution } from "../components/overview/OutcomeDistribution";
import { RecoveryActivity } from "../components/overview/RecoveryActivity";
import { RecentPayments } from "../components/overview/RecentPayments";
import { QuickDemoEntry } from "../components/overview/QuickDemoEntry";
import { OverviewSkeleton } from "../components/overview/OverviewSkeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { Button } from "../components/ui/Button";

// Recent payments feed both Recovery Activity and Recent Payment Activity
// below — one fetch, no polling loop added purely to feel "live" (design
// spec correction-pass delta §2).
const RECENT_PAYMENTS_LIMIT = 25;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; metrics: MetricsSummary; payments: PaymentRead[] };

export function OverviewPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(() => {
    setState({ status: "loading" });
    Promise.all([api.getMetricsSummary(), api.listPayments({ limit: RECENT_PAYMENTS_LIMIT })])
      .then(([metrics, payments]) => {
        setState({ status: "ready", metrics, payments });
      })
      .catch((err: unknown) => {
        setState({
          status: "error",
          message: err instanceof api.ApiError ? err.message : "Could not load the dashboard.",
        });
      });
  }, []);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    load();
  }, [load]);

  if (state.status === "loading") {
    return (
      <div>
        <h1 className="mb-8 text-heading">Overview</h1>
        <OverviewSkeleton />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div>
        <h1 className="mb-8 text-heading">Overview</h1>
        <ErrorState message={state.message} onRetry={load} />
      </div>
    );
  }

  const { metrics, payments } = state;

  if (metrics.payments_analyzed === 0) {
    return (
      <div>
        <h1 className="mb-8 text-heading">Overview</h1>
        <EmptyState
          title="Your workspace is ready"
          description="No payments have been recorded yet for this merchant."
          note="Real failed payments will appear here automatically once live Razorpay webhooks are connected — no manual step required on this dashboard either way."
          action={
            <Button variant="primary" onClick={() => navigate("/app/recovery-lab")}>
              Run demo scenario
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-8 text-heading">Overview</h1>

      <div className="space-y-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <RevenuePosition metrics={metrics} />
          </div>
          <div className="lg:col-span-4">
            <RecoveryPosture metrics={metrics} />
          </div>
        </div>

        <div className="space-y-12 border-t border-border pt-12">
          <OutcomeDistribution metrics={metrics} />
          <RecoveryActivity payments={payments} />
          <RecentPayments payments={payments} />
          <QuickDemoEntry />
        </div>
      </div>
    </div>
  );
}
