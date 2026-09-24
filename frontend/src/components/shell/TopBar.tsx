import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
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
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-canvas px-5 md:px-8">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="focus-ring -ml-1 rounded p-1 text-text-muted hover:text-text md:hidden"
        >
          <span className="block h-2.5 w-4 border-y border-current" aria-hidden="true" />
        </button>

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
        {!bothResolved || bothOk ? (
          <div className="flex items-center gap-1.5 text-body-small text-text-muted">
            <StatusDot state={!bothResolved ? "checking" : "ok"} />
            {!bothResolved ? "Checking…" : "Operational"}
          </div>
        ) : (
          <div className="flex items-center gap-3 text-body-small text-text-muted">
            <span className="flex items-center gap-1.5">
              <StatusDot state={apiState} />
              API
            </span>
            <span className="flex items-center gap-1.5">
              <StatusDot state={dbState} />
              DB
            </span>
          </div>
        )}

        {user && (
          <>
            <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
            <span className="hidden text-sm text-text-muted sm:inline">{user.merchant_name}</span>
          </>
        )}

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
