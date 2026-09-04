"""
Repository tests. The most important test in this file is
`test_payment_event_idempotency_constraint` — it proves, against a real
database, that the mechanism Phase 2's webhook service will rely on for
idempotency actually works at the DB level.
"""
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.merchant_settings import MerchantSettings
from app.models.payment_event import PaymentEvent
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.customer_repository import CustomerRepository
from app.repositories.merchant_settings_repository import MerchantSettingsRepository
from app.repositories.payment_event_repository import PaymentEventRepository
from app.repositories.payment_repository import PaymentRepository


def test_customer_repository_get_by_email(db_session) -> None:
    repo = CustomerRepository(db_session)
    from app.models.customer import Customer

    repo.add(Customer(name="Test User", email="repo_test@example.com"))

    found = repo.get_by_email("repo_test@example.com")
    assert found is not None
    assert found.name == "Test User"

    assert repo.get_by_email("nope@example.com") is None


def test_merchant_settings_repository_get_by_merchant_id(db_session) -> None:
    repo = MerchantSettingsRepository(db_session)
    repo.add(MerchantSettings(merchant_id="merchant_repo_test", max_retry_count=5))

    found = repo.get_by_merchant_id("merchant_repo_test")
    assert found is not None
    assert found.max_retry_count == 5


def test_payment_repository_get_by_gateway_payment_id(db_session) -> None:
    settings_repo = MerchantSettingsRepository(db_session)
    settings_repo.add(MerchantSettings(merchant_id="merchant_payment_repo_test"))

    payment_repo = PaymentRepository(db_session)
    from app.models.payment import Payment

    payment_repo.add(
        Payment(
            merchant_id="merchant_payment_repo_test",
            gateway="razorpay",
            gateway_payment_id="pay_abc123",
            amount=Decimal("1000.00"),
        )
    )

    found = payment_repo.get_by_gateway_payment_id("razorpay", "pay_abc123")
    assert found is not None
    assert found.amount == Decimal("1000.00")

    assert payment_repo.get_by_gateway_payment_id("razorpay", "pay_does_not_exist") is None


def test_payment_event_idempotency_constraint(db_session) -> None:
    """
    Simulates a gateway redelivering the same webhook twice (standard
    behavior for every payment gateway on timeout/no-2xx). The second
    call with the same (provider, event_id) must return the ORIGINAL
    event, not create a second row and not raise.
    """
    repo = PaymentEventRepository(db_session)

    first, created_first = repo.add_idempotent(
        PaymentEvent(
            provider="razorpay",
            event_id="evt_duplicate_test",
            event_type="payment.failed",
            payload={"foo": "bar"},
        )
    )
    assert created_first is True

    second, created_second = repo.add_idempotent(
        PaymentEvent(
            provider="razorpay",
            event_id="evt_duplicate_test",
            event_type="payment.failed",
            payload={"foo": "bar", "redelivered": True},
        )
    )

    assert created_second is False
    assert second.id == first.id
    # The original payload is preserved — the redelivered duplicate's
    # payload was discarded, exactly as intended.
    assert second.payload == {"foo": "bar"}

    # The session must still be usable after the conflict (this is the
    # whole point of the SAVEPOINT in add_idempotent).
    found = repo.get_by_provider_event_id("razorpay", "evt_duplicate_test")
    assert found is not None


def test_raw_unique_constraint_fires_without_savepoint(db_session) -> None:
    """
    Documents *why* add_idempotent uses a SAVEPOINT: a naive add() that
    hits the unique constraint raises IntegrityError and poisons the rest
    of the session's transaction until it's rolled back — you cannot just
    catch the exception and keep using the same session.
    """
    repo = PaymentEventRepository(db_session)
    repo.add(
        PaymentEvent(
            provider="stripe_test",
            event_id="evt_raw_constraint_test",
            event_type="payment.failed",
            payload={},
        )
    )

    with pytest.raises(IntegrityError):
        repo.add(
            PaymentEvent(
                provider="stripe_test",
                event_id="evt_raw_constraint_test",
                event_type="payment.failed",
                payload={},
            )
        )

    # Recovery requires rolling back the whole transaction here — anything
    # flushed-but-uncommitted earlier in this transaction is lost too.
    # This is exactly the footgun add_idempotent's SAVEPOINT avoids.
    db_session.rollback()


def test_payment_event_same_id_different_provider_is_allowed(db_session) -> None:
    """
    The unique constraint is on (provider, event_id) together, not
    event_id alone — two different gateways coincidentally using the same
    event id string should not collide.
    """
    repo = PaymentEventRepository(db_session)

    _, created_first = repo.add_idempotent(
        PaymentEvent(
            provider="razorpay",
            event_id="evt_shared_id",
            event_type="payment.failed",
            payload={},
        )
    )
    _, created_second = repo.add_idempotent(
        PaymentEvent(
            provider="stripe_test",
            event_id="evt_shared_id",
            event_type="payment.failed",
            payload={},
        )
    )

    assert created_first is True
    assert created_second is True  # different provider, not a duplicate


def test_audit_log_repository_add_and_list_for_entity(db_session) -> None:
    import uuid

    from app.models.audit_log import AuditLog

    repo = AuditLogRepository(db_session)
    entity_id = uuid.uuid4()
    other_entity_id = uuid.uuid4()

    repo.add(
        AuditLog(
            entity_type="Payment", entity_id=entity_id, action="payment_failed_recorded",
            actor="system", details={"message": "first"},
        )
    )
    repo.add(
        AuditLog(
            entity_type="Payment", entity_id=entity_id, action="recovery_pipeline_queued",
            actor="system", details={"message": "second"},
        )
    )
    repo.add(
        AuditLog(
            entity_type="Payment", entity_id=other_entity_id, action="payment_failed_recorded",
            actor="system", details={"message": "unrelated"},
        )
    )

    logs = repo.list_for_entity("Payment", entity_id)

    assert [log.action for log in logs] == ["payment_failed_recorded", "recovery_pipeline_queued"]
