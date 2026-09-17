"""
AuditService tests — Phase 6.
"""
import uuid

import pytest

from app.exceptions import PaymentNotFoundError
from app.models.audit_log import AuditLog
from app.models.payment_event import PaymentEvent
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.payment_event_repository import PaymentEventRepository
from app.services.audit_service import AuditService


def test_get_payment_timeline_raises_for_unknown_payment(db_session) -> None:
    with pytest.raises(PaymentNotFoundError):
        AuditService(db_session).get_payment_timeline(uuid.uuid4())


def test_get_payment_timeline_gathers_across_entity_types(
    db_session, make_payment, make_ai_decision, make_recovery_attempt
) -> None:
    """
    Proves the actual point of this service: a payment's timeline spans
    four different entity_types in audit_logs (Payment, PaymentEvent,
    AIDecision, RecoveryAttempt), and get_payment_timeline gathers all of
    them — not just the rows filed directly under "Payment".
    """
    payment = make_payment()
    decision = make_ai_decision(payment.id)
    attempt = make_recovery_attempt(payment.id, ai_decision_id=decision.id)

    event = PaymentEventRepository(db_session).add(
        PaymentEvent(
            payment_id=payment.id,
            provider="razorpay",
            event_id=f"evt_{uuid.uuid4().hex}",
            event_type="payment.failed",
            payload={},
        )
    )

    audit_repo = AuditLogRepository(db_session)
    audit_repo.add(
        AuditLog(entity_type="Payment", entity_id=payment.id, action="payment_failed_recorded", actor="system")
    )
    audit_repo.add(
        AuditLog(entity_type="PaymentEvent", entity_id=event.id, action="webhook_received", actor="system")
    )
    audit_repo.add(
        AuditLog(entity_type="AIDecision", entity_id=decision.id, action="ai_decision_created", actor="ai_engine")
    )
    audit_repo.add(
        AuditLog(
            entity_type="RecoveryAttempt", entity_id=attempt.id, action="action_executed", actor="executor"
        )
    )
    # Belongs to a different payment entirely — must NOT show up.
    other_payment = make_payment()
    audit_repo.add(
        AuditLog(
            entity_type="Payment", entity_id=other_payment.id, action="payment_failed_recorded", actor="system"
        )
    )
    db_session.commit()

    timeline = AuditService(db_session).get_payment_timeline(payment.id)

    actions = {log.action for log in timeline}
    assert actions == {"payment_failed_recorded", "webhook_received", "ai_decision_created", "action_executed"}
    assert len(timeline) == 4


def test_get_payment_timeline_is_chronologically_ordered(db_session, make_payment) -> None:
    """
    Regression test for the AuditLog.created_at fix this phase makes:
    multiple audit rows added within the SAME transaction/commit must
    still come back in real call order, not tied at one frozen
    transaction-start timestamp (Postgres's server-side now() behavior).
    """
    payment = make_payment()
    audit_repo = AuditLogRepository(db_session)

    audit_repo.add(AuditLog(entity_type="Payment", entity_id=payment.id, action="step_one", actor="system"))
    audit_repo.add(AuditLog(entity_type="Payment", entity_id=payment.id, action="step_two", actor="system"))
    audit_repo.add(AuditLog(entity_type="Payment", entity_id=payment.id, action="step_three", actor="system"))
    db_session.commit()  # all three committed together, in one transaction

    timeline = AuditService(db_session).get_payment_timeline(payment.id)

    assert [log.action for log in timeline] == ["step_one", "step_two", "step_three"]
    assert timeline[0].created_at <= timeline[1].created_at <= timeline[2].created_at
