"""
Deterministic mock LLM provider — Phase 3.

Lets the entire diagnosis pipeline (context building, schema validation,
persistence, audit) be exercised and demoed through the exact same
AIDecisionService code path as a real Claude call, without any API key.
This is what `app.integrations.llm_provider.factory.get_llm_provider()`
returns by default (`AI_PROVIDER=mock`), matching MockAdapter's role for
the payment-provider side in Phase 2.

Unlike a purely random mock, this applies small, explainable rules
(failure message keywords, amount vs. merchant's high-risk threshold,
repeat-failure count) so demo output looks like a plausible diagnosis
rather than noise — while staying 100% deterministic and free.

`force_mode` exists purely for tests/demos that need to exercise
AIDecisionService's fallback branches on demand:
- "error"          -> raises LLMProviderError, simulating an outage
- "malformed"      -> returns JSON that fails AIDecisionOutput validation
- "low_confidence" -> returns valid JSON with confidence below threshold
- None (default)   -> normal rule-based decision
"""
from typing import Literal

from app.enums import FailureCategory, RecoveryActionType
from app.exceptions import LLMProviderError
from app.integrations.llm_provider.base import LLMDecisionResult, LLMProvider, PaymentContext

ForceMode = Literal["error", "malformed", "low_confidence"]

MODEL_NAME = "mock-llm-v1"


class MockLLMProvider(LLMProvider):
    def __init__(self, force_mode: ForceMode | None = None):
        self.force_mode = force_mode

    def generate_decision(self, context: PaymentContext) -> LLMDecisionResult:
        if self.force_mode == "error":
            raise LLMProviderError("Simulated LLM provider outage (force_mode='error')")

        if self.force_mode == "malformed":
            # Valid JSON, but shaped nothing like AIDecisionOutput — the
            # kind of thing AIDecisionService must catch via Pydantic
            # validation, not trust.
            return LLMDecisionResult(
                model_name=MODEL_NAME,
                raw_output={"recommended_action": "REFUND_EVERYTHING", "confidence": "very sure"},
            )

        category, base_probability, base_action, root_cause = self._classify(context)

        risk_factors: list[str] = []
        probability = base_probability
        recommended_action = base_action

        if context.payment.amount > context.merchant_policy.high_risk_amount_threshold:
            risk_factors.append("high_transaction_amount")
            probability -= 0.15

        prior_failures = context.customer_history.previous_failure_count_excluding_current
        if prior_failures >= context.merchant_policy.escalation_failure_threshold:
            risk_factors.append("repeated_failures_for_customer")
            probability -= 0.20
            recommended_action = RecoveryActionType.ESCALATE_TO_MERCHANT

        if not context.customer.is_known_customer:
            risk_factors.append("unknown_customer_identity")

        probability = round(max(0.05, min(0.95, probability)), 2)
        confidence = 0.15 if self.force_mode == "low_confidence" else 0.85

        raw_output = {
            "failure_category": category.value,
            "root_cause": root_cause,
            "recovery_probability": probability,
            "recommended_action": recommended_action.value,
            "confidence": confidence,
            "reason": (
                f"Deterministic mock classification from failure signal "
                f"'{context.payment.failure_code or context.payment.failure_message or 'unknown'}'; "
                f"{len(risk_factors)} risk factor(s) detected."
            ),
            "risk_factors": risk_factors,
        }
        return LLMDecisionResult(model_name=MODEL_NAME, raw_output=raw_output)

    @staticmethod
    def _classify(
        context: PaymentContext,
    ) -> tuple[FailureCategory, float, RecoveryActionType, str]:
        code = (context.payment.failure_code or "").upper()
        message = (context.payment.failure_message or "").lower()

        if "insufficient" in message:
            return (
                FailureCategory.INSUFFICIENT_FUNDS,
                0.55,
                RecoveryActionType.RETRY_PAYMENT,
                "Customer's account likely had insufficient balance at the time of the charge; "
                "often resolved by the time of a retry.",
            )
        if "expired" in message:
            return (
                FailureCategory.EXPIRED_CARD,
                0.20,
                RecoveryActionType.SEND_PAYMENT_LINK,
                "The card on file has expired; a blind retry cannot succeed without new card details.",
            )
        if "declined" in message:
            return (
                FailureCategory.CARD_DECLINED,
                0.35,
                RecoveryActionType.SEND_PAYMENT_LINK,
                "The issuing bank declined the charge; likely needs a different payment method.",
            )
        if code == "GATEWAY_ERROR":
            return (
                FailureCategory.NETWORK_OR_GATEWAY_ERROR,
                0.70,
                RecoveryActionType.RETRY_PAYMENT,
                "Failure pattern is consistent with a transient gateway/network issue rather than "
                "a customer-side problem.",
            )
        return (
            FailureCategory.UNKNOWN,
            0.40,
            RecoveryActionType.SEND_NOTIFICATION,
            "Failure reason did not clearly match a known pattern; a soft nudge is a low-risk default.",
        )
