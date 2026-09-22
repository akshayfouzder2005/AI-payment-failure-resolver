/**
 * Every type in this file mirrors a real backend enum or Pydantic schema —
 * see app/enums.py and app/schemas/*.py in the backend repo. Nothing here
 * is invented; if the backend doesn't return a field, it isn't listed here.
 */

// --- app/enums.py ---

export type RecoveryActionType =
  | "RETRY_PAYMENT"
  | "SEND_PAYMENT_LINK"
  | "SEND_NOTIFICATION"
  | "ESCALATE_TO_MERCHANT"
  | "NO_ACTION";

export type FailureCategory =
  | "INSUFFICIENT_FUNDS"
  | "CARD_DECLINED"
  | "EXPIRED_CARD"
  | "BANK_OR_ISSUER_ERROR"
  | "NETWORK_OR_GATEWAY_ERROR"
  | "FRAUD_SUSPECTED"
  | "CUSTOMER_ABANDONED"
  | "UNKNOWN";

export type RecoveryAttemptStatus = "pending" | "in_progress" | "success" | "failed" | "skipped";

export type PolicyDecisionType = "APPROVE" | "MODIFY" | "REJECT" | "ESCALATE";

// --- app/schemas/auth.py ---

export interface UserRead {
  id: string;
  name: string;
  email: string;
  merchant_id: string;
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: UserRead;
}

export interface MeResponse {
  user_id: string;
  name: string;
  email: string;
  merchant_id: string;
  merchant_name: string;
}

// --- app/schemas/payment.py ---

export interface CustomerSummary {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface PaymentRead {
  id: string;
  merchant_id: string;
  customer: CustomerSummary | null;
  gateway: string;
  gateway_payment_id: string;
  amount: string; // Decimal, serialized as string
  currency: string;
  status: string;
  failure_code: string | null;
  failure_message: string | null;
  original_transaction_at: string | null;
  created_at: string;
  updated_at: string;
}

// --- app/schemas/ai_decision.py ---

export interface AIDecisionRead {
  id: string;
  payment_id: string;
  model_name: string;
  failure_category: string | null;
  root_cause: string | null;
  recovery_probability: string | null; // Decimal, serialized as string
  recommended_action: string | null;
  confidence: string | null; // Decimal, serialized as string
  reason: string | null;
  risk_factors: string[] | null;
  raw_response: Record<string, unknown> | null;
  created_at: string;
}

// --- app/schemas/recovery.py ---

export interface RecoveryAttemptRead {
  id: string;
  payment_id: string;
  ai_decision_id: string | null;
  action_type: string;
  attempt_number: number;
  status: string;
  policy_decision: string | null;
  policy_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
  result_message: string | null;
  external_reference: string | null;
  error_message: string | null;
  created_at: string;
}

export interface RecoveryExecutionResult {
  payment_id: string;
  ai_decision_id: string;
  policy_decision: string;
  policy_reason: string;
  violated_rules: string[];
  recovery_attempt: RecoveryAttemptRead;
  idempotent_replay: boolean;
}

// --- app/schemas/audit.py ---

export interface AuditLogRead {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

// --- app/schemas/metrics.py ---

export interface MetricsSummary {
  merchant_id: string | null;
  payments_analyzed: number;
  revenue_at_risk: string; // Decimal, serialized as string
  revenue_recovered: string; // Decimal, serialized as string
  recovered_count: number;
  escalated_count: number;
  automatically_recovered_count: number;
  recovery_rate: number;
  automatic_recovery_rate: number;
  escalation_rate: number;
  recovery_attempt_success_rate: number;
  average_recovery_time_seconds: number | null;
  failed_or_blocked_intervention_count: number;
  generated_at: string;
}

// --- app/schemas/webhook.py ---

export interface SimulateFailedPaymentRequest {
  amount?: string;
  customer_email?: string;
  customer_name?: string;
  customer_phone?: string;
  failure_code?: string;
  failure_message?: string;
  merchant_id?: string;
}

export interface WebhookIngestResult {
  status: "processed" | "duplicate" | "ignored" | "processing_failed";
  payment_event_id: string;
  payment_id: string | null;
  merchant_id: string | null;
  payment_status: string | null;
  payment_summary: Record<string, unknown> | null;
  detail: string | null;
}

// --- app/api/routes/health.py (extended in the frontend phase — see backend delta) ---

export interface HealthResponse {
  status: string;
  environment: string;
  providers: {
    ai: string;
    recovery_gateway: string;
    notifications: string;
  };
}

export interface DbHealthResponse {
  status: string;
  database: string;
}
