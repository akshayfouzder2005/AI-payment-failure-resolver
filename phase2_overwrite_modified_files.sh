#!/usr/bin/env bash
# RecoverAI frontend — Phase 2 audit pass (Get Started / Login / Register / auth state)
# Run from the repository root, AFTER phase1_overwrite_modified_files.sh.
# 3 overwrites, no new files, no deletions.
set -euo pipefail

FRONTEND_DIR="frontend"

if [ ! -d "$FRONTEND_DIR" ]; then
  echo "Error: run this from the repo root (frontend/ not found here)." >&2
  exit 1
fi

echo "Writing src/lib/api.ts (adds central 401 handling)..."
cat > "$FRONTEND_DIR/src/lib/api.ts" << 'EOF'
import { clearToken, getToken } from "./auth";
import type {
  AIDecisionRead,
  AuditLogRead,
  DbHealthResponse,
  HealthResponse,
  MeResponse,
  MetricsSummary,
  PaymentRead,
  RecoveryAttemptRead,
  RecoveryExecutionResult,
  SimulateFailedPaymentRequest,
  TokenResponse,
  WebhookIngestResult,
} from "../types/api";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

/**
 * Pulls a human-readable message out of a FastAPI error response. Never
 * invents a message the backend didn't send — falls back to the HTTP
 * status text only when the body genuinely has nothing usable.
 */
function extractErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      // FastAPI/Pydantic 422 validation errors: a list of {loc, msg, type}
      return detail
        .map((d) => (d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : String(d)))
        .join("; ");
    }
  }
  return `Request failed with status ${status}`;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  auth?: boolean; // defaults to true — every real route except register/login/simulate/health requires it
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, auth = true } = options;

  const url = new URL(BASE_URL + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Could not reach the backend. Is it running?");
  }

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!response.ok) {
    // Central 401 handling: an authenticated request that comes back 401 means
    // the stored token is dead (expired/revoked), not that this one call failed.
    // Clear it and tell the rest of the app so a stale session never lingers as
    // a half-authenticated shell. Login/register calls are unauthenticated
    // requests (auth: false) and never reach this branch — a wrong password is
    // not a session-expiry event.
    if (response.status === 401 && auth) {
      clearToken();
      window.dispatchEvent(new Event("recoverai:unauthorized"));
    }
    throw new ApiError(response.status, extractErrorMessage(response.status, parsed));
  }

  return parsed as T;
}

// --- auth ---

export function register(payload: {
  name: string;
  email: string;
  password: string;
  merchant_name: string;
}): Promise<TokenResponse> {
  return request<TokenResponse>("/auth/register", { method: "POST", body: payload, auth: false });
}

export function login(payload: { email: string; password: string }): Promise<TokenResponse> {
  return request<TokenResponse>("/auth/login", { method: "POST", body: payload, auth: false });
}

export function getMe(): Promise<MeResponse> {
  return request<MeResponse>("/auth/me");
}

// --- payments ---

export function listPayments(params: { status?: string; limit?: number; offset?: number } = {}): Promise<
  PaymentRead[]
> {
  return request<PaymentRead[]>("/payments", { query: params });
}

export function getPayment(paymentId: string): Promise<PaymentRead> {
  return request<PaymentRead>(`/payments/${paymentId}`);
}

// --- AI decisions ---

export function diagnosePayment(paymentId: string): Promise<AIDecisionRead> {
  return request<AIDecisionRead>(`/ai-decisions/diagnose/${paymentId}`, { method: "POST" });
}

export function listAIDecisions(paymentId: string): Promise<AIDecisionRead[]> {
  return request<AIDecisionRead[]>(`/ai-decisions/payment/${paymentId}`);
}

// --- recovery ---

export function executeRecovery(
  paymentId: string,
  aiDecisionId?: string,
): Promise<RecoveryExecutionResult> {
  return request<RecoveryExecutionResult>(`/recovery/execute/${paymentId}`, {
    method: "POST",
    query: { ai_decision_id: aiDecisionId },
  });
}

export function listRecoveryAttempts(paymentId: string): Promise<RecoveryAttemptRead[]> {
  return request<RecoveryAttemptRead[]>(`/recovery/payment/${paymentId}`);
}

// --- metrics ---

export function getMetricsSummary(): Promise<MetricsSummary> {
  return request<MetricsSummary>("/metrics/summary");
}

// --- audit ---

export function getPaymentAuditTimeline(paymentId: string): Promise<AuditLogRead[]> {
  return request<AuditLogRead[]>(`/audit/payment/${paymentId}`);
}

// --- simulation (unauthenticated by design — see backend simulate.py) ---

export function simulateFailedPayment(
  overrides: SimulateFailedPaymentRequest = {},
): Promise<WebhookIngestResult> {
  return request<WebhookIngestResult>("/simulate/failed-payment", {
    method: "POST",
    body: overrides,
    auth: false,
  });
}

// --- health ---

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health", { auth: false });
}

export function getHealthDb(): Promise<DbHealthResponse> {
  return request<DbHealthResponse>("/health/db", { auth: false });
}
EOF

echo "Writing src/context/AuthContext.tsx (401 listener + lint fixes)..."
cat > "$FRONTEND_DIR/src/context/AuthContext.tsx" << 'EOF'
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as api from "../lib/api";
import { clearToken, getToken, setToken } from "../lib/auth";
import type { MeResponse } from "../types/api";

interface AuthContextValue {
  user: MeResponse | null;
  status: "loading" | "authenticated" | "unauthenticated";
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (fields: { name: string; email: string; password: string; merchant_name: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");
  const [error, setError] = useState<string | null>(null);

  // On load: if a token is already stored, prove it still works against the
  // real backend rather than assuming it's valid — an expired/invalid token
  // must fall back to logged-out, not a broken authenticated shell. This
  // effect's only job is resolving that initial "loading" state, so the
  // setState calls below are its entire purpose, not a side effect of one.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      // oxlint-disable-next-line react/set-state-in-effect
      setStatus("unauthenticated");
      return;
    }
    api
      .getMe()
      .then((me) => {
        setUser(me);
        setStatus("authenticated");
      })
      .catch(() => {
        clearToken();
        setStatus("unauthenticated");
      });
  }, []);

  // Central 401 handling (lib/api.ts): any authenticated request that comes
  // back 401 clears the token and fires this event so the app state and the
  // stored token never disagree, wherever in the app the call happened.
  useEffect(() => {
    function handleUnauthorized() {
      setUser(null);
      setStatus("unauthenticated");
    }
    window.addEventListener("recoverai:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("recoverai:unauthorized", handleUnauthorized);
  }, []);

  async function login(email: string, password: string) {
    setError(null);
    try {
      const result = await api.login({ email, password });
      setToken(result.access_token);
      const me = await api.getMe();
      setUser(me);
      setStatus("authenticated");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Login failed.");
      throw err;
    }
  }

  async function register(fields: { name: string; email: string; password: string; merchant_name: string }) {
    setError(null);
    try {
      const result = await api.register(fields);
      setToken(result.access_token);
      const me = await api.getMe();
      setUser(me);
      setStatus("authenticated");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Registration failed.");
      throw err;
    }
  }

  function logout() {
    clearToken();
    setUser(null);
    setStatus("unauthenticated");
  }

  return (
    <AuthContext.Provider value={{ user, status, error, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// The hook and its provider are one unit; splitting into a second file for
// fast-refresh only buys nothing at this project's size.
// oxlint-disable-next-line react/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
EOF

echo "Writing src/pages/GetStartedPage.tsx (removes dead links, fixes How It Works + mono misuse)..."
cat > "$FRONTEND_DIR/src/pages/GetStartedPage.tsx" << 'EOF'
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";

const CHAIN_STEPS = ["Payment failed", "AI diagnosis", "Policy gate", "Recovery action", "Audited result"];

const HOW_IT_WORKS = [
  "An AI model recommends a recovery action.",
  "A deterministic policy engine — not the AI — decides whether that action is actually allowed.",
  "Only an approved action is ever executed. The AI never moves money directly.",
];

export function GetStartedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-16 text-text">
      <div className="w-full max-w-2xl">
        <div className="mb-1 text-sm font-semibold tracking-tight">
          Recover<span className="text-accent">AI</span>
        </div>

        <h1 className="mt-6 text-heading">Recover failed payments through an explainable AI decision pipeline.</h1>
        <p className="mt-3 text-sm leading-relaxed text-text-muted">
          RecoverAI diagnoses payment failures, applies deterministic recovery policy, executes bounded actions,
          and records the complete decision trail.
        </p>

        <div className="my-8 flex flex-wrap items-center gap-x-2 gap-y-2">
          {CHAIN_STEPS.map((step, i) => (
            <span key={step} className="flex items-center gap-2">
              <span className="rounded border border-border px-2 py-1 text-label uppercase text-text-muted">
                {step}
              </span>
              {i < CHAIN_STEPS.length - 1 && <span className="text-text-faint">→</span>}
            </span>
          ))}
        </div>

        <div className="flex gap-3">
          <Link to="/register">
            <Button variant="primary">Register</Button>
          </Link>
          <Link to="/login">
            <Button variant="secondary">Log in</Button>
          </Link>
        </div>

        <div className="mt-12 space-y-6 border-t border-border pt-8 text-sm text-text-muted">
          <div>
            <h2 className="mb-2 text-subhead text-text">How it works</h2>
            <ol className="space-y-1.5">
              {HOW_IT_WORKS.map((point, i) => (
                <li key={point} className="flex gap-3">
                  <span className="text-text-faint">{i + 1}.</span>
                  <span>{point}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h2 className="mb-1 text-subhead text-text">Run a local demo</h2>
            <p>
              The repository ships in Local Demo Mode — mock AI and mock gateway/notification providers — so
              the entire pipeline runs with zero external credentials. Register, open the Recovery Lab, and
              generate a simulated failed payment.
            </p>
          </div>
          <div>
            <h2 className="mb-1 text-subhead text-text">Auditability</h2>
            <p>
              Every AI decision, policy verdict, and recovery attempt is permanently recorded and independently
              viewable.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
EOF

echo "Done. Verify with:"
echo "  cd frontend && npm install && npm run lint && npm run build"
