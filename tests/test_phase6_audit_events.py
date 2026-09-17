"""
Tests proving the Phase 6 audit events actually fire from the real
pipeline (webhook ingestion, AI diagnosis, policy + execution) — not
just that AuditLog rows with these action strings can be constructed by
hand (test_audit_service.py already covers reconstruction/read-side).
Runs against real Postgres with the REAL PolicyEngine and REAL
executors, same convention as test_recovery_execution_service.py.
"""
from app.enums import AuditAction
from app.executors.base import ExecutionOutcome
from app.integrations.llm_provider.mock_provider import MockLLMProvider
from app.repositories.audit_log_repository import AuditLogRepository
from app.services.ai_decision_service import AIDecisionService
from app.services.recovery_execution_service import RecoveryExecutionService


def test_webhook_received_fires_on_new_delivery(client, db_session, sign, razorpay_failed_payment_payload, event_id_header):
    body = razorpay_failed_payment_payload(gateway_payment_id="pay_phase6_webhook_received")
    headers = {"x-razorpay-signature": sign(body), **event_id_header()}

    response = client.post("/webhooks/razorpay", content=body, headers=headers)
    assert response.status_code == 200

    from app.repositories.payment_event_repository import PaymentEventRepository

    event = PaymentEventRepository(db_session).get_by_provider_event_id(
        "razorpay", headers["x-razorpay-event-id"]
    )
    audit_actions = [
        log.action for log in AuditLogRepository(db_session).list_for_entity("PaymentEvent", event.id)
    ]
    assert AuditAction.WEBHOOK_RECEIVED.value in audit_actions


def test_webhook_received_does_not_fire_twice_for_a_duplicate_delivery(
    client, db_session, sign, razorpay_failed_payment_payload, event_id_header
):
    body = razorpay_failed_payment_payload(gateway_payment_id="pay_phase6_webhook_dup")
    headers = {"x-razorpay-signature": sign(body), **event_id_header()}

    client.post("/webhooks/razorpay", content=body, headers=headers)
    client.post("/webhooks/razorpay", content=body, headers=headers)  # redelivery, same event id

    from app.repositories.payment_event_repository import PaymentEventRepository

    event = PaymentEventRepository(db_session).get_by_provider_event_id(
        "razorpay", headers["x-razorpay-event-id"]
    )
    audit_actions = [
        log.action for log in AuditLogRepository(db_session).list_for_entity("PaymentEvent", event.id)
    ]
    assert audit_actions.count(AuditAction.WEBHOOK_RECEIVED.value) == 1
    assert "webhook_duplicate_ignored" in audit_actions


def test_ai_analysis_started_fires_before_completion(db_session, make_payment):
    payment = make_payment(failure_message="Insufficient funds in the customer's account")
    service = AIDecisionService(db_session, llm_provider=MockLLMProvider())

    decision = service.diagnose_payment(payment.id)

    audit_actions = [
        log.action for log in AuditLogRepository(db_session).list_for_entity("Payment", payment.id)
    ]
    assert AuditAction.AI_ANALYSIS_STARTED.value in audit_actions

    ai_decision_actions = [
        log.action for log in AuditLogRepository(db_session).list_for_entity("AIDecision", decision.id)
    ]
    assert "ai_decision_created" in ai_decision_actions


def test_action_approved_and_payment_recovered_fire_on_approved_retry(db_session, make_payment, make_ai_decision):
    payment = make_payment()
    make_ai_decision(payment.id, recommended_action="RETRY_PAYMENT", confidence=0.9, recovery_probability=0.8)
    db_session.commit()

    result = RecoveryExecutionService(db_session).execute_recovery(payment.id)
    assert result.policy_decision == "APPROVE"

    attempt_actions = [
        log.action
        for log in AuditLogRepository(db_session).list_for_entity("RecoveryAttempt", result.recovery_attempt.id)
    ]
    assert AuditAction.ACTION_APPROVED.value in attempt_actions
    assert AuditAction.ACTION_REJECTED.value not in attempt_actions
    assert AuditAction.ACTION_EXECUTED.value in attempt_actions
    assert AuditAction.ACTION_FAILED.value not in attempt_actions

    payment_actions = [
        log.action for log in AuditLogRepository(db_session).list_for_entity("Payment", payment.id)
    ]
    assert AuditAction.PAYMENT_RECOVERED.value in payment_actions
    assert AuditAction.ESCALATION_CREATED.value not in payment_actions


def test_action_rejected_fires_on_fraud_reject_verdict(db_session, make_payment, make_ai_decision):
    payment = make_payment()
    make_ai_decision(
        payment.id, failure_category="FRAUD_SUSPECTED", recommended_action="RETRY_PAYMENT", confidence=0.9
    )
    db_session.commit()

    result = RecoveryExecutionService(db_session).execute_recovery(payment.id)
    assert result.policy_decision == "REJECT"

    attempt_actions = [
        log.action
        for log in AuditLogRepository(db_session).list_for_entity("RecoveryAttempt", result.recovery_attempt.id)
    ]
    assert AuditAction.ACTION_REJECTED.value in attempt_actions
    assert AuditAction.ACTION_APPROVED.value not in attempt_actions
    # NO_ACTION is skipped, not executed/failed — neither event applies.
    assert AuditAction.ACTION_EXECUTED.value not in attempt_actions
    assert AuditAction.ACTION_FAILED.value not in attempt_actions


def test_action_rejected_fires_on_modify_verdict(db_session, make_merchant, make_payment, make_ai_decision):
    merchant = make_merchant(merchant_id="phase6_modify_merchant", high_risk_amount_threshold="1000.00")
    payment = make_payment(merchant_id=merchant.merchant_id, amount="5000.00")
    make_ai_decision(payment.id, recommended_action="RETRY_PAYMENT", confidence=0.9)
    db_session.commit()

    result = RecoveryExecutionService(db_session).execute_recovery(payment.id)
    assert result.policy_decision == "MODIFY"

    attempt_actions = [
        log.action
        for log in AuditLogRepository(db_session).list_for_entity("RecoveryAttempt", result.recovery_attempt.id)
    ]
    assert AuditAction.ACTION_REJECTED.value in attempt_actions

    # A successful downgraded SEND_PAYMENT_LINK reaches "retry_scheduled",
    # not "recovered" — neither of the two Payment-status events applies.
    db_session.refresh(payment)
    assert payment.status == "retry_scheduled"
    payment_actions = [
        log.action for log in AuditLogRepository(db_session).list_for_entity("Payment", payment.id)
    ]
    assert AuditAction.PAYMENT_RECOVERED.value not in payment_actions
    assert AuditAction.ESCALATION_CREATED.value not in payment_actions


def test_action_failed_fires_when_executor_fails(db_session, make_payment, make_ai_decision):
    from app.enums import RecoveryAttemptStatus

    payment = make_payment()
    make_ai_decision(payment.id, recommended_action="RETRY_PAYMENT", confidence=0.9)
    db_session.commit()

    class AlwaysFailsExecutor:
        def execute(self, context):
            return ExecutionOutcome(status=RecoveryAttemptStatus.FAILED, error="Simulated gateway decline.")

    service = RecoveryExecutionService(db_session, executor_factory=lambda action_type: AlwaysFailsExecutor())
    result = service.execute_recovery(payment.id)
    assert result.recovery_attempt.status == "failed"

    attempt_actions = [
        log.action
        for log in AuditLogRepository(db_session).list_for_entity("RecoveryAttempt", result.recovery_attempt.id)
    ]
    assert AuditAction.ACTION_FAILED.value in attempt_actions
    assert AuditAction.ACTION_EXECUTED.value not in attempt_actions


def test_escalation_created_fires_when_repeated_failures_force_escalation(
    db_session, make_merchant, make_payment, make_ai_decision, make_recovery_attempt
):
    """
    Drives the REAL 'repeated failures' policy rule (not a fake
    executor): a merchant with escalation_failure_threshold=1 and one
    prior failed RecoveryAttempt on this payment forces the policy
    engine's decision to ESCALATE regardless of what the new AI decision
    recommends, per PolicyEngine's REPEATED_FAILURES_THRESHOLD rule.
    """
    merchant = make_merchant(merchant_id="phase6_escalation_merchant", escalation_failure_threshold=1)
    payment = make_payment(merchant_id=merchant.merchant_id)
    make_recovery_attempt(payment.id, action_type="RETRY_PAYMENT", status="failed")
    make_ai_decision(payment.id, recommended_action="RETRY_PAYMENT", confidence=0.9)
    db_session.commit()

    result = RecoveryExecutionService(db_session).execute_recovery(payment.id)

    assert result.policy_decision == "ESCALATE"
    assert result.recovery_attempt.action_type == "ESCALATE_TO_MERCHANT"

    db_session.refresh(payment)
    assert payment.status == "escalated"

    payment_actions = [
        log.action for log in AuditLogRepository(db_session).list_for_entity("Payment", payment.id)
    ]
    assert AuditAction.ESCALATION_CREATED.value in payment_actions
    assert AuditAction.PAYMENT_RECOVERED.value not in payment_actions
