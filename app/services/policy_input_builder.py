"""
PolicyInputBuilder — Phase 5.

The connective piece Phase 4 deliberately deferred (see PHASE_4_NOTES.md):
`PolicyEngine.evaluate()` has existed since Phase 4, but nothing built a
real `PolicyEvaluationInput` for it — every test constructed one by hand,
and `RetryHistory` defaulted to all zeros because no `RecoveryAttempt`
rows existed yet.

Plays the same role for the policy engine that `ContextBuilder` (Phase 3)
plays for the LLM: assembles the schema a pure, no-I/O component needs
from Payment / AIDecision / MerchantSettings / RecoveryAttempt rows. Kept
as its own class (not folded into RecoveryExecutionService) for the same
reason ContextBuilder is separate from AIDecisionService — single
responsibility, and it's independently testable against real DB rows
without needing a policy engine or an executor in the loop at all.
"""
import uuid

from sqlalchemy.orm import Session

from app.enums import RecoveryActionType, RecoveryAttemptStatus
from app.exceptions import PaymentNotFoundError
from app.models.ai_decision import AIDecision
from app.models.payment import Payment
from app.repositories.merchant_settings_repository import MerchantSettingsRepository
from app.repositories.recovery_attempt_repository import RecoveryAttemptRepository
from app.schemas.policy import MerchantPolicyLimits, PolicyEvaluationInput, RetryHistory


class PolicyInputBuilder:
    def __init__(self, db: Session):
        self.db = db
        self.merchant_repo = MerchantSettingsRepository(db)
        self.recovery_attempt_repo = RecoveryAttemptRepository(db)

    def build(self, payment: Payment, ai_decision: AIDecision) -> PolicyEvaluationInput:
        merchant = self.merchant_repo.get_by_merchant_id(payment.merchant_id)
        if merchant is None:
            # Shouldn't happen in practice — Payment.merchant_id is a real
            # FK to merchant_settings — but fail loudly rather than
            # evaluating policy against limits that don't exist.
            raise PaymentNotFoundError(
                f"Payment {payment.id} references merchant_id={payment.merchant_id!r}, "
                "which has no MerchantSettings row."
            )

        return PolicyEvaluationInput(
            payment_id=payment.id,
            payment_amount=payment.amount,
            currency=payment.currency,
            failure_category=ai_decision.failure_category or "UNKNOWN",
            recommended_action=ai_decision.recommended_action or RecoveryActionType.NO_ACTION.value,
            ai_confidence=float(ai_decision.confidence or 0.0),
            ai_recovery_probability=float(ai_decision.recovery_probability or 0.0),
            retry_history=self._build_retry_history(payment.id),
            merchant_policy=MerchantPolicyLimits(
                merchant_id=merchant.merchant_id,
                max_retry_count=merchant.max_retry_count,
                retry_delay_minutes=merchant.retry_delay_minutes,
                high_risk_amount_threshold=merchant.high_risk_amount_threshold,
                escalation_failure_threshold=merchant.escalation_failure_threshold,
                auto_recovery_enabled=merchant.auto_recovery_enabled,
            ),
        )

    def _build_retry_history(self, payment_id: uuid.UUID) -> RetryHistory:
        attempts = self.recovery_attempt_repo.list_for_payment(payment_id)
        retry_attempts = [a for a in attempts if a.action_type == RecoveryActionType.RETRY_PAYMENT.value]
        failed_attempts = [a for a in attempts if a.status == RecoveryAttemptStatus.FAILED.value]

        last_retry_at = None
        for attempt in retry_attempts:
            # started_at is when the executor was actually handed the
            # action; fall back to created_at for the (defensive-only, in
            # practice unreachable) case of a row created but never
            # started.
            attempted_at = attempt.started_at or attempt.created_at
            if last_retry_at is None or attempted_at > last_retry_at:
                last_retry_at = attempted_at

        return RetryHistory(
            retry_attempt_count=len(retry_attempts),
            failed_attempt_count=len(failed_attempts),
            last_retry_attempted_at=last_retry_at,
        )
