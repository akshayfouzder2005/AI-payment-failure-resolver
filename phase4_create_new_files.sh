#!/usr/bin/env bash
set -euo pipefail
# Phase 4 -- Overview Dashboard: new files.
# Run from the repository root (the directory containing frontend/).

mkdir -p "frontend/src/lib"
cat > "frontend/src/lib/format.ts" << 'RECOVERAI_PHASE4_EOF'
/**
 * Formatting helpers shared across every screen that renders money, a rate,
 * or a timestamp. Centralized so the Indian Rupee grouping rule (design
 * spec §4 — "₹1,24,500", not "₹124,500") and relative-time phrasing are
 * defined exactly once.
 */

/**
 * Formats a decimal amount (the backend always serializes Decimal as a
 * string — see PaymentRead.amount, MetricsSummary.revenue_*) as Indian
 * Rupees with Indian digit grouping. `en-IN` gives the correct grouping
 * for any currency code, but this product's data is INR-only today (see
 * Payment.currency default in the backend model), so the symbol is
 * effectively always ₹.
 */
export function formatCurrency(amount: string | number, currency = "INR"): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

/** A rate field from MetricsSummary (0.0–1.0) as a whole-number percentage. */
export function formatPercent(rate: number): string {
  if (!Number.isFinite(rate)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 0 }).format(rate);
}

/** Plain integer counts (payments analyzed, recovered, etc.) with Indian grouping. */
export function formatCount(count: number): string {
  return new Intl.NumberFormat("en-IN").format(count);
}

/**
 * Short relative-time label for table rows and activity lists — "2m ago",
 * "3h ago", "5d ago". Falls back to a plain date once it's more than a
 * week old, since "47d ago" stops being a useful unit of measure.
 */
export function formatRelativeTime(isoTimestamp: string): string {
  const then = new Date(isoTimestamp).getTime();
  if (Number.isNaN(then)) return "—";

  const diffSeconds = Math.round((Date.now() - then) / 1000);
  if (diffSeconds < 5) return "just now";
  if (diffSeconds < 60) return `${diffSeconds}s ago`;

  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(isoTimestamp).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
RECOVERAI_PHASE4_EOF

mkdir -p "frontend/src/lib"
cat > "frontend/src/lib/format.test.ts" << 'RECOVERAI_PHASE4_EOF'
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatCount, formatCurrency, formatPercent, formatRelativeTime } from "./format";

describe("formatCurrency", () => {
  it("formats a decimal string as Indian Rupees with Indian digit grouping", () => {
    // Design spec §4: "₹1,24,500", not "₹124,500".
    expect(formatCurrency("124500")).toBe("₹1,24,500");
    expect(formatCurrency("375000.00")).toBe("₹3,75,000");
  });

  it("accepts a plain number as well as a decimal string", () => {
    expect(formatCurrency(12000)).toBe("₹12,000");
  });

  it("drops decimal places (backend Decimal amounts are whole rupees in practice)", () => {
    expect(formatCurrency("1234.89")).toBe("₹1,235");
  });

  it("falls back to an em dash for a value that can't be parsed", () => {
    expect(formatCurrency("not-a-number")).toBe("—");
  });
});

describe("formatPercent", () => {
  it("formats a 0-1 rate as a whole-number percentage", () => {
    expect(formatPercent(0.6)).toBe("60%");
    expect(formatPercent(0)).toBe("0%");
  });

  it("falls back to an em dash for a non-finite rate", () => {
    expect(formatPercent(Number.NaN)).toBe("—");
  });
});

describe("formatCount", () => {
  it("formats an integer count with Indian digit grouping", () => {
    expect(formatCount(124500)).toBe("1,24,500");
    expect(formatCount(4)).toBe("4");
  });
});

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders sub-minute timestamps as 'just now' or seconds-ago", () => {
    expect(formatRelativeTime("2026-09-26T12:00:00.000Z")).toBe("just now");
    expect(formatRelativeTime("2026-09-26T11:59:45.000Z")).toBe("15s ago");
  });

  it("renders minutes, hours, and days ago for progressively older timestamps", () => {
    expect(formatRelativeTime("2026-09-26T11:55:00.000Z")).toBe("5m ago");
    expect(formatRelativeTime("2026-09-26T09:00:00.000Z")).toBe("3h ago");
    expect(formatRelativeTime("2026-09-24T12:00:00.000Z")).toBe("2d ago");
  });

  it("falls back to a plain date once it's more than a week old", () => {
    expect(formatRelativeTime("2026-09-01T12:00:00.000Z")).toBe("1 Sept");
  });

  it("falls back to an em dash for an unparseable timestamp", () => {
    expect(formatRelativeTime("not-a-timestamp")).toBe("—");
  });
});
RECOVERAI_PHASE4_EOF

mkdir -p "frontend/src/components/ui"
cat > "frontend/src/components/ui/EmptyState.tsx" << 'RECOVERAI_PHASE4_EOF'
import type { ReactNode } from "react";

/**
 * Shared empty-state block — every empty state names why it's empty and
 * what to do next (design spec §24), never a blank panel. Reused across
 * Overview (new-merchant workspace) and, in later phases, Payments
 * (filter returns nothing) and Audit Explorer (nothing selected yet).
 */
export function EmptyState({
  title,
  description,
  action,
  note,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  note?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-6 py-10 text-center">
      <h2 className="text-heading">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">{description}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
      {note && <p className="mx-auto mt-4 max-w-md text-xs text-text-faint">{note}</p>}
    </div>
  );
}
RECOVERAI_PHASE4_EOF

mkdir -p "frontend/src/components/ui"
cat > "frontend/src/components/ui/ErrorState.tsx" << 'RECOVERAI_PHASE4_EOF'
import { Button } from "./Button";

/**
 * Shared inline error state — the real backend error message where
 * available, a retry action, never a silent fallback that implies
 * success (design spec §24). Used anywhere a server-driven page's fetch
 * fails outright, not for partial/degraded data.
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-danger/30 bg-danger/5 px-6 py-8 text-center">
      <p className="text-sm text-danger">{message}</p>
      <Button variant="secondary" onClick={onRetry} className="mt-4">
        Retry
      </Button>
    </div>
  );
}
RECOVERAI_PHASE4_EOF

mkdir -p "frontend/src/components/ui"
cat > "frontend/src/components/ui/Skeleton.tsx" << 'RECOVERAI_PHASE4_EOF'
/**
 * A single pulsing block, composed by each page into a skeleton that
 * matches its real layout shape (design spec §24) — never a lone
 * spinner on a blank page. `aria-hidden` since the loading state itself
 * is announced once, by the page, not per block.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-raised ${className}`} aria-hidden="true" />;
}
RECOVERAI_PHASE4_EOF

mkdir -p "frontend/src/components/ui"
cat > "frontend/src/components/ui/ProportionBar.tsx" << 'RECOVERAI_PHASE4_EOF'
/**
 * A single horizontal proportion bar with a label/value legend beneath
 * it — the one instrument the design spec allows in place of a "chart
 * for chart's sake" (§12-A/§12-C): "a simple horizontal proportion bar
 * ... not a gauge or donut." Used for both the Revenue Position
 * recovered-vs-at-risk split and the Outcome Distribution stacked bar.
 * Every segment must trace to a real field the caller passed in —
 * this component does no fetching or invented math of its own.
 */

export interface ProportionSegment {
  label: string;
  value: number;
  formattedValue: string;
  colorClass: string; // e.g. "bg-success" — Tailwind can't resolve interpolated class names
}

export function ProportionBar({ segments }: { segments: ProportionSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0);

  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-sm bg-surface-raised" role="img" aria-label={buildAriaLabel(segments)}>
        {total > 0 ? (
          segments.map((segment) =>
            segment.value > 0 ? (
              <div
                key={segment.label}
                className={segment.colorClass}
                style={{ width: `${(segment.value / total) * 100}%` }}
                aria-hidden="true"
              />
            ) : null,
          )
        ) : (
          <div className="w-full bg-surface-raised" aria-hidden="true" />
        )}
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${segment.colorClass}`} aria-hidden="true" />
            <dt className="text-body-small text-text-muted">{segment.label}</dt>
            <dd className="text-body-small tabular-nums text-text">{segment.formattedValue}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function buildAriaLabel(segments: ProportionSegment[]): string {
  return segments.map((s) => `${s.label}: ${s.formattedValue}`).join(", ");
}
RECOVERAI_PHASE4_EOF

mkdir -p "frontend/src/components/overview"
cat > "frontend/src/components/overview/RevenuePosition.tsx" << 'RECOVERAI_PHASE4_EOF'
import { ProportionBar } from "../ui/ProportionBar";
import { formatCurrency, formatPercent } from "../../lib/format";
import type { MetricsSummary } from "../../types/api";

/**
 * Design spec §12-A: Revenue Recovered as the largest numeral beside
 * Revenue at Risk, with Recovery Rate as a smaller supporting figure
 * between them, plus a single proportion bar (recovered vs. at-risk
 * share of total-at-risk-ever). Every figure traces directly to
 * MetricsSummary — nothing computed beyond simple addition of two
 * already-real fields.
 */
export function RevenuePosition({ metrics }: { metrics: MetricsSummary }) {
  const recovered = Number(metrics.revenue_recovered);
  const atRisk = Number(metrics.revenue_at_risk);

  return (
    <section>
      <h2 className="text-label uppercase text-text-faint">Revenue Position</h2>

      <div className="mt-4 flex flex-wrap items-end gap-x-10 gap-y-5">
        <div>
          <div className="text-body-small text-text-muted">Revenue recovered</div>
          <div className="text-display tabular-nums text-success">{formatCurrency(metrics.revenue_recovered)}</div>
        </div>

        <div className="pb-1.5">
          <div className="text-body-small text-text-muted">Recovery rate</div>
          <div className="text-heading tabular-nums text-text">{formatPercent(metrics.recovery_rate)}</div>
        </div>

        <div>
          <div className="text-body-small text-text-muted">Revenue at risk</div>
          <div className="text-display tabular-nums text-warning">{formatCurrency(metrics.revenue_at_risk)}</div>
        </div>
      </div>

      <div className="mt-6 max-w-xl">
        <ProportionBar
          segments={[
            {
              label: "Recovered",
              value: recovered,
              formattedValue: formatCurrency(metrics.revenue_recovered),
              colorClass: "bg-success",
            },
            {
              label: "At risk",
              value: atRisk,
              formattedValue: formatCurrency(metrics.revenue_at_risk),
              colorClass: "bg-warning",
            },
          ]}
        />
      </div>
    </section>
  );
}
RECOVERAI_PHASE4_EOF

mkdir -p "frontend/src/components/overview"
cat > "frontend/src/components/overview/RecoveryPosture.tsx" << 'RECOVERAI_PHASE4_EOF'
import { formatCount } from "../../lib/format";
import type { MetricsSummary } from "../../types/api";

/**
 * Design spec §12-B: "four compact stat rows ... as a tight label/value
 * list, not four separate cards." Reuses the exact divide-y/border-lg
 * list pattern AccountPage already established for the same reason —
 * one state system, not per-screen reinvention.
 */
export function RecoveryPosture({ metrics }: { metrics: MetricsSummary }) {
  return (
    <section>
      <h2 className="text-label uppercase text-text-faint">Recovery Posture</h2>
      <dl className="mt-4 divide-y divide-border rounded-lg border border-border">
        <Row label="Payments analyzed" value={formatCount(metrics.payments_analyzed)} />
        <Row label="Recovered" value={formatCount(metrics.recovered_count)} />
        <Row label="Escalated" value={formatCount(metrics.escalated_count)} />
        <Row label="Automatically recovered" value={formatCount(metrics.automatically_recovered_count)} />
      </dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="text-sm tabular-nums text-text">{value}</dd>
    </div>
  );
}
RECOVERAI_PHASE4_EOF

mkdir -p "frontend/src/components/overview"
cat > "frontend/src/components/overview/OutcomeDistribution.tsx" << 'RECOVERAI_PHASE4_EOF'
import { ProportionBar } from "../ui/ProportionBar";
import { formatCount } from "../../lib/format";
import type { MetricsSummary } from "../../types/api";

/**
 * Design spec §12-C: "a single restrained horizontal stacked bar —
 * Recovered / At Risk / Escalated segments, proportioned from real
 * /metrics/summary counts. No invented time-series." The backend
 * exposes recovered_count and escalated_count directly; "at risk"
 * (still open — failed or retry_scheduled) is the remainder of
 * payments_analyzed, a real count derived by simple subtraction, not
 * a fabricated figure.
 *
 * Escalated is rendered in color-danger here specifically (rather than
 * the color-warning StatusChip uses for a single escalated payment row)
 * because this is a 3-way distribution where "at risk" already owns
 * warning — see Phase 4 report for the reasoning.
 */
export function OutcomeDistribution({ metrics }: { metrics: MetricsSummary }) {
  const atRiskCount = Math.max(
    metrics.payments_analyzed - metrics.recovered_count - metrics.escalated_count,
    0,
  );

  return (
    <section>
      <h2 className="text-label uppercase text-text-faint">Outcome Distribution</h2>
      <div className="mt-4 max-w-xl">
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
      </div>
    </section>
  );
}
RECOVERAI_PHASE4_EOF

mkdir -p "frontend/src/components/overview"
cat > "frontend/src/components/overview/RecoveryActivity.tsx" << 'RECOVERAI_PHASE4_EOF'
import { Link } from "react-router-dom";
import { StatusChip } from "../ui/StatusChip";
import { formatCurrency, formatRelativeTime } from "../../lib/format";
import type { PaymentRead } from "../../types/api";

/**
 * Design spec correction-pass delta §2: a short (5-8 item) list of
 * recent recovery-relevant outcomes, derived entirely from the payments
 * already loaded for this page — no new endpoint, no polling loop.
 *
 * The backend's /payments list is a current-state snapshot, not a
 * discrete event log, so per the delta's explicit fallback rule this
 * degrades to "recent payments with a status change": rows are ordered
 * by updated_at (most recently changed first) and filtered to payments
 * where something has actually happened beyond bare ingestion — i.e.
 * status is no longer the initial "failed". This deliberately
 * distinguishes it from Recent Payment Activity below (§12-D, ordered
 * by created_at — arrival order) rather than showing the same rows
 * twice.
 *
 * Three or four words each, no metadata, no actor — this is explicitly
 * not a second audit log; the full causal chain lives on Payment Detail
 * → Audit Timeline.
 */
export function RecoveryActivity({ payments }: { payments: PaymentRead[] }) {
  const items = payments
    .filter((payment) => payment.status !== "failed")
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 8);

  return (
    <section>
      <h2 className="text-label uppercase text-text-faint">Recovery Activity</h2>

      {items.length === 0 ? (
        <p className="mt-3 text-body-small text-text-faint">No recovery activity yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {items.map((payment) => (
            <li key={payment.id}>
              <Link
                to={`/app/payments/${payment.id}`}
                className="focus-ring flex items-center justify-between gap-4 py-2.5 transition-colors duration-150 hover:bg-surface-raised"
              >
                <span className="flex items-center gap-3">
                  <StatusChip status={payment.status} />
                  <span className="text-body-small tabular-nums text-text">
                    {formatCurrency(payment.amount, payment.currency)}
                  </span>
                </span>
                <span className="text-body-small text-text-faint">{formatRelativeTime(payment.updated_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
RECOVERAI_PHASE4_EOF

mkdir -p "frontend/src/components/overview"
cat > "frontend/src/components/overview/RecoveryActivity.test.tsx" << 'RECOVERAI_PHASE4_EOF'
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RecoveryActivity } from "./RecoveryActivity";
import type { PaymentRead } from "../../types/api";

function payment(overrides: Partial<PaymentRead>): PaymentRead {
  return {
    id: "pay_default",
    merchant_id: "m1",
    customer: null,
    gateway: "razorpay",
    gateway_payment_id: "rzp_1",
    amount: "1000.00",
    currency: "INR",
    status: "failed",
    failure_code: null,
    failure_message: null,
    original_transaction_at: null,
    created_at: "2026-09-20T09:00:00Z",
    updated_at: "2026-09-20T09:00:00Z",
    ...overrides,
  };
}

function renderActivity(payments: PaymentRead[]) {
  return render(
    <MemoryRouter>
      <RecoveryActivity payments={payments} />
    </MemoryRouter>,
  );
}

describe("RecoveryActivity", () => {
  it("excludes payments still sitting at the untouched 'failed' status", () => {
    const untouched = payment({ id: "pay_untouched", status: "failed", amount: "5000.00" });
    const recovered = payment({ id: "pay_recovered", status: "recovered", amount: "12000.00" });

    renderActivity([untouched, recovered]);

    expect(screen.queryByText("₹5,000")).not.toBeInTheDocument();
    expect(screen.getByText("₹12,000")).toBeInTheDocument();
  });

  it("orders items by most-recently-changed (updated_at), not arrival order", () => {
    // Deliberately passed in an order that does NOT match updated_at order,
    // the way a real /payments response (sorted by created_at) wouldn't
    // either — this is the whole point of the section.
    const oldestChange = payment({
      id: "pay_oldest_change",
      status: "retry_scheduled",
      amount: "3000.00",
      updated_at: "2026-09-23T09:00:00Z",
    });
    const mostRecentChange = payment({
      id: "pay_most_recent_change",
      status: "recovered",
      amount: "12000.00",
      updated_at: "2026-09-26T08:00:00Z",
    });
    const middleChange = payment({
      id: "pay_middle_change",
      status: "escalated",
      amount: "8000.00",
      updated_at: "2026-09-25T09:00:00Z",
    });

    renderActivity([oldestChange, mostRecentChange, middleChange]);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveTextContent("₹12,000");
    expect(links[1]).toHaveTextContent("₹8,000");
    expect(links[2]).toHaveTextContent("₹3,000");
  });

  it("shows at most 8 items even when more recovery-relevant payments are loaded", () => {
    const payments = Array.from({ length: 12 }, (_, i) =>
      payment({ id: `pay_${i}`, status: "recovered", amount: `${(i + 1) * 1000}.00` }),
    );

    renderActivity(payments);

    expect(screen.getAllByRole("link")).toHaveLength(8);
  });

  it("links each item to its Payment Detail page", () => {
    renderActivity([payment({ id: "pay_abc123", status: "recovered" })]);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/app/payments/pay_abc123");
  });

  it("shows a plain message, not an empty list, when nothing has changed yet", () => {
    renderActivity([payment({ id: "pay_still_failed", status: "failed" })]);
    expect(screen.getByText("No recovery activity yet.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders the real status label alongside each amount, not a bare color", () => {
    renderActivity([payment({ id: "pay_escalated", status: "escalated", amount: "9000.00" })]);
    const link = screen.getByRole("link");
    expect(within(link).getByText("Escalated")).toBeInTheDocument();
    expect(within(link).getByText("₹9,000")).toBeInTheDocument();
  });
});
RECOVERAI_PHASE4_EOF

mkdir -p "frontend/src/components/overview"
cat > "frontend/src/components/overview/RecentPayments.tsx" << 'RECOVERAI_PHASE4_EOF'
import { useNavigate } from "react-router-dom";
import { StatusChip } from "../ui/StatusChip";
import { formatCurrency, formatRelativeTime } from "../../lib/format";
import type { PaymentRead } from "../../types/api";

/**
 * Design spec §12-D: "last 5-8 rows from GET /payments (newest first),
 * compact table — amount, status chip, customer, relative timestamp.
 * Row click → Payment Detail." The backend already returns payments
 * ordered by created_at desc (PaymentRepository.list_for_merchant), so
 * no client-side re-sort is needed here — this is real arrival order.
 *
 * Known simplification (see Phase 4 report): a real ARIA grid pattern
 * (roving tabindex, role="gridcell") is more machinery than a hackathon
 * preview table needs, so this keeps the table's real "row"/"cell"
 * semantics intact and adds tabIndex + click/Enter/Space handlers
 * directly on the row instead — reachable and operable by keyboard
 * without hijacking the row's role. Phase 5's dedicated Payments table
 * can revisit this if a fuller pattern is warranted there.
 */
export function RecentPayments({ payments }: { payments: PaymentRead[] }) {
  const navigate = useNavigate();
  const rows = payments.slice(0, 8);

  function openPayment(paymentId: string) {
    navigate(`/app/payments/${paymentId}`);
  }

  return (
    <section>
      <h2 className="text-label uppercase text-text-faint">Recent Payment Activity</h2>

      {rows.length === 0 ? (
        <p className="mt-3 text-body-small text-text-faint">No payments yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-body-small">
            <thead>
              <tr className="border-b border-border text-text-faint">
                <th scope="col" className="py-2 pr-4 font-normal">
                  Amount
                </th>
                <th scope="col" className="py-2 pr-4 font-normal">
                  Status
                </th>
                <th scope="col" className="py-2 pr-4 font-normal">
                  Customer
                </th>
                <th scope="col" className="py-2 pr-0 text-right font-normal">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((payment) => (
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
                  <td className="py-2.5 pr-4 tabular-nums text-text">
                    {formatCurrency(payment.amount, payment.currency)}
                  </td>
                  <td className="py-2.5 pr-4">
                    <StatusChip status={payment.status} />
                  </td>
                  <td className="py-2.5 pr-4 text-text-muted">{payment.customer?.name ?? "—"}</td>
                  <td className="py-2.5 pr-0 text-right text-text-faint">{formatRelativeTime(payment.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
RECOVERAI_PHASE4_EOF

mkdir -p "frontend/src/components/overview"
cat > "frontend/src/components/overview/QuickDemoEntry.tsx" << 'RECOVERAI_PHASE4_EOF'
import { useNavigate } from "react-router-dom";
import { Button } from "../ui/Button";

/**
 * Design spec §12-F: "a single quiet panel linking to Recovery Lab ...
 * always present, not just in the empty state." Recovery Lab itself
 * isn't built until Phase 7 — this links to the real route already
 * wired in App.tsx, which currently renders its own placeholder.
 */
export function QuickDemoEntry() {
  const navigate = useNavigate();

  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface px-5 py-4">
      <div>
        <h2 className="text-sm font-medium text-text">Test the full pipeline with a simulated failure</h2>
        <p className="mt-1 text-body-small text-text-muted">
          Recovery Lab runs a real failed payment through AI diagnosis, policy, and recovery.
        </p>
      </div>
      <Button variant="secondary" onClick={() => navigate("/app/recovery-lab")}>
        Open Recovery Lab
      </Button>
    </section>
  );
}
RECOVERAI_PHASE4_EOF

mkdir -p "frontend/src/components/overview"
cat > "frontend/src/components/overview/OverviewSkeleton.tsx" << 'RECOVERAI_PHASE4_EOF'
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
      className="space-y-10"
      role="status"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <Skeleton className="h-3 w-32" />
          <div className="flex gap-10">
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

      <div className="space-y-10 border-t border-border pt-10">
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
RECOVERAI_PHASE4_EOF

mkdir -p "frontend/src/pages"
cat > "frontend/src/pages/OverviewPage.test.tsx" << 'RECOVERAI_PHASE4_EOF'
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { OverviewPage } from "./OverviewPage";
import * as api from "../lib/api";
import type { MetricsSummary, PaymentRead } from "../types/api";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, getMetricsSummary: vi.fn(), listPayments: vi.fn() };
});

const METRICS: MetricsSummary = {
  merchant_id: "m1",
  payments_analyzed: 40,
  revenue_at_risk: "125000.00",
  revenue_recovered: "375000.00",
  recovered_count: 24,
  escalated_count: 4,
  automatically_recovered_count: 18,
  recovery_rate: 0.6,
  automatic_recovery_rate: 0.45,
  escalation_rate: 0.1,
  recovery_attempt_success_rate: 0.72,
  average_recovery_time_seconds: 3600,
  failed_or_blocked_intervention_count: 3,
  generated_at: "2026-09-26T10:00:00Z",
};

const EMPTY_METRICS: MetricsSummary = { ...METRICS, payments_analyzed: 0 };

function payment(overrides: Partial<PaymentRead>): PaymentRead {
  return {
    id: "pay_default",
    merchant_id: "m1",
    customer: { id: "cust_1", name: "Ananya Rao", email: "ananya@example.com", phone: null },
    gateway: "razorpay",
    gateway_payment_id: "rzp_1",
    amount: "1000.00",
    currency: "INR",
    status: "failed",
    failure_code: "CARD_DECLINED",
    failure_message: "Card declined by issuer",
    original_transaction_at: null,
    created_at: "2026-09-20T09:00:00Z",
    updated_at: "2026-09-20T09:00:00Z",
    ...overrides,
  };
}

// Newest-created first, matching the real backend contract
// (PaymentRepository.list_for_merchant orders by created_at desc).
const PAYMENTS: PaymentRead[] = [
  payment({
    id: "pay_1",
    status: "failed",
    amount: "5000.00",
    customer: { id: "c1", name: "Ananya Rao", email: null, phone: null },
    created_at: "2026-09-26T09:00:00Z",
    updated_at: "2026-09-26T09:00:00Z",
  }),
  payment({
    id: "pay_2",
    status: "recovered",
    amount: "12000.00",
    customer: { id: "c2", name: "Karthik Iyer", email: null, phone: null },
    created_at: "2026-09-25T09:00:00Z",
    updated_at: "2026-09-26T08:00:00Z",
  }),
  payment({
    id: "pay_3",
    status: "escalated",
    amount: "8000.00",
    customer: { id: "c3", name: "Meera Nair", email: null, phone: null },
    created_at: "2026-09-24T09:00:00Z",
    updated_at: "2026-09-25T09:00:00Z",
  }),
  payment({
    id: "pay_4",
    status: "retry_scheduled",
    amount: "3000.00",
    customer: { id: "c4", name: "Ravi Shah", email: null, phone: null },
    created_at: "2026-09-23T09:00:00Z",
    updated_at: "2026-09-23T09:00:00Z",
  }),
];

function renderOverview() {
  return render(
    <MemoryRouter initialEntries={["/app"]}>
      <Routes>
        <Route path="/app" element={<OverviewPage />} />
        <Route path="/app/recovery-lab" element={<div>Recovery Lab Page</div>} />
        <Route path="/app/payments/:paymentId" element={<div>Payment Detail Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function sectionFor(headingText: string): HTMLElement {
  const heading = screen.getByText(headingText);
  const section = heading.closest("section");
  if (!section) throw new Error(`No <section> ancestor found for heading "${headingText}"`);
  return section;
}

describe("OverviewPage", () => {
  afterEach(() => {
    vi.mocked(api.getMetricsSummary).mockReset();
    vi.mocked(api.listPayments).mockReset();
  });

  it("shows a loading skeleton while the dashboard is fetching", () => {
    vi.mocked(api.getMetricsSummary).mockReturnValue(new Promise(() => {}));
    vi.mocked(api.listPayments).mockReturnValue(new Promise(() => {}));

    renderOverview();

    expect(screen.getByRole("status", { name: "Loading dashboard" })).toBeInTheDocument();
  });

  it("shows the real backend error message with a retry action, and recovers on retry", async () => {
    vi.mocked(api.getMetricsSummary).mockRejectedValueOnce(new api.ApiError(500, "Internal server error"));
    vi.mocked(api.listPayments).mockRejectedValueOnce(new api.ApiError(500, "Internal server error"));

    renderOverview();

    expect(await screen.findByText("Internal server error")).toBeInTheDocument();

    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Revenue Position")).toBeInTheDocument();
    expect(screen.queryByText("Internal server error")).not.toBeInTheDocument();
  });

  it("shows the workspace-ready empty state when no payments have been analyzed yet", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(EMPTY_METRICS);
    vi.mocked(api.listPayments).mockResolvedValue([]);

    renderOverview();

    expect(await screen.findByText("Your workspace is ready")).toBeInTheDocument();
    // Design spec §24: "do not show empty charts."
    expect(screen.queryByText("Revenue Position")).not.toBeInTheDocument();
    expect(screen.queryByText("Outcome Distribution")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Run demo scenario" }));
    expect(await screen.findByText("Recovery Lab Page")).toBeInTheDocument();
  });

  it("renders real revenue, recovery-rate, and posture figures from the metrics summary", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Revenue Position");

    const revenue = sectionFor("Revenue Position");
    // Each figure appears twice within this section — once as the large
    // numeral, once again in the proportion-bar legend beneath it.
    expect(within(revenue).getAllByText("₹3,75,000")).toHaveLength(2); // revenue_recovered
    expect(within(revenue).getAllByText("₹1,25,000")).toHaveLength(2); // revenue_at_risk
    expect(within(revenue).getByText("60%")).toBeInTheDocument(); // recovery_rate

    const posture = sectionFor("Recovery Posture");
    expect(within(posture).getByText("40")).toBeInTheDocument(); // payments_analyzed
    expect(within(posture).getByText("24")).toBeInTheDocument(); // recovered_count
    expect(within(posture).getByText("4")).toBeInTheDocument(); // escalated_count
    expect(within(posture).getByText("18")).toBeInTheDocument(); // automatically_recovered_count
  });

  it("derives the outcome distribution's at-risk count from payments_analyzed minus recovered and escalated", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Outcome Distribution");
    const outcome = sectionFor("Outcome Distribution");

    // 40 analyzed - 24 recovered - 4 escalated = 12 still at risk.
    expect(within(outcome).getByText("12")).toBeInTheDocument();
    expect(within(outcome).getByText("24")).toBeInTheDocument();
    expect(within(outcome).getByText("4")).toBeInTheDocument();
  });

  it("shows Recovery Activity ordered by most-recently-changed, excluding untouched failures", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Recovery Activity");

    const activity = sectionFor("Recovery Activity");
    const links = within(activity).getAllByRole("link");

    // pay_1 (still "failed") must not appear at all.
    expect(within(activity).queryByText("₹5,000")).not.toBeInTheDocument();
    // Ordered by updated_at desc: pay_2 (08:00) > pay_3 (25th) > pay_4 (23rd).
    expect(links[0]).toHaveTextContent("₹12,000");
    expect(links[1]).toHaveTextContent("₹8,000");
    expect(links[2]).toHaveTextContent("₹3,000");
  });

  it("shows Recent Payment Activity in real arrival order (created_at, as returned by the backend)", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Recent Payment Activity");

    const table = sectionFor("Recent Payment Activity");
    const rows = within(table).getAllByRole("row").slice(1); // drop the header row

    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("Ananya Rao");
    expect(rows[1]).toHaveTextContent("Karthik Iyer");
    expect(rows[2]).toHaveTextContent("Meera Nair");
    expect(rows[3]).toHaveTextContent("Ravi Shah");
  });

  it("navigates to Payment Detail when a recent payment row is activated", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Recent Payment Activity");

    await userEvent.click(screen.getByRole("row", { name: "Open payment pay_2" }));
    expect(await screen.findByText("Payment Detail Page")).toBeInTheDocument();
  });

  it("always shows the Quick Demo Entry panel on a populated dashboard, linking to Recovery Lab", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Test the full pipeline with a simulated failure");

    await userEvent.click(screen.getByRole("button", { name: "Open Recovery Lab" }));
    expect(await screen.findByText("Recovery Lab Page")).toBeInTheDocument();
  });
});
RECOVERAI_PHASE4_EOF

echo "Phase 4 new files written."
