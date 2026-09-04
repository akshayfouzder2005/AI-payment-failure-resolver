"""
Tests for model-level behavior: defaults, relationships, and the
timestamp/UUID mixins. These exercise the ORM layer directly (no HTTP),
using the real Postgres test database via the db_session fixture.
"""
from decimal import Decimal

from app.models.customer import Customer
from app.models.merchant_settings import MerchantSettings
from app.models.payment import Payment


def test_customer_gets_uuid_and_timestamps(db_session) -> None:
    customer = Customer(name="Asha Rao", email="asha@example.com")
    db_session.add(customer)
    db_session.flush()

    assert customer.id is not None
    assert customer.created_at is not None
    assert customer.updated_at is not None


def test_merchant_settings_defaults(db_session) -> None:
    settings = MerchantSettings(merchant_id="merchant_demo")
    db_session.add(settings)
    db_session.flush()

    assert settings.max_retry_count == 3
    assert settings.retry_delay_minutes == 60
    assert settings.auto_recovery_enabled is True
    assert settings.escalation_failure_threshold == 2


def test_payment_requires_valid_merchant_fk(db_session) -> None:
    """
    Payment.merchant_id is a real FK into merchant_settings.merchant_id —
    creating a payment for a merchant that doesn't exist should fail at
    flush time, proving the FK constraint is actually enforced by Postgres
    (not just declared and ignored).
    """
    from sqlalchemy.exc import IntegrityError

    payment = Payment(
        merchant_id="does_not_exist",
        gateway="razorpay",
        gateway_payment_id="pay_nonexistent_merchant",
        amount=Decimal("100.00"),
    )
    db_session.add(payment)

    try:
        db_session.flush()
        assert False, "expected IntegrityError for unknown merchant_id"
    except IntegrityError:
        db_session.rollback()


def test_payment_customer_relationship(db_session) -> None:
    settings = MerchantSettings(merchant_id="merchant_rel_test")
    customer = Customer(name="Rahul Singh", email="rahul@example.com")
    db_session.add_all([settings, customer])
    db_session.flush()

    payment = Payment(
        customer_id=customer.id,
        merchant_id=settings.merchant_id,
        gateway="razorpay",
        gateway_payment_id="pay_rel_test_1",
        amount=Decimal("499.00"),
        status="failed",
    )
    db_session.add(payment)
    db_session.flush()

    assert payment.customer.email == "rahul@example.com"
    assert payment in customer.payments
