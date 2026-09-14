"""
RecoveryExecutionService tests — Phase 5. Runs against real Postgres
(per conftest.py) with the REAL PolicyEngine and REAL executors (backed
by MockPaymentGatewayClient/MockNotificationProvider, injected via
config's default "mock" providers — no monkeypatching needed since mock
is already the default). This is the actual end-to-end path the demo
runs: failed payment -> AI decision -> policy decision -> action
execution -> result -> audit log, all through real DB rows.

A couple of tests inject a fake `executor_factory` instead, specifically
to force outcomes (a raised exception, a controlled failure) that would
be awkward to coax out of the real mock providers deterministically.
"""
import uuid

import pytest

from app.enums import RecoveryActionType, RecoveryAttemptStatus
from app.exceptions import AIDecisionNotFoundError, PaymentNotFoundError
from app.executors.base import ExecutionOutcome
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.recovery_attempt_repository import RecoveryAttemptRepository
from app.services.recovery_execution_service import RecoveryExecutionService


def test_payment_not_found_raises(db_session):
    service = RecoveryExecutionService(db_session)
    with pytest.raises(PaymentNotFoundError):
        service.execute_recovery(uuid.uuid4())


def test_no_ai_decision_raises(db_session, make_payment):
    payment = make_payment()
    service = RecoveryExecutionService(db_session)
    with pytest.raises(AIDecisionNotFoundError):
        service.execute_recovery(payment.id)


def test_explicit_ai_decision_from_a_different_payment_raises(db_session, make_payment, make_ai_decision):
    payment_a = make_payment()
    payment_b = make_payment()
    decision_for_b = make_ai_decision(payment_b.id)
    db_session.commit()

    service = RecoveryExecutionService(db_session)
    with pytest.raises(AIDecisionNotFoundError):
        service.execute_recovery(payment_a.id, ai_decision_id=decision_for_b.id)


def test_full_happy_path_retry_payment_approved_and_succeeds(db_session, make_payment, make_ai_decision):
    """The primary demo flow: FAILED PAYMENT -> AI DECISION -> POLICY
    DECISION -> ACTION EXECUTION -> RESULT -> AUDIT LOG."""
    payment = make_payment(amount="500.00")
    decision = make_ai_decision(
        payment.id,
        recommended_action="RETRY_PAYMENT",
        confidence=0.9,
        recovery_probability=0.8,
    )
    db_session.commit()

    service = RecoveryExecutionService(db_session)
    result = service.execute_recovery(payment.id)

    assert result.policy_decision == "APPROVE"
    assert result.recovery_attempt.action_type == "RETRY_PAYMENT"
    assert result.recovery_attempt.status == "success"
    assert result.recovery_attempt.started_at is not None
    assert result.recovery_attempt.completed_at is not None
    assert result.recovery_attempt.external_reference is not None
    assert result.recovery_attempt.error_message is None
    assert result.idempotent_replay is False

    db_session.refresh(payment)
    assert payment.status == "recovered"

    audit_actions = [
        log.action
        for log in AuditLogRepository(db_session).list_for_entity(
            "RecoveryAttempt", result.recovery_attempt.id
        )
    ]
    assert "policy_decision_recorded" in audit_actions
    assert "recovery_execution_started" in audit_actions
    assert "recovery_action_executed" in audit_actions

    payment_audit_actions = [
        log.action for log in AuditLogRepository(db_session).list_for_entity("Payment", payment.id)
    ]
    assert "payment_status_updated" in payment_audit_actions


def test_high_value_payment_is_downgraded_to_payment_link(
    db_session, make_merchant, make_payment, make_ai_decision
):
    merchant = make_merchant(
        merchant_id="high_value_merchant", high_risk_amount_threshold="1000.00"
    )
    payment = make_payment(merchant_id=merchant.merchant_id, amount="5000.00")
    make_ai_decision(payment.id, recommended_action="RETRY_PAYMENT", confidence=0.9)
    db_session.commit()

    service = RecoveryExecutionService(db_session)
    result = service.execute_recovery(payment.id)

    assert result.policy_decision == "MODIFY"
    assert result.recovery_attempt.action_type == "SEND_PAYMENT_LINK"
    assert result.recovery_attempt.status == "success"

    db_session.refresh(payment)
    assert payment.status == "retry_scheduled"


def test_fraud_suspected_results_in_no_action_and_skipped_status(
    db_session, make_payment, make_ai_decision
):
    payment = make_payment()
    make_ai_decision(
        payment.id,
        failure_category="FRAUD_SUSPECTED",
        recommended_action="RETRY_PAYMENT",
        confidence=0.9,
    )
    db_session.commit()

    service = RecoveryExecutionService(db_session)
    result = service.execute_recovery(payment.id)

    assert result.policy_decision == "REJECT"
    assert result.recovery_attempt.action_type == "NO_ACTION"
    assert result.recovery_attempt.status == "skipped"

    db_session.refresh(payment)
    assert payment.status == "failed"  # unchanged — NO_ACTION never transitions payment status


def test_idempotent_replay_does_not_create_a_second_attempt(db_session, make_payment, make_ai_decision):
    payment = make_payment()
    make_ai_decision(payment.id, recommended_action="RETRY_PAYMENT", confidence=0.9)
    db_session.commit()

    service = RecoveryExecutionService(db_session)
    first = service.execute_recovery(payment.id)
    assert first.idempotent_replay is False

    second = service.execute_recovery(payment.id)
    assert second.idempotent_replay is True
    assert second.recovery_attempt.id == first.recovery_attempt.id

    attempts = RecoveryAttemptRepository(db_session).list_for_payment(payment.id)
    assert len(attempts) == 1


def test_executor_failure_marks_attempt_failed_without_changing_payment_status(
    db_session, make_payment, make_ai_decision
):
    payment = make_payment()
    make_ai_decision(payment.id, recommended_action="RETRY_PAYMENT", confidence=0.9)
    db_session.commit()

    class AlwaysFailsExecutor:
        def execute(self, context):
            return ExecutionOutcome(status=RecoveryAttemptStatus.FAILED, error="Simulated gateway decline.")

    service = RecoveryExecutionService(db_session, executor_factory=lambda action_type: AlwaysFailsExecutor())
    result = service.execute_recovery(payment.id)

    assert result.recovery_attempt.status == "failed"
    assert result.recovery_attempt.error_message == "Simulated gateway decline."

    db_session.refresh(payment)
    assert payment.status == "failed"


def test_executor_raising_is_caught_and_recorded_as_failed(db_session, make_payment, make_ai_decision):
    payment = make_payment()
    make_ai_decision(payment.id, recommended_action="RETRY_PAYMENT", confidence=0.9)
    db_session.commit()

    class BrokenExecutor:
        def execute(self, context):
            raise RuntimeError("boom")

    service = RecoveryExecutionService(db_session, executor_factory=lambda action_type: BrokenExecutor())
    result = service.execute_recovery(payment.id)

    assert result.recovery_attempt.status == "failed"
    assert "boom" in result.recovery_attempt.error_message


def test_attempt_number_increments_across_multiple_ai_decisions(db_session, make_payment, make_ai_decision):
    payment = make_payment()
    first_decision = make_ai_decision(payment.id, recommended_action="RETRY_PAYMENT", confidence=0.9)
    db_session.commit()

    service = RecoveryExecutionService(db_session)
    first_result = service.execute_recovery(payment.id, ai_decision_id=first_decision.id)
    assert first_result.recovery_attempt.attempt_number == 1

    second_decision = make_ai_decision(payment.id, recommended_action="SEND_NOTIFICATION", confidence=0.9)
    db_session.commit()
    second_result = service.execute_recovery(payment.id, ai_decision_id=second_decision.id)
    assert second_result.recovery_attempt.attempt_number == 2


def test_defaults_to_latest_ai_decision_when_none_specified(db_session, make_payment, make_ai_decision):
    """
    Only exercises the "no ai_decision_id given" path with a single
    decision — not with two, since within one test transaction Postgres's
    now() (created_at's server_default) is the transaction's start time,
    not wall-clock call order, making "which one is latest" ambiguous
    when both are inserted in the same transaction. See
    test_ai_decision_service.py::test_repeated_calls_append_rather_than_overwrite
    for the same caveat on get_latest_for_payment.
    """
    payment = make_payment()
    decision = make_ai_decision(payment.id, recommended_action="SEND_NOTIFICATION", confidence=0.9)
    db_session.commit()

    service = RecoveryExecutionService(db_session)
    result = service.execute_recovery(payment.id)

    assert result.ai_decision_id == decision.id
    assert result.recovery_attempt.action_type == "SEND_NOTIFICATION"
