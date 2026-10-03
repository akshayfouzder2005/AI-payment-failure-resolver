#!/usr/bin/env bash
# App shell + dashboard redesign — NEW files (run first, from repo root)
set -euo pipefail

if [ ! -d "frontend/src" ]; then echo "Run this from the repository root (the folder that contains frontend/)."; exit 1; fi

mkdir -p "frontend/src/components/overview"
cat > "frontend/src/components/overview/DashboardRow.tsx" <<'__RECOVERAI_EOF__'
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
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/overview/DashboardRow.tsx"

mkdir -p "frontend/src/components/overview"
cat > "frontend/src/components/overview/DecisionInsights.test.tsx" <<'__RECOVERAI_EOF__'
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DecisionInsights } from "./DecisionInsights";
import type { MetricsSummary, PaymentRead } from "../../types/api";

const METRICS: MetricsSummary = {
  merchant_id: "m1",
  payments_analyzed: 10,
  revenue_at_risk: "0",
  revenue_recovered: "0",
  recovered_count: 0,
  escalated_count: 0,
  automatically_recovered_count: 0,
  recovery_rate: 0,
  automatic_recovery_rate: 0.5,
  escalation_rate: 0.2,
  recovery_attempt_success_rate: 0,
  average_recovery_time_seconds: null,
  failed_or_blocked_intervention_count: 7,
  generated_at: "2026-09-26T10:00:00Z",
};

function payment(id: string, failure_code: string | null): PaymentRead {
  return {
    id,
    merchant_id: "m1",
    customer: null,
    gateway: "razorpay",
    gateway_payment_id: `rzp_${id}`,
    amount: "100.00",
    currency: "INR",
    status: "failed",
    failure_code,
    failure_message: null,
    original_transaction_at: null,
    created_at: "2026-09-20T09:00:00Z",
    updated_at: "2026-09-20T09:00:00Z",
  };
}

describe("DecisionInsights", () => {
  it("shows at most five failure reasons, most frequent first", () => {
    const payments = [
      ...["A", "A", "A"].map((c, i) => payment(`a${i}`, c)),
      ...["B", "B"].map((c, i) => payment(`b${i}`, c)),
      payment("c", "C"),
      payment("d", "D"),
      payment("e", "E"),
      payment("f", "F"),
    ];
    render(<DecisionInsights metrics={METRICS} payments={payments} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent("A");
    expect(items[0]).toHaveTextContent("3");
    expect(items[1]).toHaveTextContent("B");
  });

  it("groups payments with no failure code as Unspecified instead of dropping them", () => {
    render(<DecisionInsights metrics={METRICS} payments={[payment("x", null), payment("y", null)]} />);
    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("Unspecified");
    expect(item).toHaveTextContent("2");
  });

  it("says so, rather than drawing an empty chart, when there are no payments", () => {
    render(<DecisionInsights metrics={METRICS} payments={[]} />);
    expect(screen.getByText("No failure reasons recorded yet.")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("uses singular wording for a one-payment sample", () => {
    render(<DecisionInsights metrics={METRICS} payments={[payment("only", "CARD_DECLINED")]} />);
    expect(screen.getByText("From the latest 1 payment.")).toBeInTheDocument();
  });

  it("renders the automation rates and blocked-intervention count from metrics", () => {
    render(<DecisionInsights metrics={METRICS} payments={[]} />);
    const section = screen.getByText("Decision Insights").closest("section")!;
    expect(within(section).getByText("50%")).toBeInTheDocument();
    expect(within(section).getByText("20%")).toBeInTheDocument();
    expect(within(section).getByText("7")).toBeInTheDocument();
  });
});
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/overview/DecisionInsights.test.tsx"

mkdir -p "frontend/src/components/overview"
cat > "frontend/src/components/overview/DecisionInsights.tsx" <<'__RECOVERAI_EOF__'
import { SectionHeader } from "../ui/SectionHeader";
import { formatCount, formatPercent } from "../../lib/format";
import { countFailureReasons } from "../../lib/insights";
import type { MetricsSummary, PaymentRead } from "../../types/api";

const TOP_REASONS = 5;

/**
 * How the pipeline is behaving, in two real halves.
 *
 * Left — automation and policy rates straight from MetricsSummary: how much
 * is recovered without a human, how much is handed to the merchant, and how
 * many interventions the policy engine blocked or that failed outright.
 *
 * Right — the most common failure reasons, counted from the payments the
 * page already loaded (gateway failure_code; null groups as "Unspecified").
 * It is labelled with its own sample size because it covers only the latest
 * page of payments, not the merchant's full history. Per-payment AI
 * diagnoses (category, confidence) have no aggregate endpoint yet, so this
 * deliberately does not summarize them.
 */
export function DecisionInsights({
  metrics,
  payments,
}: {
  metrics: MetricsSummary;
  payments: PaymentRead[];
}) {
  const reasons = countFailureReasons(payments).slice(0, TOP_REASONS);
  const topCount = reasons[0]?.count ?? 0;

  return (
    <section>
      <SectionHeader title="Decision Insights" />

      <div className="grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-2">
        <div>
          <h3 className="mb-1 text-label uppercase text-text-muted">Automation and policy</h3>
          <dl className="divide-y divide-border border-y border-border">
            <Row label="Automatic recovery rate" value={formatPercent(metrics.automatic_recovery_rate)} />
            <Row label="Escalation rate" value={formatPercent(metrics.escalation_rate)} />
            <Row
              label="Blocked or failed interventions"
              value={formatCount(metrics.failed_or_blocked_intervention_count)}
            />
          </dl>
        </div>

        <div>
          <h3 className="mb-1 text-label uppercase text-text-muted">Top failure reasons</h3>
          {reasons.length === 0 ? (
            <p className="border-y border-border py-3 text-body-small text-text-muted">
              No failure reasons recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {reasons.map((reason) => (
                <li key={reason.label} className="py-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="min-w-0 truncate text-sm text-text">{reason.label}</span>
                    <span className="text-sm tabular-nums text-text-muted">{formatCount(reason.count)}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-sm bg-border" aria-hidden="true">
                    <div
                      className="h-full rounded-sm bg-text-faint"
                      style={{ width: `${(reason.count / topCount) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-body-small text-text-muted">
            From the latest {formatCount(payments.length)} {payments.length === 1 ? "payment" : "payments"}.
          </p>
        </div>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="text-body font-medium tabular-nums text-text">{value}</dd>
    </div>
  );
}
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/overview/DecisionInsights.tsx"

mkdir -p "frontend/src/components/overview"
cat > "frontend/src/components/overview/RecentFailedPayments.tsx" <<'__RECOVERAI_EOF__'
import { Link, useNavigate } from "react-router-dom";
import { SectionHeader } from "../ui/SectionHeader";
import { StatusChip } from "../ui/StatusChip";
import { formatCurrency, formatRelativeTime, humanizeCode } from "../../lib/format";
import type { PaymentRead } from "../../types/api";

/**
 * Newest-first (the backend already orders /payments by created_at desc, so
 * this is real arrival order) — every payment here entered the system as a
 * failure, and its current status says what has happened since. The failure
 * reason is the gateway's own message, falling back to the humanized failure
 * code, falling back to a dash; nothing is invented.
 *
 * Responsive density: below sm the customer and reason fold under the amount;
 * from sm to xl the failure reason folds under the customer; at xl it gets its own
 * column. Amount, status and age are always visible.
 *
 * Rows keep their implicit "row" role and gain tabIndex + Enter/Space
 * handlers (an explicit role="button" would erase the row semantics).
 */
export function RecentFailedPayments({ payments }: { payments: PaymentRead[] }) {
  const navigate = useNavigate();
  const rows = payments.slice(0, 8);

  function openPayment(paymentId: string) {
    navigate(`/app/payments/${paymentId}`);
  }

  return (
    <section>
      <SectionHeader
        title="Recent Failed Payments"
        aside={
          <Link
            to="/app/payments"
            className="focus-ring rounded text-text-muted transition-colors duration-150 hover:text-text"
          >
            View all
          </Link>
        }
      />

      {rows.length === 0 ? (
        <p className="text-body-small text-text-muted">No payments yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-small">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th scope="col" className="py-2.5 pr-4 font-normal">
                  Amount
                </th>
                <th scope="col" className="hidden py-2.5 pr-4 font-normal sm:table-cell">
                  Customer
                </th>
                <th scope="col" className="hidden py-2.5 pr-4 font-normal xl:table-cell">
                  Failure reason
                </th>
                <th scope="col" className="py-2.5 pr-4 font-normal">
                  Status
                </th>
                <th scope="col" className="py-2.5 text-right font-normal">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((payment) => {
                const reason = failureReason(payment);
                return (
                  <tr
                    key={payment.id}
                    tabIndex={0}
                    aria-label={`Open payment ${payment.id}`}
                    onClick={() => openPayment(payment.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openPayment(payment.id);
                      }
                    }}
                    className="focus-ring cursor-pointer border-b border-border transition-colors duration-150 last:border-b-0 hover:bg-surface-raised"
                  >
                    <td className="py-3 pr-4 align-top">
                      <div className="font-medium tabular-nums text-text">
                        {formatCurrency(payment.amount, payment.currency)}
                      </div>
                      <div className="mt-0.5 max-w-[11rem] truncate text-text-muted sm:hidden">
                        {payment.customer?.name ?? "—"} · {reason}
                      </div>
                    </td>
                    <td className="hidden py-3 pr-4 align-top sm:table-cell">
                      <div className="text-text">{payment.customer?.name ?? "—"}</div>
                      <div className="mt-0.5 max-w-[16rem] truncate text-text-muted xl:hidden">{reason}</div>
                    </td>
                    <td className="hidden max-w-[14rem] truncate py-3 pr-4 align-top text-text-muted xl:table-cell">
                      {reason}
                    </td>
                    <td className="py-3 pr-4 align-top">
                      <StatusChip status={payment.status} />
                    </td>
                    <td className="whitespace-nowrap py-3 text-right align-top text-text-muted">
                      {formatRelativeTime(payment.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function failureReason(payment: PaymentRead): string {
  if (payment.failure_message) return payment.failure_message;
  if (payment.failure_code) return humanizeCode(payment.failure_code);
  return "—";
}
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/overview/RecentFailedPayments.tsx"

mkdir -p "frontend/src/components/overview"
cat > "frontend/src/components/overview/RecoveryPerformance.tsx" <<'__RECOVERAI_EOF__'
import { ProportionBar } from "../ui/ProportionBar";
import { SectionHeader } from "../ui/SectionHeader";
import { formatCount, formatPercent } from "../../lib/format";
import type { MetricsSummary } from "../../types/api";

/**
 * Outcome mix and throughput in one narrow rail. The bar is proportioned
 * from real counts; "at risk" is the remainder of payments_analyzed after
 * recovered and escalated — a real count by subtraction, not an estimate.
 * (It includes abandoned payments, which the metrics endpoint doesn't
 * break out separately.) Escalated uses the danger tone here because in a
 * three-way split "at risk" already owns warning.
 */
export function RecoveryPerformance({ metrics }: { metrics: MetricsSummary }) {
  const atRiskCount = Math.max(
    metrics.payments_analyzed - metrics.recovered_count - metrics.escalated_count,
    0,
  );

  return (
    <section>
      <SectionHeader title="Recovery Performance" />

      <ProportionBar
        segments={[
          {
            label: "Recovered",
            value: metrics.recovered_count,
            formattedValue: formatCount(metrics.recovered_count),
            colorClass: "bg-success",
          },
          {
            label: "At risk",
            value: atRiskCount,
            formattedValue: formatCount(atRiskCount),
            colorClass: "bg-warning",
          },
          {
            label: "Escalated",
            value: metrics.escalated_count,
            formattedValue: formatCount(metrics.escalated_count),
            colorClass: "bg-danger",
          },
        ]}
      />

      <dl className="mt-6 divide-y divide-border border-y border-border">
        <Row label="Payments analyzed" value={formatCount(metrics.payments_analyzed)} />
        <Row label="Automatically recovered" value={formatCount(metrics.automatically_recovered_count)} />
        <Row label="Recovery attempt success" value={formatPercent(metrics.recovery_attempt_success_rate)} />
      </dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="text-body font-medium tabular-nums text-text">{value}</dd>
    </div>
  );
}
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/overview/RecoveryPerformance.tsx"

mkdir -p "frontend/src/components/shell"
cat > "frontend/src/components/shell/NavIcon.tsx" <<'__RECOVERAI_EOF__'
export type NavIconName = "overview" | "payments" | "lab" | "audit" | "account";

/**
 * Sixteen-pixel geometric line icons drawn inline — no icon library, in
 * keeping with the system's "no decorative iconography" rule: these only
 * exist to give the nav a scannable left edge, so they stay plain strokes
 * on currentColor and are hidden from assistive tech (the label carries
 * the meaning).
 */
export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {name === "overview" && (
        <>
          <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
          <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
          <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
          <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
        </>
      )}
      {name === "payments" && (
        <>
          <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
          <path d="M2 6.75h12" />
        </>
      )}
      {name === "lab" && <path d="M6 2.5h4M7 2.5v4L3.6 12.6a1 1 0 0 0 .9 1.4h7a1 1 0 0 0 .9-1.4L9 6.5v-4" />}
      {name === "audit" && (
        <>
          <circle cx="3.5" cy="4" r="0.75" />
          <circle cx="3.5" cy="8" r="0.75" />
          <circle cx="3.5" cy="12" r="0.75" />
          <path d="M6.5 4H14M6.5 8H14M6.5 12H14" />
        </>
      )}
      {name === "account" && (
        <>
          <circle cx="8" cy="5.5" r="2.5" />
          <path d="M3 13.5c.7-2.4 2.6-3.5 5-3.5s4.3 1.1 5 3.5" />
        </>
      )}
    </svg>
  );
}
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/shell/NavIcon.tsx"

mkdir -p "frontend/src/components/shell"
cat > "frontend/src/components/shell/WorkspaceBlock.tsx" <<'__RECOVERAI_EOF__'
/**
 * The active workspace — the merchant this session is scoped to (every
 * authenticated route is merchant-scoped from the bearer token alone, so
 * there is exactly one). Deliberately a static block, not a switcher: no
 * chevron, no menu, because there is nothing to switch to.
 */
export function WorkspaceBlock({ name }: { name?: string }) {
  const label = name?.trim() ?? "";
  const initial = label.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-accent/15 text-sm font-semibold text-accent"
        aria-hidden="true"
      >
        {initial || "·"}
      </span>
      <span className="min-w-0">
        <span className="block text-label uppercase text-text-muted">Workspace</span>
        <span className="block truncate text-sm font-medium text-text">{label || "—"}</span>
      </span>
    </div>
  );
}
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/shell/WorkspaceBlock.tsx"

mkdir -p "frontend/src/components/ui"
cat > "frontend/src/components/ui/PageHeader.tsx" <<'__RECOVERAI_EOF__'
import type { ReactNode } from "react";

/**
 * The one page-title block for every authenticated screen: heading,
 * optional one-line description, optional right-aligned actions. Wraps on
 * narrow screens instead of truncating — the actions drop under the title.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-heading">{title}</h1>
        {description && <p className="mt-1 text-body-small text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/ui/PageHeader.tsx"

mkdir -p "frontend/src/components/ui"
cat > "frontend/src/components/ui/SectionHeader.tsx" <<'__RECOVERAI_EOF__'
import type { ReactNode } from "react";

/**
 * Title row for a dashboard section: heading left, optional quiet aside
 * right (a link or a one-line caption). Baseline-aligned so a small aside
 * sits on the heading's text line, not its box.
 */
export function SectionHeader({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 className="text-subhead text-text">{title}</h2>
      {aside && <div className="shrink-0 text-body-small text-text-muted">{aside}</div>}
    </div>
  );
}
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/ui/SectionHeader.tsx"

mkdir -p "frontend/src/lib"
cat > "frontend/src/lib/insights.ts" <<'__RECOVERAI_EOF__'
import { humanizeCode } from "./format";
import type { PaymentRead } from "../types/api";

export interface FailureReasonCount {
  label: string;
  count: number;
}

/**
 * Groups payments by gateway `failure_code`, most frequent first. A payment
 * with no failure_code groups under "Unspecified" rather than being dropped,
 * so the counts always sum to the number of payments passed in. Ties keep
 * first-seen order (Array.prototype.sort is stable), which for the
 * newest-first /payments list means the more recent reason wins a tie.
 */
export function countFailureReasons(payments: PaymentRead[]): FailureReasonCount[] {
  const counts = new Map<string, number>();
  for (const payment of payments) {
    const label = payment.failure_code ? humanizeCode(payment.failure_code) : "Unspecified";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}
__RECOVERAI_EOF__
echo "  wrote frontend/src/lib/insights.ts"

echo "Done: 10 new files."
