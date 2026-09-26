#!/usr/bin/env bash
set -euo pipefail
# Phase 4 -- Overview Dashboard: overwrites of existing files.
# Run from the repository root (the directory containing frontend/), after
# phase4_create_new_files.sh.

cat > "frontend/tailwind.config.js" << 'RECOVERAI_PHASE4_EOF'
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // --- Quiet Instrumentation color tokens (see design spec) ---
      colors: {
        canvas: "#0B0C0E",
        surface: "#131417",
        "surface-raised": "#191B1F",
        border: {
          DEFAULT: "#26282D",
          strong: "#3A3D44",
        },
        text: {
          DEFAULT: "#F2EFE9",
          muted: "#9A968C",
          faint: "#65625B",
        },
        accent: {
          DEFAULT: "#C9973F",
          muted: "rgba(201, 151, 63, 0.12)",
        },
        success: "#5FA579",
        warning: "#C9973F",
        danger: "#C4544B",
        info: "#6E8CA0",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        display: ["2.75rem", { lineHeight: "1.1", letterSpacing: "-0.01em", fontWeight: "600" }],
        heading: ["1.25rem", { lineHeight: "1.3", fontWeight: "600" }],
        subhead: ["0.9375rem", { lineHeight: "1.4", letterSpacing: "0.01em", fontWeight: "600" }],
        body: ["0.9375rem", { lineHeight: "1.5", fontWeight: "400" }],
        "body-small": ["0.8125rem", { lineHeight: "1.5", fontWeight: "400" }],
        label: ["0.6875rem", { lineHeight: "1.4", letterSpacing: "0.08em", fontWeight: "600" }],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        lg: "8px",
      },
      boxShadow: {
        overlay: "0 2px 8px rgba(0, 0, 0, 0.35)",
      },
      spacing: {
        18: "4.5rem",
      },
      transitionDuration: {
        150: "150ms",
        200: "200ms",
        400: "400ms",
      },
    },
  },
  plugins: [],
};
RECOVERAI_PHASE4_EOF

cat > "frontend/src/pages/OverviewPage.tsx" << 'RECOVERAI_PHASE4_EOF'
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

      <div className="space-y-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <RevenuePosition metrics={metrics} />
          </div>
          <div className="lg:col-span-4">
            <RecoveryPosture metrics={metrics} />
          </div>
        </div>

        <div className="space-y-10 border-t border-border pt-10">
          <OutcomeDistribution metrics={metrics} />
          <RecoveryActivity payments={payments} />
          <RecentPayments payments={payments} />
          <QuickDemoEntry />
        </div>
      </div>
    </div>
  );
}
RECOVERAI_PHASE4_EOF

echo "Phase 4 modified files overwritten."
