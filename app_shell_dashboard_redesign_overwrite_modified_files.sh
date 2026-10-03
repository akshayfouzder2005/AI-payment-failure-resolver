#!/usr/bin/env bash
# App shell + dashboard redesign — MODIFIED files + removals (run second, from repo root)
set -euo pipefail

if [ ! -d "frontend/src" ]; then echo "Run this from the repository root (the folder that contains frontend/)."; exit 1; fi

mkdir -p "frontend/src/components/overview"
cat > "frontend/src/components/overview/OverviewSkeleton.tsx" <<'__RECOVERAI_EOF__'
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
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/overview/OverviewSkeleton.tsx"

mkdir -p "frontend/src/components/overview"
cat > "frontend/src/components/overview/QuickDemoEntry.tsx" <<'__RECOVERAI_EOF__'
import { useNavigate } from "react-router-dom";
import { Button } from "../ui/Button";

/**
 * Always-present entry to Recovery Lab (not just in the empty state), set
 * as a quiet raised panel in the dashboard rail. It links to the real
 * /app/recovery-lab route.
 */
export function QuickDemoEntry() {
  const navigate = useNavigate();

  return (
    <section className="rounded-lg border border-border bg-surface-raised p-5">
      <h2 className="text-sm font-medium text-text">Test the full pipeline with a simulated failure</h2>
      <p className="mt-1.5 text-body-small text-text-muted">
        Recovery Lab runs a real failed payment through AI diagnosis, policy, and recovery.
      </p>
      <Button variant="secondary" onClick={() => navigate("/app/recovery-lab")} className="mt-4">
        Open Recovery Lab
      </Button>
    </section>
  );
}
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/overview/QuickDemoEntry.tsx"

mkdir -p "frontend/src/components/overview"
cat > "frontend/src/components/overview/RecoveryActivity.tsx" <<'__RECOVERAI_EOF__'
import { Link } from "react-router-dom";
import { SectionHeader } from "../ui/SectionHeader";
import { StatusChip } from "../ui/StatusChip";
import { formatCurrency, formatRelativeTime } from "../../lib/format";
import type { PaymentRead } from "../../types/api";

/**
 * Recent recovery-relevant outcomes, derived entirely from the payments the
 * page already loaded — no extra endpoint, no polling loop.
 *
 * /payments is a current-state snapshot, not an event log, so this is
 * "payments that have moved past the untouched 'failed' status, most
 * recently changed first" (updated_at desc). That ordering is what keeps it
 * distinct from Recent Failed Payments, which is arrival order. It is not a
 * second audit log: the full causal chain lives on Payment Detail.
 */
export function RecoveryActivity({ payments }: { payments: PaymentRead[] }) {
  const items = payments
    .filter((payment) => payment.status !== "failed")
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 8);

  return (
    <section>
      <SectionHeader title="Recovery Activity" />

      {items.length === 0 ? (
        <p className="text-body-small text-text-muted">No recovery activity yet.</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((payment) => (
            <li key={payment.id}>
              <Link
                to={`/app/payments/${payment.id}`}
                className="focus-ring flex items-center justify-between gap-3 py-3 transition-colors duration-150 hover:bg-surface-raised xl:-mx-2 xl:px-2"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium tabular-nums text-text">
                    {formatCurrency(payment.amount, payment.currency)}
                  </span>
                  <span className="mt-0.5 block truncate text-body-small text-text-muted">
                    {payment.customer?.name ?? "—"} · {formatRelativeTime(payment.updated_at)}
                  </span>
                </span>
                <StatusChip status={payment.status} className="shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/overview/RecoveryActivity.tsx"

mkdir -p "frontend/src/components/overview"
cat > "frontend/src/components/overview/RevenuePosition.tsx" <<'__RECOVERAI_EOF__'
import { ProportionBar } from "../ui/ProportionBar";
import { SectionHeader } from "../ui/SectionHeader";
import { formatCurrency, formatDuration, formatPercent } from "../../lib/format";
import type { MetricsSummary } from "../../types/api";

/**
 * The page's primary read: revenue recovered as the single largest numeral,
 * a proportion bar for recovered vs. still-at-risk value, then a ruled strip
 * of the supporting figures. Every number traces to MetricsSummary — nothing
 * is computed here beyond handing two real fields to the bar.
 *
 * The bar compares only recovered and at-risk value. Escalated payments are
 * not in revenue_at_risk (the backend counts only failed + retry_scheduled
 * as money still collectible), so the caption says so rather than letting
 * the bar imply it covers every failed rupee.
 */
export function RevenuePosition({ metrics }: { metrics: MetricsSummary }) {
  return (
    <section>
      <SectionHeader title="Revenue Position" />

      <div>
        <div className="flex items-center gap-2 text-body-small text-text-muted">
          <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
          Revenue recovered
        </div>
        <div className="mt-1 text-display tabular-nums text-text">{formatCurrency(metrics.revenue_recovered)}</div>
      </div>

      <div className="mt-6">
        <ProportionBar
          segments={[
            {
              label: "Recovered",
              value: Number(metrics.revenue_recovered),
              formattedValue: formatCurrency(metrics.revenue_recovered),
              colorClass: "bg-success",
            },
            {
              label: "At risk",
              value: Number(metrics.revenue_at_risk),
              formattedValue: formatCurrency(metrics.revenue_at_risk),
              colorClass: "bg-warning",
            },
          ]}
        />
        <p className="mt-2 text-body-small text-text-muted">
          Recovered against value still collectible. Escalated payments are tracked separately.
        </p>
      </div>

      <dl className="mt-6 grid grid-cols-1 divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Stat label="Revenue at risk" value={formatCurrency(metrics.revenue_at_risk)} dotClass="bg-warning" />
        <Stat label="Recovery rate" value={formatPercent(metrics.recovery_rate)} />
        <Stat label="Average recovery time" value={formatDuration(metrics.average_recovery_time_seconds)} />
      </dl>
    </section>
  );
}

function Stat({ label, value, dotClass }: { label: string; value: string; dotClass?: string }) {
  return (
    <div className="py-4 sm:px-5 sm:first:pl-0 sm:last:pr-0">
      <dt className="flex items-center gap-2 text-body-small text-text-muted">
        {dotClass && <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />}
        {label}
      </dt>
      <dd className="mt-1 text-heading tabular-nums text-text">{value}</dd>
    </div>
  );
}
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/overview/RevenuePosition.tsx"

mkdir -p "frontend/src/components/shell"
cat > "frontend/src/components/shell/AppShell.test.tsx" <<'__RECOVERAI_EOF__'
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../../context/AuthContext";
import { ThemeProvider } from "../../context/ThemeContext";
import { AppShell } from "./AppShell";
import * as api from "../../lib/api";

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return { ...actual, getHealth: vi.fn(), getHealthDb: vi.fn(), getMe: vi.fn() };
});

function renderShell() {
  return render(
    <MemoryRouter initialEntries={["/app"]}>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/app" element={<AppShell />}>
              <Route index element={<div>Overview Page</div>} />
              <Route path="payments" element={<div>Payments Page</div>} />
            </Route>
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe("AppShell mobile navigation", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(api.getMe).mockRejectedValue(new api.ApiError(401, "no token"));
    vi.mocked(api.getHealth).mockResolvedValue({
      status: "ok",
      environment: "LOCAL",
      providers: { ai: "mock", recovery_gateway: "mock", notifications: "mock" },
    });
    vi.mocked(api.getHealthDb).mockResolvedValue({ status: "ok", database: "ok" });
  });

  afterEach(() => {
    vi.mocked(api.getMe).mockReset();
    vi.mocked(api.getHealth).mockReset();
    vi.mocked(api.getHealthDb).mockReset();
  });

  it("has no mobile nav open by default", () => {
    renderShell();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the drawer from the mobile menu trigger", async () => {
    renderShell();
    await userEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByRole("dialog", { name: "Navigation" })).toBeInTheDocument();
  });

  it("closes the drawer automatically once a nav link changes the route", async () => {
    renderShell();
    await userEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // The drawer's own link list, not the desktop sidebar's
    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    await userEvent.click(within(drawer).getByRole("link", { name: "Payments" }));

    await waitFor(() => expect(screen.getByText("Payments Page")).toBeInTheDocument());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("AppShell workspace", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(api.getHealth).mockResolvedValue({
      status: "ok",
      environment: "LOCAL",
      providers: { ai: "mock", recovery_gateway: "mock", notifications: "mock" },
    });
    vi.mocked(api.getHealthDb).mockResolvedValue({ status: "ok", database: "ok" });
  });

  afterEach(() => {
    vi.mocked(api.getMe).mockReset();
    vi.mocked(api.getHealth).mockReset();
    vi.mocked(api.getHealthDb).mockReset();
    localStorage.clear();
  });

  it("shows the signed-in merchant as the active workspace in the sidebar", async () => {
    localStorage.setItem("recoverai_token", "test-token");
    vi.mocked(api.getMe).mockResolvedValue({
      user_id: "u1",
      name: "Priya Menon",
      email: "priya@acme.test",
      merchant_id: "m1",
      merchant_name: "Acme Retail",
    });

    renderShell();

    expect(await screen.findByText("Acme Retail")).toBeInTheDocument();
  });

  it("renders the routed page inside the main workspace region", () => {
    vi.mocked(api.getMe).mockRejectedValue(new api.ApiError(401, "no token"));
    renderShell();

    expect(within(screen.getByRole("main")).getByText("Overview Page")).toBeInTheDocument();
  });
});
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/shell/AppShell.test.tsx"

mkdir -p "frontend/src/components/shell"
cat > "frontend/src/components/shell/AppShell.tsx" <<'__RECOVERAI_EOF__'
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileNavDrawer } from "./MobileNavDrawer";

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  // A drawer left open across a route change is a real bug, not a nicety —
  // closing it here synchronizes UI state with the router, which is exactly
  // what an effect is for.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setNavOpen(false);
  }, [location.pathname]);

  return (
    // Two planes: the chrome (sidebar) sits on `canvas`, the workspace
    // (top bar + content) on `surface` — in light mode that makes the work
    // area the lighter plane, in dark mode the slightly raised one.
    // h-dvh, not h-screen: on mobile browsers 100vh includes the collapsing
    // URL bar and pushes the page bottom off-screen.
    <div className="flex h-dvh bg-canvas text-text">
      <Sidebar workspaceName={user?.merchant_name} />
      <MobileNavDrawer open={navOpen} onClose={() => setNavOpen(false)} workspaceName={user?.merchant_name} />
      <div className="flex min-w-0 flex-1 flex-col bg-surface">
        <TopBar onOpenNav={() => setNavOpen(true)} />
        {/* Wide, left-aligned workspace: the max-width only stops ultra-wide
            screens from stretching table rows into unreadable lengths — it
            deliberately does not center the column (this is a console, not
            a marketing page). Gutters step up with the viewport. */}
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
          <div className="max-w-[1360px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/shell/AppShell.tsx"

mkdir -p "frontend/src/components/shell"
cat > "frontend/src/components/shell/MobileNavDrawer.tsx" <<'__RECOVERAI_EOF__'
import { useEffect, useRef } from "react";
import { Brand, SidebarNav } from "./Sidebar";
import { WorkspaceBlock } from "./WorkspaceBlock";

/**
 * Below the desktop breakpoint the persistent Sidebar is hidden entirely, so
 * this is the only way to navigate — a real drawer, not a decoration.
 * Lightweight dialog semantics: focus moves in on open, Escape and backdrop
 * click close it, and it unmounts on close so it never sits in the tab order.
 */
export function MobileNavDrawer({
  open,
  onClose,
  workspaceName,
}: {
  open: boolean;
  onClose: () => void;
  workspaceName?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div className="absolute inset-0 bg-canvas/80" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        tabIndex={-1}
        className="focus-ring animate-drawer-in absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r border-border bg-canvas px-3 py-5 shadow-overlay"
      >
        <div className="flex items-center justify-between">
          <Brand />
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="focus-ring rounded px-2 py-1 text-label uppercase text-text-muted transition-colors duration-150 hover:text-text"
          >
            Close
          </button>
        </div>
        <div className="mt-5">
          <WorkspaceBlock name={workspaceName} />
        </div>
        <div className="mt-7 min-h-0 flex-1 overflow-y-auto">
          <SidebarNav onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/shell/MobileNavDrawer.tsx"

mkdir -p "frontend/src/components/shell"
cat > "frontend/src/components/shell/Sidebar.test.tsx" <<'__RECOVERAI_EOF__'
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "./Sidebar";

function renderSidebar(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe("Sidebar active state", () => {
  it("marks exactly the current route as selected, via aria-current and the selected styling", () => {
    renderSidebar("/app");
    const overview = screen.getByRole("link", { name: "Overview" });

    expect(overview).toHaveAttribute("aria-current", "page");
    // Selected = soft raised fill + strong text. Accent is reserved for the
    // short rail and the icon, never a filled accent pill.
    expect(overview.className).toContain("bg-surface-raised");
    expect(overview.className).toContain("font-medium");
    expect(overview.className).not.toMatch(/(^|\s)bg-accent(\s|$)/);
  });

  it("leaves inactive items unselected", () => {
    renderSidebar("/app");
    const payments = screen.getByRole("link", { name: "Payments" });

    expect(payments).not.toHaveAttribute("aria-current");
    expect(payments.className).not.toContain("bg-surface-raised");
    expect(payments.className).not.toContain("font-medium");
  });

  it("keeps Payments selected on a nested payment-detail route, but not Overview", () => {
    renderSidebar("/app/payments/pay_123");

    expect(screen.getByRole("link", { name: "Payments" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("lists all five nav destinations", () => {
    renderSidebar("/app");
    ["Overview", "Payments", "Recovery Lab", "Audit", "Account"].forEach((label) =>
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument(),
    );
  });

  it("groups destinations under Monitor, Recovery and Settings", () => {
    renderSidebar("/app");

    expect(within(screen.getByRole("list", { name: "Monitor" })).getAllByRole("link")).toHaveLength(2);
    expect(within(screen.getByRole("list", { name: "Recovery" })).getAllByRole("link")).toHaveLength(2);
    expect(within(screen.getByRole("list", { name: "Settings" })).getAllByRole("link")).toHaveLength(1);
  });
});

describe("Sidebar workspace block", () => {
  it("shows the active workspace name when one is provided", () => {
    render(
      <MemoryRouter initialEntries={["/app"]}>
        <Sidebar workspaceName="Acme Retail" />
      </MemoryRouter>,
    );
    expect(screen.getByText("Acme Retail")).toBeInTheDocument();
  });

  it("shows a dash rather than inventing a name before the session resolves", () => {
    renderSidebar("/app");
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/shell/Sidebar.test.tsx"

mkdir -p "frontend/src/components/shell"
cat > "frontend/src/components/shell/Sidebar.tsx" <<'__RECOVERAI_EOF__'
import { NavLink } from "react-router-dom";
import { NavIcon, type NavIconName } from "./NavIcon";
import { WorkspaceBlock } from "./WorkspaceBlock";

interface NavItem {
  to: string;
  label: string;
  icon: NavIconName;
  end?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Route set is unchanged from the previous shell — five real destinations,
// regrouped under quiet labels so the rail reads as monitor / recovery /
// settings rather than one flat list.
// oxlint-disable-next-line react/only-export-components
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Monitor",
    items: [
      { to: "/app", label: "Overview", icon: "overview", end: true },
      { to: "/app/payments", label: "Payments", icon: "payments" },
    ],
  },
  {
    label: "Recovery",
    items: [
      { to: "/app/recovery-lab", label: "Recovery Lab", icon: "lab" },
      { to: "/app/audit", label: "Audit", icon: "audit" },
    ],
  },
  {
    label: "Settings",
    items: [{ to: "/app/account", label: "Account", icon: "account" }],
  },
];

const LINK_BASE =
  "focus-ring group relative flex items-center gap-2.5 rounded border px-2.5 py-1.5 text-sm transition-colors duration-150";

// Selected = soft raised fill + hairline border + strong text + a short
// accent rail. Inactive stays flat until hovered, then takes the faintest
// surface tint — restrained on purpose, color only on the selected item.
const LINK_ACTIVE =
  "border-border bg-surface-raised font-medium text-text before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent";
const LINK_INACTIVE = "border-transparent text-text-muted hover:bg-surface hover:text-text";

/** Shared nav list — used by the persistent desktop rail and the mobile drawer. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex h-full flex-col gap-6" aria-label="Primary">
      {NAV_GROUPS.map((group, index) => (
        // The last group (Settings / Account) is pinned to the bottom of
        // the rail, the way account-level controls sit in a console.
        <div key={group.label} className={index === NAV_GROUPS.length - 1 ? "mt-auto" : undefined}>
          <div className="mb-1.5 px-2.5 text-label uppercase text-text-muted" aria-hidden="true">
            {group.label}
          </div>
          <ul className="space-y-0.5" aria-label={group.label}>
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) => `${LINK_BASE} ${isActive ? LINK_ACTIVE : LINK_INACTIVE}`}
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`transition-colors duration-150 ${
                          isActive ? "text-accent" : "text-text-muted group-hover:text-text"
                        }`}
                      >
                        <NavIcon name={item.icon} />
                      </span>
                      {item.label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Brand() {
  return (
    <div className="px-2.5 text-[15px] font-semibold tracking-tight">
      Recover<span className="text-accent">AI</span>
    </div>
  );
}

export function Sidebar({ workspaceName }: { workspaceName?: string }) {
  return (
    <aside className="hidden w-[232px] shrink-0 flex-col border-r border-border bg-canvas px-3 py-5 md:flex">
      <Brand />
      <div className="mt-5">
        <WorkspaceBlock name={workspaceName} />
      </div>
      <div className="mt-7 min-h-0 flex-1 overflow-y-auto">
        <SidebarNav />
      </div>
    </aside>
  );
}
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/shell/Sidebar.tsx"

mkdir -p "frontend/src/components/shell"
cat > "frontend/src/components/shell/TopBar.tsx" <<'__RECOVERAI_EOF__'
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { ThemeToggle } from "../ui/ThemeToggle";
import type { HealthResponse } from "../../types/api";

type CheckState = "checking" | "ok" | "down";

/**
 * Real health/environment signal only — see design spec correction pass,
 * §1/§8. Never a hardcoded "All systems operational". The API and DB checks
 * are independent: one failing must never hide or override the other's
 * result, and the spec explicitly asks for two dots when they diverge.
 */
export function TopBar({ onOpenNav }: { onOpenNav: () => void }) {
  const { user, logout } = useAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [apiState, setApiState] = useState<CheckState>("checking");
  const [dbState, setDbState] = useState<CheckState>("checking");
  const [providersOpen, setProvidersOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    function check() {
      api
        .getHealth()
        .then((result) => {
          if (cancelled) return;
          setHealth(result);
          setApiState("ok");
        })
        .catch(() => {
          if (!cancelled) setApiState("down");
        });

      api
        .getHealthDb()
        .then(() => {
          if (!cancelled) setDbState("ok");
        })
        .catch(() => {
          if (!cancelled) setDbState("down");
        });
    }

    check();
    const interval = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setProvidersOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "";

  const bothResolved = apiState !== "checking" && dbState !== "checking";
  const bothOk = apiState === "ok" && dbState === "ok";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 sm:px-6 lg:px-10">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="focus-ring -ml-1 rounded p-1 text-text-muted hover:text-text md:hidden"
        >
          <span className="block h-2.5 w-4 border-y border-current" aria-hidden="true" />
        </button>

        <span className="hidden text-sm font-semibold tracking-tight sm:inline md:hidden">
          Recover<span className="text-accent">AI</span>
        </span>

        {health && (
          <div className="relative" ref={popoverRef}>
            <button
              onClick={() => setProvidersOpen((open) => !open)}
              aria-expanded={providersOpen}
              className="focus-ring rounded border border-border px-2 py-1 text-label uppercase text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text"
            >
              {health.environment}
            </button>
            {providersOpen && (
              <div className="absolute left-0 top-full z-10 mt-2 w-56 rounded-lg border border-border bg-surface-raised p-3 shadow-overlay">
                <div className="mb-2 text-label uppercase text-text-muted">Providers</div>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-text-muted">Razorpay</dt>
                    <dd className="font-mono text-xs">{health.providers.recovery_gateway}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-text-muted">AI</dt>
                    <dd className="font-mono text-xs">{health.providers.ai}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-text-muted">Notifications</dt>
                    <dd className="font-mono text-xs">{health.providers.notifications}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        {!bothResolved || bothOk ? (
          <div className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-body-small text-text-muted">
            <StatusDot state={!bothResolved ? "checking" : "ok"} />
            {/* Dot-only below sm so the bar fits a phone; the text stays in
                the accessibility tree at every width. */}
            <span className="sr-only sm:not-sr-only">{!bothResolved ? "Checking…" : "Operational"}</span>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-full border border-border px-2.5 py-1 text-body-small text-text-muted">
            <span className="flex items-center gap-1.5">
              <StatusDot state={apiState} />
              <span className="sr-only sm:not-sr-only">API</span>
            </span>
            <span className="flex items-center gap-1.5">
              <StatusDot state={dbState} />
              <span className="sr-only sm:not-sr-only">DB</span>
            </span>
          </div>
        )}

        <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />

        <ThemeToggle />

        <Link
          to="/app/account"
          className="focus-ring flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface-raised text-xs font-medium text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text"
          aria-label="Account"
        >
          {initials}
        </Link>
        <button
          onClick={logout}
          className="focus-ring shrink-0 whitespace-nowrap text-xs text-text-muted transition-colors duration-150 hover:text-text"
        >
          Log out
        </button>
      </div>
    </header>
  );
}

function StatusDot({ state }: { state: CheckState }) {
  return (
    <span
      className={`h-1.5 w-1.5 rounded-full ${
        state === "ok" ? "bg-success" : state === "down" ? "bg-danger" : "bg-text-faint"
      }`}
      aria-hidden="true"
    />
  );
}
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/shell/TopBar.tsx"

mkdir -p "frontend/src/components/ui"
cat > "frontend/src/components/ui/ProportionBar.tsx" <<'__RECOVERAI_EOF__'
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
      <div className="flex h-2 w-full overflow-hidden rounded-sm bg-border" role="img" aria-label={buildAriaLabel(segments)}>
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
          <div className="w-full bg-border" aria-hidden="true" />
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
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/ui/ProportionBar.tsx"

mkdir -p "frontend/src/components/ui"
cat > "frontend/src/components/ui/Skeleton.tsx" <<'__RECOVERAI_EOF__'
/**
 * A single pulsing block, composed by each page into a skeleton that
 * matches its real layout shape (design spec §24) — never a lone
 * spinner on a blank page. `aria-hidden` since the loading state itself
 * is announced once, by the page, not per block.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-border ${className}`} aria-hidden="true" />;
}
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/ui/Skeleton.tsx"

mkdir -p "frontend/src/components/ui"
cat > "frontend/src/components/ui/StatusChip.tsx" <<'__RECOVERAI_EOF__'
/**
 * The one state-chip implementation reused everywhere a status appears —
 * Payments table, Decision Chain, Policy Gate, Recovery Attempt rows,
 * Overview. Never a bare color; always dot + label together (design spec
 * §3 — color never carries meaning alone).
 *
 * Maps every real status string this backend actually returns (Payment.status,
 * PolicyDecisionType, RecoveryAttemptStatus — see app/enums.py and
 * app/schemas/policy.py) into one of a small set of semantic tones. An
 * unrecognized string still renders — as a neutral chip showing the raw
 * value — rather than silently hiding or crashing on backend values this
 * component doesn't know about yet.
 */

type Tone = "success" | "warning" | "danger" | "info" | "muted";

const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
  info: "bg-info/15 text-info",
  muted: "bg-text-faint/15 text-text-muted",
};

// Tailwind can't resolve a dynamically-interpolated class name (`bg-${tone}`)
// at build time, so the dot color is its own static map rather than derived
// from TONE_CLASSES by string concatenation.
const DOT_CLASSES: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  muted: "bg-text-faint",
};

const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  // Payment.status
  failed: { label: "Failed", tone: "danger" },
  retry_scheduled: { label: "Retry scheduled", tone: "warning" },
  recovered: { label: "Recovered", tone: "success" },
  escalated: { label: "Escalated", tone: "warning" },
  abandoned: { label: "Abandoned", tone: "muted" },

  // PolicyDecisionType
  APPROVE: { label: "Approved", tone: "success" },
  MODIFY: { label: "Modified", tone: "warning" },
  REJECT: { label: "Rejected", tone: "danger" },
  ESCALATE: { label: "Escalated", tone: "warning" },

  // RecoveryAttemptStatus
  pending: { label: "Pending", tone: "info" },
  in_progress: { label: "Executing", tone: "info" },
  success: { label: "Success", tone: "success" },
  skipped: { label: "Skipped", tone: "muted" },

  // WebhookIngestResult.status
  processed: { label: "Processed", tone: "success" },
  duplicate: { label: "Duplicate", tone: "muted" },
  ignored: { label: "Ignored", tone: "muted" },
  processing_failed: { label: "Processing failed", tone: "danger" },
};

export function StatusChip({ status, className = "" }: { status: string; className?: string }) {
  const entry = STATUS_MAP[status] ?? { label: status, tone: "muted" as Tone };

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[entry.tone]} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[entry.tone]}`} aria-hidden="true" />
      {entry.label}
    </span>
  );
}
__RECOVERAI_EOF__
echo "  wrote frontend/src/components/ui/StatusChip.tsx"

mkdir -p "frontend/src"
cat > "frontend/src/index.css" <<'__RECOVERAI_EOF__'
@import "@fontsource/inter/400.css";
@import "@fontsource/inter/500.css";
@import "@fontsource/inter/600.css";
@import "@fontsource/jetbrains-mono/400.css";

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  /* --- Theme tokens (RecoverAI Financial Instrumentation design system v2) ---
     Every value here is three space-separated RGB channels, not a hex
     string — see tailwind.config.js's withOpacity() for why. Dark is the
     default (:root) because that's the app's existing, already-shipped
     look; [data-theme="light"] only ever *overrides* these same variable
     names, so no component anywhere needs a dark:/light: variant. The
     current theme is applied by ThemeContext setting data-theme on
     <html> (see index.html's inline bootstrap script for the
     no-flash-on-load version of the same logic). */
  :root {
    --color-canvas: 11 12 14; /* #0B0C0E */
    --color-surface: 19 20 23; /* #131417 */
    --color-surface-raised: 25 27 31; /* #191B1F */
    --color-border: 38 40 45; /* #26282D */
    --color-border-strong: 58 61 68; /* #3A3D44 */
    --color-text: 242 239 233; /* #F2EFE9 */
    --color-text-muted: 154 150 140; /* #9A968C */
    --color-text-faint: 101 98 91; /* #65625B */
    --color-accent: 201 151 63; /* #C9973F */
    --color-on-accent: 20 17 11; /* #14110B */
    --color-success: 95 165 121; /* #5FA579 */
    --color-warning: 201 151 63; /* #C9973F — same hue as accent, by design */
    --color-danger: 196 84 75; /* #C4544B */
    --color-info: 110 140 160; /* #6E8CA0 */

    /* Amber Drift — the one proprietary gradient in the system (design
       system v2 §6). Public-surface decoration only: GradientField is the
       only consumer, and it is not yet wired into any page this phase —
       that composition work belongs to the next visual phase. Never used
       as a token inside the authenticated product. */
    --gradient-amber-drift-1: #d98c3f;
    --gradient-amber-drift-2: #c2573d;
    --gradient-amber-drift-3: #6b4a9e;

    --shadow-overlay: 0 2px 8px rgba(0, 0, 0, 0.35);

    color-scheme: dark;
  }

  [data-theme="light"] {
    --color-canvas: 242 239 234; /* #F2EFEA */
    --color-surface: 250 248 245; /* #FAF8F5 */
    --color-surface-raised: 255 255 255; /* #FFFFFF */
    --color-border: 228 224 217; /* #E4E0D9 */
    --color-border-strong: 199 192 180; /* #C7C0B4 */
    --color-text: 30 27 23; /* #1E1B17 */
    --color-text-muted: 107 102 93; /* #6B665D */
    --color-text-faint: 143 137 125; /* #8F897D */
    --color-accent: 138 82 24; /* #8A5218 — darker than dark mode's accent: this
      value does double duty as both a filled dot/border color and as
      running text color (nav links, "Register"/"Log in" links), so it has
      to clear 4.5:1 on a light surface, not just look right as a swatch */
    --color-on-accent: 255 255 255; /* #FFFFFF */
    --color-success: 30 122 76; /* #1E7A4C */
    --color-warning: 138 82 24; /* #8A5218 */
    --color-danger: 166 56 44; /* #A6382C */
    --color-info: 58 90 160; /* #3A5AA0 */

    --shadow-overlay: 0 4px 16px rgba(30, 27, 23, 0.1), 0 1px 3px rgba(30, 27, 23, 0.06);

    color-scheme: light;
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-canvas text-text font-sans antialiased;
  }

  /* Tabular numerals everywhere a figure appears — money and counts must
     not jitter in aligned columns. */
  .tabular-nums,
  table {
    font-variant-numeric: tabular-nums;
  }

  /* Purposeful motion only (design spec, Motion System): collapse every
     transition to an instant state change when the user asks for it. */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
}

@layer components {
  /* Visible keyboard focus ring, per Accessibility Behavior in the spec */
  .focus-ring {
    @apply outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas;
  }

  /* Mobile nav drawer entrance — the one motion instance that narrates a
     real state transition (closed → open), per the Motion System. */
  @keyframes drawer-in {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(0);
    }
  }
  .animate-drawer-in {
    animation: drawer-in 200ms ease-out;
  }

  /* Grid/background system (design system v2 §7). A near-subliminal
     vertical rule grid for public marketing surfaces only — never used
     inside the authenticated app, which relies on real borders for
     structure instead. Not wired into any page yet; ready for the next
     visual phase. Deliberately faint: `border` at low opacity, a fixed
     column width, no color of its own. */
  .bg-grid-faint {
    background-image: repeating-linear-gradient(
      to right,
      rgb(var(--color-border) / 0.4) 0,
      rgb(var(--color-border) / 0.4) 1px,
      transparent 1px,
      transparent 160px
    );
  }

  /* Gradient system (design system v2 §6) — "Amber Drift", the one
     proprietary gradient in the product. Public-surface decoration only
     (Get Started / auth backgrounds); never a button, card, or text
     fill, and never used inside the authenticated app. Not wired into
     any page yet; ready for the next visual phase. */
  .bg-gradient-amber-drift {
    background-image: linear-gradient(
      135deg,
      var(--gradient-amber-drift-1) 0%,
      var(--gradient-amber-drift-2) 50%,
      var(--gradient-amber-drift-3) 100%
    );
  }
}
__RECOVERAI_EOF__
echo "  wrote frontend/src/index.css"

mkdir -p "frontend/src/lib"
cat > "frontend/src/lib/format.test.ts" <<'__RECOVERAI_EOF__'
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatCount, formatCurrency, formatDuration, formatPercent, formatRelativeTime, humanizeCode } from "./format";

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

describe("formatDuration", () => {
  it("renders null (nothing recovered yet) as an em dash, never 0s", () => {
    expect(formatDuration(null)).toBe("—");
  });

  it("uses the two most significant units", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(12 * 60 + 20)).toBe("12m");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(3 * 3600 + 20 * 60)).toBe("3h 20m");
    expect(formatDuration(2 * 86400 + 4 * 3600 + 59 * 60)).toBe("2d 4h");
    expect(formatDuration(2 * 86400)).toBe("2d");
  });

  it("rejects negative and non-finite values rather than printing nonsense", () => {
    expect(formatDuration(-5)).toBe("—");
    expect(formatDuration(Number.NaN)).toBe("—");
  });
});

describe("humanizeCode", () => {
  it("turns a SCREAMING_SNAKE gateway code into sentence case", () => {
    expect(humanizeCode("CARD_DECLINED")).toBe("Card declined");
    expect(humanizeCode("BAD_REQUEST_ERROR")).toBe("Bad request error");
  });

  it("returns an empty string for an empty code", () => {
    expect(humanizeCode("  ")).toBe("");
  });
});
__RECOVERAI_EOF__
echo "  wrote frontend/src/lib/format.test.ts"

mkdir -p "frontend/src/lib"
cat > "frontend/src/lib/format.ts" <<'__RECOVERAI_EOF__'
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

/**
 * A duration in seconds as the two most significant units — "45s", "12m",
 * "3h 20m", "2d 4h". Used for MetricsSummary.average_recovery_time_seconds,
 * which is null until at least one payment has actually been recovered; null
 * renders as an em dash rather than a misleading "0s".
 */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "—";

  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;

  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const restMinutes = minutes % 60;
    return restMinutes === 0 ? `${hours}h` : `${hours}h ${restMinutes}m`;
  }

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${days}d` : `${days}d ${restHours}h`;
}

/**
 * Gateway failure codes arrive as SCREAMING_SNAKE (e.g. CARD_DECLINED).
 * That's an identifier, not copy — render it as plain sentence case for
 * people, without inventing any wording the backend didn't send.
 */
export function humanizeCode(code: string): string {
  const spaced = code.replace(/_/g, " ").trim().toLowerCase();
  return spaced.length === 0 ? "" : spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
__RECOVERAI_EOF__
echo "  wrote frontend/src/lib/format.ts"

mkdir -p "frontend/src/pages"
cat > "frontend/src/pages/OverviewPage.test.tsx" <<'__RECOVERAI_EOF__'
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

  it("renders real revenue, recovery-rate, and recovery-time figures from the metrics summary", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Revenue Position");

    const revenue = sectionFor("Revenue Position");
    // Each money figure appears twice within this section — once as a
    // headline/stat figure, once again in the proportion-bar legend.
    expect(within(revenue).getAllByText("₹3,75,000")).toHaveLength(2); // revenue_recovered
    expect(within(revenue).getAllByText("₹1,25,000")).toHaveLength(2); // revenue_at_risk
    expect(within(revenue).getByText("60%")).toBeInTheDocument(); // recovery_rate
    expect(within(revenue).getByText("1h")).toBeInTheDocument(); // average_recovery_time_seconds: 3600
  });

  it("renders a dash, not 0s, for average recovery time before anything has been recovered", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue({ ...METRICS, average_recovery_time_seconds: null });
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Revenue Position");

    const revenue = sectionFor("Revenue Position");
    expect(within(revenue).getByText("Average recovery time").parentElement).toHaveTextContent("—");
  });

  it("renders payments analyzed, automatic recoveries and attempt success in Recovery Performance", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Recovery Performance");

    const performance = sectionFor("Recovery Performance");
    expect(within(performance).getByText("40")).toBeInTheDocument(); // payments_analyzed
    expect(within(performance).getByText("18")).toBeInTheDocument(); // automatically_recovered_count
    expect(within(performance).getByText("72%")).toBeInTheDocument(); // recovery_attempt_success_rate
  });

  it("derives the outcome bar's at-risk count from payments_analyzed minus recovered and escalated", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Recovery Performance");
    const performance = sectionFor("Recovery Performance");

    // 40 analyzed - 24 recovered - 4 escalated = 12 still at risk.
    expect(within(performance).getByText("12")).toBeInTheDocument();
    expect(within(performance).getByText("24")).toBeInTheDocument();
    expect(within(performance).getByText("4")).toBeInTheDocument();
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

  it("shows Recent Failed Payments in real arrival order (created_at, as returned by the backend)", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Recent Failed Payments");

    const table = sectionFor("Recent Failed Payments");
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
    await screen.findByText("Recent Failed Payments");

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

  it("shows the gateway's failure message, then the humanized code, then a dash, as the failure reason", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue([
      payment({ id: "p_msg", failure_message: "Issuer declined the card", failure_code: "CARD_DECLINED" }),
      payment({ id: "p_code", failure_message: null, failure_code: "INSUFFICIENT_FUNDS" }),
      payment({ id: "p_none", failure_message: null, failure_code: null }),
    ]);

    renderOverview();
    await screen.findByText("Recent Failed Payments");
    const table = sectionFor("Recent Failed Payments");

    const byId = (id: string) => within(table).getByRole("row", { name: `Open payment ${id}` });
    expect(byId("p_msg")).toHaveTextContent("Issuer declined the card");
    expect(byId("p_code")).toHaveTextContent("Insufficient funds");
    expect(byId("p_none")).not.toHaveTextContent("Insufficient funds");
  });

  it("links Recent Failed Payments to the full Payments list", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Recent Failed Payments");

    const table = sectionFor("Recent Failed Payments");
    expect(within(table).getByRole("link", { name: "View all" })).toHaveAttribute("href", "/app/payments");
  });

  it("shows automation rates from the metrics summary and failure reasons counted from the loaded payments", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue([
      payment({ id: "a", failure_code: "CARD_DECLINED" }),
      payment({ id: "b", failure_code: "CARD_DECLINED" }),
      payment({ id: "c", failure_code: "INSUFFICIENT_FUNDS" }),
    ]);

    renderOverview();
    await screen.findByText("Decision Insights");
    const insights = sectionFor("Decision Insights");

    expect(within(insights).getByText("45%")).toBeInTheDocument(); // automatic_recovery_rate
    expect(within(insights).getByText("10%")).toBeInTheDocument(); // escalation_rate
    expect(within(insights).getByText("3")).toBeInTheDocument(); // failed_or_blocked_intervention_count

    const reasons = within(insights).getAllByRole("listitem");
    expect(reasons[0]).toHaveTextContent("Card declined");
    expect(reasons[0]).toHaveTextContent("2");
    expect(reasons[1]).toHaveTextContent("Insufficient funds");
    // The sample size is stated, so a page of payments is never mistaken for all-time.
    expect(within(insights).getByText("From the latest 3 payments.")).toBeInTheDocument();
  });

  it("states the data window in the page header from the metrics timestamp", async () => {
    vi.mocked(api.getMetricsSummary).mockResolvedValue(METRICS);
    vi.mocked(api.listPayments).mockResolvedValue(PAYMENTS);

    renderOverview();
    await screen.findByText("Revenue Position");

    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText(/Updated/)).toBeInTheDocument();
  });
});
__RECOVERAI_EOF__
echo "  wrote frontend/src/pages/OverviewPage.test.tsx"

mkdir -p "frontend/src/pages"
cat > "frontend/src/pages/OverviewPage.tsx" <<'__RECOVERAI_EOF__'
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
__RECOVERAI_EOF__
echo "  wrote frontend/src/pages/OverviewPage.tsx"

mkdir -p "frontend"
cat > "frontend/tailwind.config.js" <<'__RECOVERAI_EOF__'
/** @type {import('tailwindcss').Config} */

// Every color token resolves through a CSS custom property holding
// space-separated RGB channels (e.g. "11 12 14"), never a literal hex
// string. That's what lets `[data-theme="light"]` in index.css redefine
// the same variable names to different values and have every existing
// `bg-canvas` / `text-text-muted` / etc. utility repaint automatically —
// zero className changes anywhere else in the app. The space-separated
// format (rather than a plain `var(--x)` hex reference) is required for
// Tailwind's opacity modifiers (`bg-danger/10`, `bg-success/15`, …) to
// keep working, since Tailwind needs the raw channels to combine with an
// alpha value at class-generation time — see Tailwind's own "Using CSS
// variables for colors" docs. Full light/dark values live in index.css.
function withOpacity(variableName) {
  return ({ opacityValue }) =>
    opacityValue === undefined ? `rgb(var(${variableName}))` : `rgb(var(${variableName}) / ${opacityValue})`;
}

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // --- RecoverAI Financial Instrumentation color tokens (design system v2) ---
      // Token names are unchanged from Quiet Instrumentation on purpose —
      // this is a value-source change (hex -> theme-aware CSS variable),
      // not a renaming, so no existing component needed to change.
      colors: {
        canvas: withOpacity("--color-canvas"),
        surface: withOpacity("--color-surface"),
        "surface-raised": withOpacity("--color-surface-raised"),
        border: {
          DEFAULT: withOpacity("--color-border"),
          strong: withOpacity("--color-border-strong"),
        },
        text: {
          DEFAULT: withOpacity("--color-text"),
          muted: withOpacity("--color-text-muted"),
          faint: withOpacity("--color-text-faint"),
        },
        accent: {
          DEFAULT: withOpacity("--color-accent"),
        },
        // Text/icon color guaranteed to read correctly on top of a
        // bg-accent fill in either theme (see Button's primary variant).
        // Deliberately its own token rather than reusing `canvas` — the
        // old dark-only build got away with `text-canvas` on `bg-accent`
        // because canvas happened to be near-black, but canvas is the
        // *lightest* neutral in light mode, which would have put
        // near-white text on an amber button. That coupling breaks the
        // moment a second theme exists, so it gets a dedicated token.
        "on-accent": withOpacity("--color-on-accent"),
        success: withOpacity("--color-success"),
        warning: withOpacity("--color-warning"),
        danger: withOpacity("--color-danger"),
        info: withOpacity("--color-info"),
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        hero: ["3rem", { lineHeight: "1.08", letterSpacing: "-0.015em", fontWeight: "600" }],
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
        // Value lives in index.css per theme: a 35%-black shadow reads as
        // heavy smudge on the light workspace, so light mode gets a softer,
        // warm-tinted one. Same utility name, so no call site changes.
        overlay: "var(--shadow-overlay)",
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
__RECOVERAI_EOF__
echo "  wrote frontend/tailwind.config.js"

# Superseded by RecoveryPerformance.tsx / RecentFailedPayments.tsx — nothing imports these any more.
rm -f "frontend/src/components/overview/OutcomeDistribution.tsx" && echo "  removed frontend/src/components/overview/OutcomeDistribution.tsx"
rm -f "frontend/src/components/overview/RecentPayments.tsx" && echo "  removed frontend/src/components/overview/RecentPayments.tsx"
rm -f "frontend/src/components/overview/RecoveryPosture.tsx" && echo "  removed frontend/src/components/overview/RecoveryPosture.tsx"

echo "Done: 19 files overwritten, 3 removed."
