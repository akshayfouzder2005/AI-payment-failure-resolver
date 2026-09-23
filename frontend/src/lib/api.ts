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
