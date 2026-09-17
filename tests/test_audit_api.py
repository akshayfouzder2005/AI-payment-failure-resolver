"""
GET /audit/payment/{payment_id} API tests — Phase 6.
"""
import uuid


def test_audit_timeline_404_for_unknown_payment(client) -> None:
    response = client.get(f"/audit/payment/{uuid.uuid4()}")
    assert response.status_code == 404


def test_audit_timeline_returns_payment_entries(client, db_session, make_payment) -> None:
    from app.models.audit_log import AuditLog
    from app.repositories.audit_log_repository import AuditLogRepository

    payment = make_payment()
    AuditLogRepository(db_session).add(
        AuditLog(entity_type="Payment", entity_id=payment.id, action="payment_failed_recorded", actor="system")
    )
    db_session.commit()

    response = client.get(f"/audit/payment/{payment.id}")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["action"] == "payment_failed_recorded"
    assert body[0]["entity_type"] == "Payment"
