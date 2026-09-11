"""
Deterministic policy engine — Phase 4.

Kept as a flat top-level module (matching enums.py / exceptions.py /
config.py / database.py) rather than nested under `services/`, on
purpose: everything in `services/` takes a `Session` and does real
database work. `PolicyEngine` deliberately does neither. It is a pure
function from `PolicyEvaluationInput` to `PolicyDecision` — no DB session,
no network call, no clock read it didn't receive as an argument, no
mutation of anything outside itself. That's what "independently
testable" means in the Phase 4 brief: every test in
tests/test_policy_engine.py constructs an input, calls `evaluate()`, and
asserts on the output. No fixtures, no Postgres, no FastAPI TestClient.

    AI Recommendation (AIDecision, already persisted)
            |
            v
    PolicyEvaluationInput   <-  assembled by whatever calls this (a test
            |                    today; a thin orchestrating service once
            v                    Phase 5's executor exists to act on it)
    PolicyEngine.evaluate()
            |
            v
    PolicyDecision  { APPROVE | MODIFY | REJECT | ESCALATE, final_action, ... }

THE POLICY ENGINE IS AUTHORITATIVE. An AIDecision's recommended_action is
always just that — a recommendation. Nothing downstream may act on it
directly; only `PolicyDecision.final_action` from an engine evaluation is
allowed to reach an executor (Phase 5).

Rule evaluation order (fixed, first match wins)
------------------------------------------------
Rules are checked in a strict priority order and the engine returns as
soon as one fires. This is a deliberate simplicity choice over trying to
merge outcomes from multiple simultaneously-true conditions: every
`PolicyDecision` this engine produces is traceable to exactly one
`violated_rules` entry, which is what makes it possible to look at a
decision and say, unambiguously, why it happened. The order itself is a
safety ordering — hard stops before soft downgrades before the confidence
gate:

 1. UNSUPPORTED_ACTION              -> REJECT   / ESCALATE_TO_MERCHANT
 2. FRAUD_SUSPECTED_BLOCK           -> REJECT   / NO_ACTION
 3. AUTO_RECOVERY_DISABLED          -> MODIFY   / NO_ACTION
 4. REPEATED_FAILURES_THRESHOLD     -> ESCALATE / ESCALATE_TO_MERCHANT
 5. MAX_RETRY_COUNT_EXCEEDED        -> REJECT   / ESCALATE_TO_MERCHANT
 6. RETRY_DELAY_NOT_ELAPSED         -> MODIFY   / NO_ACTION
 7. HIGH_VALUE_AUTO_RETRY_DISALLOWED -> MODIFY  / SEND_PAYMENT_LINK
 8. LOW_AI_CONFIDENCE               -> ESCALATE / ESCALATE_TO_MERCHANT
 9. (nothing fired)                 -> APPROVE  / recommended_action

Every threshold used above (max_retry_count, retry_delay_minutes,
high_risk_amount_threshold, escalation_failure_threshold,
auto_recovery_enabled) comes from `PolicyEvaluationInput.merchant_policy`
— never hardcoded — which is what makes "merchant-specific limits" a
property of every rule rather than a separate rule of its own.
"""
from datetime import timedelta

from app.enums import FailureCategory, RecoveryActionType
from app.schemas.policy import PolicyDecision, PolicyDecisionType, PolicyEvaluationInput

ENGINE_VERSION = "policy-engine-v1"

# Stricter than AI_MIN_CONFIDENCE_THRESHOLD (0.4, Phase 3's config.py) on
# purpose. That earlier threshold only decides whether AIDecisionService
# trusts the LLM enough to persist its recommendation at all instead of a
# deterministic fallback. This one decides whether the policy engine
# trusts a *validly persisted* recommendation enough to let it execute
# autonomously. A confidence of, say, 0.5 clears the first bar (a real
# AIDecision gets created) but shouldn't clear the second (no autonomous
# action) — two independent, intentionally different safety gates.
MIN_CONFIDENCE_FOR_AUTO_APPROVAL = 0.60


class PolicyEngine:
    """Deterministic, pure, side-effect-free. See module docstring."""

    def __init__(self, min_confidence_for_auto_approval: float = MIN_CONFIDENCE_FOR_AUTO_APPROVAL):
        # Constructor parameter rather than a read from app.config.get_settings()
        # so the engine never reaches outside the arguments it's given —
        # tests can exercise any threshold directly without touching
        # environment variables, and nothing here depends on Settings
        # having been loaded at all.
        self.min_confidence_for_auto_approval = min_confidence_for_auto_approval

    def evaluate(self, input: PolicyEvaluationInput) -> PolicyDecision:
        parsed_action = self._parse_action(input.recommended_action)
        if parsed_action is None:
            return self._decide(
                input,
                decision=PolicyDecisionType.REJECT,
                final_action=RecoveryActionType.ESCALATE_TO_MERCHANT,
                reason=(
                    f"AI recommended an unsupported action '{input.recommended_action}', "
                    "which is not one of the five supported recovery actions."
                ),
                rule="UNSUPPORTED_ACTION",
            )

        if self._is_fraud_suspected(input.failure_category):
            return self._decide(
                input,
                decision=PolicyDecisionType.REJECT,
                final_action=RecoveryActionType.NO_ACTION,
                reason=(
                    "Failure category is FRAUD_SUSPECTED; all automated recovery actions "
                    "(including auto-escalation) are blocked pending manual fraud review."
                ),
                rule="FRAUD_SUSPECTED_BLOCK",
            )

        if not input.merchant_policy.auto_recovery_enabled and parsed_action not in (
            RecoveryActionType.ESCALATE_TO_MERCHANT,
            RecoveryActionType.NO_ACTION,
        ):
            return self._decide(
                input,
                decision=PolicyDecisionType.MODIFY,
                final_action=RecoveryActionType.NO_ACTION,
                reason=(
                    f"Automatic recovery is disabled for merchant '{input.merchant_policy.merchant_id}'; "
                    f"AI-recommended action '{parsed_action.value}' was suppressed."
                ),
                rule="AUTO_RECOVERY_DISABLED",
            )

        if (
            input.retry_history.failed_attempt_count
            >= input.merchant_policy.escalation_failure_threshold
            and parsed_action != RecoveryActionType.ESCALATE_TO_MERCHANT
        ):
            return self._decide(
                input,
                decision=PolicyDecisionType.ESCALATE,
                final_action=RecoveryActionType.ESCALATE_TO_MERCHANT,
                reason=(
                    f"{input.retry_history.failed_attempt_count} prior failed recovery attempt(s) "
                    f"meets or exceeds this merchant's escalation threshold of "
                    f"{input.merchant_policy.escalation_failure_threshold}; forcing escalation "
                    f"regardless of the AI's recommended '{parsed_action.value}'."
                ),
                rule="REPEATED_FAILURES_THRESHOLD",
                metadata={
                    "failed_attempt_count": input.retry_history.failed_attempt_count,
                    "escalation_failure_threshold": input.merchant_policy.escalation_failure_threshold,
                },
            )

        if (
            parsed_action == RecoveryActionType.RETRY_PAYMENT
            and input.retry_history.retry_attempt_count >= input.merchant_policy.max_retry_count
        ):
            return self._decide(
                input,
                decision=PolicyDecisionType.REJECT,
                final_action=RecoveryActionType.ESCALATE_TO_MERCHANT,
                reason=(
                    f"Retry count {input.retry_history.retry_attempt_count} has reached this "
                    f"merchant's maximum of {input.merchant_policy.max_retry_count}; further "
                    "automatic retries are rejected and the case is escalated."
                ),
                rule="MAX_RETRY_COUNT_EXCEEDED",
                metadata={
                    "retry_attempt_count": input.retry_history.retry_attempt_count,
                    "max_retry_count": input.merchant_policy.max_retry_count,
                },
            )

        if parsed_action == RecoveryActionType.RETRY_PAYMENT and self._retry_too_soon(input):
            retry_available_at = input.retry_history.last_retry_attempted_at + timedelta(
                minutes=input.merchant_policy.retry_delay_minutes
            )
            return self._decide(
                input,
                decision=PolicyDecisionType.MODIFY,
                final_action=RecoveryActionType.NO_ACTION,
                reason=(
                    f"Last retry attempt was at {input.retry_history.last_retry_attempted_at.isoformat()}; "
                    f"this merchant's retry delay is {input.merchant_policy.retry_delay_minutes} minute(s), "
                    "so retrying now is disallowed. No action will be taken until the delay elapses."
                ),
                rule="RETRY_DELAY_NOT_ELAPSED",
                metadata={
                    "last_retry_attempted_at": input.retry_history.last_retry_attempted_at.isoformat(),
                    "retry_delay_minutes": input.merchant_policy.retry_delay_minutes,
                    "retry_available_at": retry_available_at.isoformat(),
                },
            )

        if (
            parsed_action == RecoveryActionType.RETRY_PAYMENT
            and input.payment_amount > input.merchant_policy.high_risk_amount_threshold
        ):
            return self._decide(
                input,
                decision=PolicyDecisionType.MODIFY,
                final_action=RecoveryActionType.SEND_PAYMENT_LINK,
                reason=(
                    f"Payment amount {input.payment_amount} {input.currency} exceeds this merchant's "
                    f"high-risk threshold of {input.merchant_policy.high_risk_amount_threshold} "
                    f"{input.currency}; a silent auto-retry is disallowed for high-value transactions. "
                    "Downgraded to sending the customer a payment link requiring explicit confirmation."
                ),
                rule="HIGH_VALUE_AUTO_RETRY_DISALLOWED",
                metadata={
                    "payment_amount": str(input.payment_amount),
                    "high_risk_amount_threshold": str(input.merchant_policy.high_risk_amount_threshold),
                },
            )

        if (
            input.ai_confidence < self.min_confidence_for_auto_approval
            and parsed_action != RecoveryActionType.ESCALATE_TO_MERCHANT
        ):
            return self._decide(
                input,
                decision=PolicyDecisionType.ESCALATE,
                final_action=RecoveryActionType.ESCALATE_TO_MERCHANT,
                reason=(
                    f"AI confidence {input.ai_confidence:.2f} is below the policy threshold of "
                    f"{self.min_confidence_for_auto_approval:.2f} required for autonomous action; "
                    "escalating for human review instead."
                ),
                rule="LOW_AI_CONFIDENCE",
                metadata={
                    "ai_confidence": input.ai_confidence,
                    "min_confidence_for_auto_approval": self.min_confidence_for_auto_approval,
                },
            )

        return self._decide(
            input,
            decision=PolicyDecisionType.APPROVE,
            final_action=parsed_action,
            reason="AI recommendation passed all deterministic policy checks and is approved as-is.",
            rule=None,
        )

    @staticmethod
    def _parse_action(raw: str) -> RecoveryActionType | None:
        try:
            return RecoveryActionType(raw)
        except ValueError:
            return None

    @staticmethod
    def _is_fraud_suspected(raw_failure_category: str) -> bool:
        try:
            return FailureCategory(raw_failure_category) == FailureCategory.FRAUD_SUSPECTED
        except ValueError:
            # An unrecognized failure_category can't be confirmed as fraud;
            # fail open on THIS rule specifically (other rules still apply
            # normally). There is currently no separate "unsupported
            # failure category" rule requested for Phase 4.
            return False

    @staticmethod
    def _retry_too_soon(input: PolicyEvaluationInput) -> bool:
        last_attempt = input.retry_history.last_retry_attempted_at
        if last_attempt is None:
            return False
        delay = timedelta(minutes=input.merchant_policy.retry_delay_minutes)
        return input.evaluated_at < last_attempt + delay

    def _decide(
        self,
        input: PolicyEvaluationInput,
        *,
        decision: PolicyDecisionType,
        final_action: RecoveryActionType,
        reason: str,
        rule: str | None,
        metadata: dict | None = None,
    ) -> PolicyDecision:
        approval_metadata = {
            "engine_version": ENGINE_VERSION,
            "merchant_id": input.merchant_policy.merchant_id,
            **(metadata or {}),
        }
        return PolicyDecision(
            decision=decision,
            final_action=final_action,
            reason=reason,
            violated_rules=[rule] if rule else [],
            ai_recommended_action=input.recommended_action,
            ai_confidence=input.ai_confidence,
            approval_metadata=approval_metadata,
            evaluated_at=input.evaluated_at,
        )
