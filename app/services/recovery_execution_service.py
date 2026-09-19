"""
Recovery execution orchestration — Phase 5.

`execute_recovery()` is the single entry point the /recovery route (and
tests) call. Flow: fetch Payment + latest AIDecision -> idempotency check
-> build PolicyEvaluationInput (PolicyInputBuilder) -> PolicyEngine.
evaluate() -> persist a RecoveryAttempt row -> dispatch to the executor
for decision.final_action -> persist the outcome -> audit every
transition -> commit. Mirrors WebhookService's shape (Phase 2): a plain
class taking a Session, one public method, a private `_audit` helper,
and defensive exception handling so a bad executor/provider never leaves
a half-written attempt row or an unhandled 500.

Idempotency: keyed on ai_decision_id, not payment_id — a payment can
legitimately be retried multiple times across multiple AI decisions (a
failed retry today, a fresh diagnosis and a different action tomorrow),
but re-running recovery for the *same* AI decision that already
succeeded must not fire the action twice. See
RecoveryAttemptRepository.get_latest_for_ai_decision's docstring for why
only SUCCESS short-circuits (not IN_PROGRESS/FAILED/PENDING) — this is a
synchronous, non-concurrent request/response flow with no background
workers, so a stuck IN_PROGRESS row can only mean a prior crash, and the
safe default is to retry it rather than leave it stuck forever (same
reasoning WebhookService applies to a stuck PaymentEvent).
"""
import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.enums import AuditAction, RecoveryActionType, RecoveryAttemptStatus
from app.exceptions import AIDecisionNotFoundError, PaymentNotFoundError
from app.executors.base import ExecutionContext, ExecutionOutcome
from app.executors.factory import get_executor
from app.models.ai_decision import AIDecision
from app.models.audit_log import AuditLog
from app.models.payment import Payment
from app.models.recovery_attempt import RecoveryAttempt
from app.policy_engine import PolicyEngine
from app.schemas.policy import PolicyDecisionType
from app.repositories.ai_decision_repository import AIDecisionRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.customer_repository import CustomerRepository
from app.repositories.payment_repository import PaymentRepository
from app.repositories.recovery_attempt_repository import RecoveryAttemptRepository
from app.schemas.recovery import RecoveryAttemptRead, RecoveryExecutionResult
from app.services.policy_input_builder import PolicyInputBuilder

logger = logging.getLogger(__name__)

# Applied only when the dispatched action's outcome is SUCCESS. Payment.
# status tracks recovery-lifecycle state (see Payment's model docstring);
# SEND_NOTIFICATION and NO_ACTION deliberately have no entry here — a
# nudge or a no-op doesn't change the payment's state, it just leaves it
# "failed" pending a future retry cycle.
_SUCCESS_STATUS_TRANSITIONS: dict[RecoveryActionType, str] = {
    RecoveryActionType.RETRY_PAYMENT: "recovered",
    RecoveryActionType.SEND_PAYMENT_LINK: "retry_scheduled",
    RecoveryActionType.ESCALATE_TO_MERCHANT: "escalated",
}


class RecoveryExecutionService:
    def __init__(self, db: Session, executor_factory=get_executor):
        self.db = db
        self.payment_repo = PaymentRepository(db)
        self.customer_repo = CustomerRepository(db)
        self.ai_decision_repo = AIDecisionRepository(db)
        self.recovery_attempt_repo = RecoveryAttemptRepository(db)
        self.audit_repo = AuditLogRepository(db)
        self.policy_input_builder = PolicyInputBuilder(db)
        self.policy_engine = PolicyEngine()
        # Injectable so tests can substitute a fake executor without
        # touching the real provider factories — see test_recovery_
        # execution_service.py.
        self.get_executor = executor_factory

    def execute_recovery(
        self, payment_id: UUID, ai_decision_id: UUID | None = None, merchant_id: str | None = None
    ) -> RecoveryExecutionResult:
        """
        `merchant_id` (Phase 7, auth): optional, same contract as
        ContextBuilder.build/AuditService.get_payment_timeline — when
        given, a payment owned by a different merchant raises the
        identical PaymentNotFoundError as an unknown payment_id.
        """
        if merchant_id is not None:
            payment = self.payment_repo.get_by_id_for_merchant(payment_id, merchant_id)
        else:
            payment = self.payment_repo.get_by_id(payment_id)
        if payment is None:
            raise PaymentNotFoundError(f"No payment found with id {payment_id}")

        ai_decision = self._resolve_ai_decision(payment, ai_decision_id)

        existing = self.recovery_attempt_repo.get_latest_for_ai_decision(ai_decision.id)
        if existing is not None and existing.status == RecoveryAttemptStatus.SUCCESS.value:
            self._audit(
                "RecoveryAttempt",
                existing.id,
                "recovery_execution_skipped_duplicate",
                f"AI decision {ai_decision.id} already has a successful recovery attempt; not re-executing.",
            )
            self.db.commit()
            return RecoveryExecutionResult(
                payment_id=payment.id,
                ai_decision_id=ai_decision.id,
                policy_decision=existing.policy_decision or "",
                policy_reason=existing.policy_reason or "",
                recovery_attempt=RecoveryAttemptRead.model_validate(existing),
                idempotent_replay=True,
            )

        policy_input = self.policy_input_builder.build(payment, ai_decision)
        decision = self.policy_engine.evaluate(policy_input)

        attempt_number = len(self.recovery_attempt_repo.list_for_payment(payment.id)) + 1
        attempt = self.recovery_attempt_repo.add(
            RecoveryAttempt(
                payment_id=payment.id,
                ai_decision_id=ai_decision.id,
                action_type=decision.final_action.value,
                attempt_number=attempt_number,
                status=RecoveryAttemptStatus.PENDING.value,
                policy_decision=decision.decision.value,
                policy_reason=decision.reason,
            )
        )
        self._audit(
            "RecoveryAttempt",
            attempt.id,
            "policy_decision_recorded",
            f"Policy engine {decision.decision.value} the AI's {decision.ai_recommended_action} "
            f"recommendation; final_action={decision.final_action.value}.",
            violated_rules=decision.violated_rules,
        )
        # Phase 6: a second, narrowly-named entry alongside the one above —
        # independently filterable ("show me every rejection") without
        # parsing the human-readable message. APPROVE is the only verdict
        # where the AI's own recommendation reaches an executor unchanged;
        # MODIFY/REJECT/ESCALATE all mean *something* about that
        # recommendation was overridden, so they share "action_rejected"
        # rather than getting three further-split event names the brief
        # didn't ask for.
        self._audit(
            "RecoveryAttempt",
            attempt.id,
            AuditAction.ACTION_APPROVED.value
            if decision.decision == PolicyDecisionType.APPROVE
            else AuditAction.ACTION_REJECTED.value,
            f"Policy verdict {decision.decision.value} for AI recommendation "
            f"'{decision.ai_recommended_action}' -> final_action={decision.final_action.value}.",
            actor="policy_engine",
            policy_decision=decision.decision.value,
        )
        self.db.commit()

        context = self._build_execution_context(payment, ai_decision, attempt, decision.final_action, decision.reason)

        attempt.status = RecoveryAttemptStatus.IN_PROGRESS.value
        attempt.started_at = datetime.now(timezone.utc)
        self.recovery_attempt_repo.add(attempt)
        self._audit(
            "RecoveryAttempt",
            attempt.id,
            "recovery_execution_started",
            f"Dispatching {decision.final_action.value} to its executor.",
        )
        self.db.commit()

        outcome = self._run_executor(decision.final_action, context)

        attempt.status = outcome.status.value
        attempt.completed_at = datetime.now(timezone.utc)
        attempt.result_message = outcome.result_message
        attempt.external_reference = outcome.provider_reference
        attempt.error_message = outcome.error
        self.recovery_attempt_repo.add(attempt)
        self._audit(
            "RecoveryAttempt",
            attempt.id,
            "recovery_action_executed",
            f"{decision.final_action.value} finished with status={outcome.status.value}.",
            provider_reference=outcome.provider_reference or "",
            error=outcome.error or "",
        )
        # Phase 6: SUCCESS/FAILED get their own narrowly-named event so a
        # dashboard can filter "show me every failed intervention" without
        # parsing outcome.status out of the message above. SKIPPED (the
        # NO_ACTION executor's deliberate no-op) gets neither — it's
        # accurately neither an execution nor a failure, and the brief's
        # eleven events don't call for a third name here.
        if outcome.status == RecoveryAttemptStatus.SUCCESS:
            self._audit(
                "RecoveryAttempt",
                attempt.id,
                AuditAction.ACTION_EXECUTED.value,
                f"{decision.final_action.value} executed successfully.",
                actor="executor",
                provider_reference=outcome.provider_reference or "",
            )
        elif outcome.status == RecoveryAttemptStatus.FAILED:
            self._audit(
                "RecoveryAttempt",
                attempt.id,
                AuditAction.ACTION_FAILED.value,
                f"{decision.final_action.value} failed: {outcome.error or 'no error detail provided'}.",
                actor="executor",
                error=outcome.error or "",
            )

        self._apply_payment_status_transition(payment, decision.final_action, outcome)

        self.db.commit()

        return RecoveryExecutionResult(
            payment_id=payment.id,
            ai_decision_id=ai_decision.id,
            policy_decision=decision.decision.value,
            policy_reason=decision.reason,
            violated_rules=decision.violated_rules,
            recovery_attempt=RecoveryAttemptRead.model_validate(attempt),
        )

    def _resolve_ai_decision(self, payment: Payment, ai_decision_id: UUID | None) -> AIDecision:
        if ai_decision_id is not None:
            ai_decision = self.ai_decision_repo.get_by_id(ai_decision_id)
            if ai_decision is None or ai_decision.payment_id != payment.id:
                raise AIDecisionNotFoundError(
                    f"AI decision {ai_decision_id} does not exist for payment {payment.id}"
                )
            return ai_decision

        ai_decision = self.ai_decision_repo.get_latest_for_payment(payment.id)
        if ai_decision is None:
            raise AIDecisionNotFoundError(
                f"No AI decision exists yet for payment {payment.id}; "
                f"call POST /ai-decisions/diagnose/{payment.id} first."
            )
        return ai_decision

    def _build_execution_context(
        self,
        payment: Payment,
        ai_decision: AIDecision,
        attempt: RecoveryAttempt,
        final_action: RecoveryActionType,
        policy_reason: str,
    ) -> ExecutionContext:
        customer = self.customer_repo.get_by_id(payment.customer_id) if payment.customer_id else None
        return ExecutionContext(
            recovery_attempt_id=attempt.id,
            payment_id=payment.id,
            ai_decision_id=ai_decision.id,
            action_type=final_action,
            attempt_number=attempt.attempt_number,
            payment_amount=payment.amount,
            currency=payment.currency,
            gateway=payment.gateway,
            gateway_payment_id=payment.gateway_payment_id,
            customer_name=customer.name if customer else None,
            customer_email=customer.email if customer else None,
            customer_phone=customer.phone if customer else None,
            merchant_id=payment.merchant_id,
            policy_reason=policy_reason,
        )

    def _run_executor(self, final_action: RecoveryActionType, context: ExecutionContext) -> ExecutionOutcome:
        """
        Graceful-failure boundary: executors are expected to catch their
        own provider errors (see each executor's docstring), but a bug in
        an executor itself must not crash the whole request and leave the
        attempt row stuck in IN_PROGRESS forever.
        """
        try:
            executor = self.get_executor(final_action)
            return executor.execute(context)
        except Exception as exc:  # noqa: BLE001 - intentional catch-all boundary
            logger.exception(
                "recovery_executor_raised", extra={"action_type": final_action.value}
            )
            return ExecutionOutcome(
                status=RecoveryAttemptStatus.FAILED,
                error=f"Executor raised an unexpected error: {exc}",
            )

    def _apply_payment_status_transition(
        self, payment: Payment, final_action: RecoveryActionType, outcome: ExecutionOutcome
    ) -> None:
        if outcome.status != RecoveryAttemptStatus.SUCCESS:
            return
        new_status = _SUCCESS_STATUS_TRANSITIONS.get(final_action)
        if new_status is None or payment.status == new_status:
            return
        previous_status = payment.status
        payment.status = new_status
        self.payment_repo.add(payment)
        self._audit(
            "Payment",
            payment.id,
            "payment_status_updated",
            f"Payment status changed from '{previous_status}' to '{new_status}' "
            f"following a successful {final_action.value}.",
        )
        # Phase 6: narrowly-named events for the two outcomes that most
        # directly answer "did we get the money back / does a human need
        # to act" — the two required events this generic transition log
        # doesn't already name on its own. "retry_scheduled" (a successful
        # SEND_PAYMENT_LINK) gets no equivalent third event; it isn't a
        # resolution yet, just a link now waiting on the customer.
        if new_status == "recovered":
            self._audit(
                "Payment", payment.id, AuditAction.PAYMENT_RECOVERED.value,
                f"Payment recovered via {final_action.value}.",
            )
        elif new_status == "escalated":
            self._audit(
                "Payment", payment.id, AuditAction.ESCALATION_CREATED.value,
                f"Payment escalated to merchant via {final_action.value}.",
            )

    def _audit(
        self, entity_type: str, entity_id: UUID, action: str, message: str, actor: str = "system", **extra
    ) -> None:
        self.audit_repo.add(
            AuditLog(
                entity_type=entity_type,
                entity_id=entity_id,
                action=action,
                actor=actor,
                details={"message": message, **extra},
            )
        )
