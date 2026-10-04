import type { AIDecisionRead, AuditLogRead, PaymentRead, RecoveryAttemptRead } from "../types/api";

/**
 * Shared builders for the investigation tests. Defaults describe one
 * coherent, fully-recovered payment; each test overrides only what it is
 * about.
 */
export const PAYMENT_ID = "11111111-2222-3333-4444-555555555555";
export const DECISION_ID = "dddddddd-0000-0000-0000-000000000001";
export const ATTEMPT_ID = "aaaaaaaa-0000-0000-0000-000000000001";

export function makePayment(overrides: Partial<PaymentRead> = {}): PaymentRead {
  return {
    id: PAYMENT_ID,
    merchant_id: "m1",
    customer: { id: "c1", name: "Ananya Rao", email: "ananya@example.com", phone: "+919800000001" },
    gateway: "razorpay",
    gateway_payment_id: "pay_Qx7demo0001",
    amount: "12999.00",
    currency: "INR",
    status: "recovered",
    failure_code: "CARD_DECLINED",
    failure_message: "Card declined by issuer",
    original_transaction_at: "2026-10-03T08:59:00Z",
    created_at: "2026-10-03T09:00:00.000Z",
    updated_at: "2026-10-03T09:00:03.000Z",
    ...overrides,
  };
}

export function makeDecision(overrides: Partial<AIDecisionRead> = {}): AIDecisionRead {
  return {
    id: DECISION_ID,
    payment_id: PAYMENT_ID,
    model_name: "openai/gpt-oss-20b",
    failure_category: "CARD_DECLINED",
    root_cause: "Issuer declined the charge, likely a temporary limit.",
    recovery_probability: "0.725",
    recommended_action: "RETRY_PAYMENT",
    confidence: "0.880",
    reason: "Soft decline with a clean history; a fresh attempt is likely to clear.",
    risk_factors: ["first_failure"],
    raw_response: { failure_category: "CARD_DECLINED", confidence: 0.88 },
    created_at: "2026-10-03T09:00:01.000Z",
    ...overrides,
  };
}

export function makeAttempt(overrides: Partial<RecoveryAttemptRead> = {}): RecoveryAttemptRead {
  return {
    id: ATTEMPT_ID,
    payment_id: PAYMENT_ID,
    ai_decision_id: DECISION_ID,
    action_type: "RETRY_PAYMENT",
    attempt_number: 1,
    status: "success",
    policy_decision: "APPROVE",
    policy_reason: "AI recommendation passed all deterministic policy checks and is approved as-is.",
    started_at: "2026-10-03T09:00:02.000Z",
    completed_at: "2026-10-03T09:00:02.800Z",
    result_message: "Payment link created: https://rzp.io/i/AbC123",
    external_reference: "plink_Qx7ABC",
    error_message: null,
    created_at: "2026-10-03T09:00:01.500Z",
    ...overrides,
  };
}

export function makeAudit(overrides: Partial<AuditLogRead> = {}): AuditLogRead {
  return {
    id: "audit-1",
    entity_type: "Payment",
    entity_id: PAYMENT_ID,
    action: "payment_failed_recorded",
    actor: "system",
    details: { message: "Payment recorded as failed" },
    created_at: "2026-10-03T09:00:00.100Z",
    ...overrides,
  };
}
