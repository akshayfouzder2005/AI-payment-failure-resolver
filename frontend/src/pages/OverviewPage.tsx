import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../lib/api";
import type { MetricsSummary, PaymentRead } from "../types/api";
import { RevenuePosition } from "../components/overview/RevenuePosition";
import { RecoveryPerformance } from "../components/overview/RecoveryPerformance";
import { RecoveryActivity } from "../components/overview/RecoveryActivity";
import { RecentFailedPayments } from "../components/overview/RecentFailedPayments";
import { DecisionInsights } from "../components/overview/DecisionInsights";
import { QuickDemoEntry } from "../components/overview/QuickDemoEntry";
import { DashboardRow } from "../components/overview/DashboardRow";
import { OverviewSkeleton } from "../components/overview/OverviewSkeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { formatRelativeTime } from "../lib/format";

// One page of recent payments feeds Recent Failed Payments, Recovery
// Activity and the failure-reason breakdown in Decision Insights — one
// fetch, no polling loop added purely to feel "live".
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
        <PageHeader title="Overview" />
        <OverviewSkeleton />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div>
        <PageHeader title="Overview" />
        <ErrorState message={state.message} onRetry={load} />
      </div>
    );
  }

  const { metrics, payments } = state;

  if (metrics.payments_analyzed === 0) {
    return (
      <div>
        <PageHeader title="Overview" />
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
      <PageHeader
        title="Overview"
        description={`Failed-payment recovery across this workspace · Updated ${formatRelativeTime(metrics.generated_at)}`}
      />

      <div className="space-y-10">
        <DashboardRow
          main={<RevenuePosition metrics={metrics} />}
          rail={<RecoveryPerformance metrics={metrics} />}
        />
        <DashboardRow
          main={<RecentFailedPayments payments={payments} />}
          rail={<RecoveryActivity payments={payments} />}
        />
        <DashboardRow
          main={<DecisionInsights metrics={metrics} payments={payments} />}
          rail={<QuickDemoEntry />}
        />
      </div>
    </div>
  );
}
