import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import type { HealthResponse } from "../../types/api";

type SystemStatus = "checking" | "operational" | "degraded";

/**
 * Real health/environment signal only — see design spec correction pass,
 * §1/§8. Never a hardcoded "All systems operational"; if either check
 * fails, or hasn't resolved yet, that's what's shown.
 */
export function TopBar() {
  const { user, logout } = useAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>("checking");
  const [providersOpen, setProvidersOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const [healthResult] = await Promise.all([api.getHealth(), api.getHealthDb()]);
        if (cancelled) return;
        setHealth(healthResult);
        setSystemStatus("operational");
      } catch {
        if (!cancelled) setSystemStatus("degraded");
      }
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

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-canvas px-5">
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold tracking-tight md:hidden">
          Recover<span className="text-accent">AI</span>
        </span>

        {health && (
          <div className="relative" ref={popoverRef}>
            <button
              onClick={() => setProvidersOpen((open) => !open)}
              className="focus-ring rounded px-2 py-1 text-label uppercase text-text-muted transition-colors duration-150 hover:text-text"
            >
              {health.environment}
            </button>
            {providersOpen && (
              <div className="absolute left-0 top-full z-10 mt-2 w-56 rounded-lg border border-border bg-surface-raised p-3 shadow-overlay">
                <div className="mb-2 text-label uppercase text-text-faint">Providers</div>
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

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              systemStatus === "operational"
                ? "bg-success"
                : systemStatus === "degraded"
                  ? "bg-danger"
                  : "bg-text-faint"
            }`}
            aria-hidden="true"
          />
          {systemStatus === "checking" ? "Checking…" : systemStatus === "operational" ? "Operational" : "Degraded"}
        </div>

        {user && <span className="hidden text-sm text-text-muted sm:inline">{user.merchant_name}</span>}

        <Link
          to="/app/account"
          className="focus-ring flex h-7 w-7 items-center justify-center rounded bg-surface-raised text-xs font-medium text-text-muted transition-colors duration-150 hover:text-text"
          aria-label="Account"
        >
          {initials}
        </Link>
        <button
          onClick={logout}
          className="focus-ring text-xs text-text-muted transition-colors duration-150 hover:text-text"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
