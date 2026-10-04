import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../lib/api";
import { getToken } from "../lib/auth";
import { PAGE_SIZES } from "../lib/pagination";
import { getDefaultPageSize, setDefaultPageSize } from "../lib/preferences";
import { decodeSession, formatTimeRemaining } from "../lib/session";
import { formatDateTime } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import type { DbHealthResponse, HealthResponse } from "../types/api";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { CopyButton } from "../components/ui/CopyButton";
import { StatusDot } from "../components/ui/StatusDot";
import { Segmented, SettingsRow, SettingsSection } from "../components/account/SettingsSection";

interface CheckResult<T> {
  ok: boolean;
  ms: number;
  data: T | null;
  error: string | null;
}

interface Checks {
  api: CheckResult<HealthResponse>;
  db: CheckResult<DbHealthResponse>;
}

/** Times one real request; the latency shown is the measured round trip, not an estimate. */
async function timed<T>(call: () => Promise<T>): Promise<CheckResult<T>> {
  const started = performance.now();
  try {
    const data = await call();
    return { ok: true, ms: Math.round(performance.now() - started), data, error: null };
  } catch (err) {
    return {
      ok: false,
      ms: Math.round(performance.now() - started),
      data: null,
      error: err instanceof api.ApiError ? err.message : "Could not reach the backend.",
    };
  }
}

/**
 * /app/account — account, workspace and app settings. The API has no per-user
 * settings endpoints, so everything here is either read from real endpoints
 * (profile, health) or stored in this browser (theme, rows per page); the
 * page says which where it matters.
 */
export function AccountPage() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [pageSize, setPageSize] = useState<number>(() => getDefaultPageSize());
  const [checks, setChecks] = useState<Checks | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  // Snapshot at mount: "time remaining" is as of when the page opened.
  const [openedAt] = useState(() => Date.now());
  const seq = useRef(0);

  const runChecks = useCallback(async () => {
    const mine = ++seq.current;
    setChecking(true);
    const [apiResult, dbResult] = await Promise.all([timed(api.getHealth), timed(api.getHealthDb)]);
    if (mine !== seq.current) return;
    setChecks({ api: apiResult, db: dbResult });
    setChecking(false);
  }, []);

  useEffect(() => {
    // Initial health read on mount; setState happens after the awaited requests.
    // oxlint-disable-next-line react/set-state-in-effect
    void runChecks();
  }, [runChecks]);

  if (!user) return null;

  const session = decodeSession(getToken());
  const webhookUrl = `${api.API_BASE_URL.replace(/\/$/, "")}/webhooks/razorpay`;

  function changePageSize(size: number) {
    setPageSize(size);
    setDefaultPageSize(size);
  }

  async function copyDiagnostics() {
    const report = {
      app: "RecoverAI",
      generated_at: new Date().toISOString(),
      api_base_url: api.API_BASE_URL,
      environment: checks?.api.data?.environment ?? null,
      providers: checks?.api.data?.providers ?? null,
      api_status: checks ? (checks.api.ok ? "ok" : (checks.api.error ?? "error")) : null,
      database_status: checks ? (checks.db.ok ? (checks.db.data?.database ?? "ok") : (checks.db.error ?? "error")) : null,
      user_id: user!.user_id,
      merchant_id: user!.merchant_id,
      session_expires_at: session?.expiresAt?.toISOString() ?? null,
      theme,
      default_rows_per_page: pageSize,
      user_agent: navigator.userAgent,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    } catch {
      // clipboard refused: nothing is claimed
    }
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title="Account & settings" description="Your profile, this workspace, and how the app behaves for you." />

      <SettingsSection id="profile" title="Profile" description="Who is signed in.">
        <SettingsRow label="Name">{user.name}</SettingsRow>
        <SettingsRow label="Email">
          <span className="break-all">{user.email}</span>
        </SettingsRow>
        <SettingsRow label="User ID">
          <IdLine value={user.user_id} label="user ID" />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection id="workspace" title="Workspace" description="The merchant this session is scoped to.">
        <SettingsRow label="Merchant">{user.merchant_name}</SettingsRow>
        <SettingsRow label="Merchant ID">
          <IdLine value={user.merchant_id} label="merchant ID" />
        </SettingsRow>
        <SettingsRow
          label="Razorpay webhook URL"
          hint="Add this endpoint in the Razorpay dashboard and subscribe it to the payment.failed event. The signing secret is configured on the server and is never shown here."
        >
          <IdLine value={webhookUrl} label="webhook URL" />
        </SettingsRow>
        <SettingsRow label="Try the pipeline" hint="Send a simulated failure through the same ingestion path.">
          <Link
            to="/app/recovery-lab"
            className="focus-ring rounded font-medium text-accent underline decoration-border-strong underline-offset-4 hover:decoration-accent"
          >
            Open Recovery Lab
          </Link>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection id="preferences" title="Preferences" description="Stored in this browser only.">
        <SettingsRow label="Theme" hint="Applies immediately and is remembered on this device.">
          <Segmented
            label="Theme"
            value={theme}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            onChange={(next) => {
              if (next !== theme) toggleTheme();
            }}
          />
        </SettingsRow>
        <SettingsRow label="Rows per page" hint="The default page size for the Payments table. A size in the URL still wins.">
          <Segmented
            label="Rows per page"
            value={pageSize}
            options={PAGE_SIZES.map((size) => ({ value: size, label: String(size) }))}
            onChange={changePageSize}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection id="system" title="System status" description="Live checks against the backend you are connected to.">
        <SettingsRow label="API">
          <StatusLine
            checking={checking && !checks}
            ok={checks?.api.ok ?? false}
            detail={checks ? (checks.api.ok ? `Reachable · ${checks.api.ms} ms` : (checks.api.error ?? "Unreachable")) : "Checking…"}
          />
        </SettingsRow>
        <SettingsRow label="Database">
          <StatusLine
            checking={checking && !checks}
            ok={checks?.db.ok ?? false}
            detail={checks ? (checks.db.ok ? `Connected · ${checks.db.ms} ms` : (checks.db.error ?? "Unreachable")) : "Checking…"}
          />
        </SettingsRow>
        <SettingsRow label="Environment">
          <span className="font-mono text-[13px]">{checks?.api.data?.environment ?? "—"}</span>
        </SettingsRow>
        <SettingsRow label="Providers" hint="What the backend is configured to use. “mock” means no external calls.">
          <ProviderList providers={checks?.api.data?.providers ?? null} />
        </SettingsRow>
        <SettingsRow label="API base URL">
          <IdLine value={api.API_BASE_URL} label="API base URL" />
        </SettingsRow>
        <div className="flex flex-wrap gap-3 pt-4">
          <Button variant="secondary" onClick={() => void runChecks()} disabled={checking}>
            {checking ? "Checking…" : "Re-run checks"}
          </Button>
          <Button variant="secondary" onClick={() => void copyDiagnostics()}>
            Copy diagnostics
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection id="session" title="Session" description="Your sign-in on this device.">
        <SettingsRow label="Signed in">
          {session?.issuedAt ? formatDateTime(session.issuedAt.toISOString(), { seconds: false }) : "—"}
        </SettingsRow>
        <SettingsRow label="Expires" hint="Read from your access token. The server decides whether it is still valid.">
          {session?.expiresAt ? (
            <>
              {formatDateTime(session.expiresAt.toISOString(), { seconds: false })}
              <span className="ml-2 text-text-muted">({formatTimeRemaining(session.expiresAt, openedAt)})</span>
            </>
          ) : (
            "Unknown"
          )}
        </SettingsRow>
        <div className="pt-4">
          {confirmingLogout ? (
            <div role="alertdialog" aria-label="Confirm sign out" className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-text">Sign out of this device?</span>
              <Button variant="danger" onClick={logout}>
                Sign out
              </Button>
              <Button variant="quiet" onClick={() => setConfirmingLogout(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setConfirmingLogout(true)}>
              Log out
            </Button>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}

function IdLine({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex max-w-full items-start gap-2 sm:justify-end">
      <span className="min-w-0 break-all font-mono text-[13px] leading-5 sm:text-right">{value}</span>
      <CopyButton value={value} label={label} />
    </span>
  );
}

function StatusLine({ checking, ok, detail }: { checking: boolean; ok: boolean; detail: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <StatusDot state={checking ? "checking" : ok ? "ok" : "down"} />
      <span className={ok || checking ? "" : "text-danger"}>{detail}</span>
    </span>
  );
}

function ProviderList({ providers }: { providers: HealthResponse["providers"] | null }) {
  if (!providers) return <span className="text-text-muted">—</span>;
  const rows: [string, string][] = [
    ["AI", providers.ai],
    ["Recovery gateway", providers.recovery_gateway],
    ["Notifications", providers.notifications],
  ];
  return (
    <dl className="space-y-1.5 sm:ml-auto sm:max-w-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4">
          <dt className="text-text-muted">{label}</dt>
          <dd className="font-mono text-[13px]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
