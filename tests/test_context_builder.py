"""
ContextBuilder tests — Phase 3.

Covers: payment-not-found is fatal, an unknown/no customer degrades
gracefully instead of erroring, customer payment history is aggregated
correctly, previous recovery attempts are included, and merchant policy
values flow through unchanged.
"""
import uuid
from decimal import Decimal

import pytest

from app.exceptions import PaymentNotFoundError
from app.models.recovery_attempt import RecoveryAttempt
from app.repositories.recovery_attempt_repository import RecoveryAttemptRepository
from app.services.context_builder import ContextBuilder


def test_build_raises_for_unknown_payment(db_session) -> None:
    builder = ContextBuilder(db_session)
    with pytest.raises(PaymentNotFoundError):
        builder.build(uuid.uuid4())


def test_build_with_no_customer_degrades_gracefully(db_session, make_payment) -> None:
    payment = make_payment(customer_id=None)

    context = builder_for(db_session).build(payment.id)

    assert context.customer.is_known_customer is False
    assert context.customer.customer_id is None
    assert context.customer_history.total_payment_count == 0
    assert context.previous_recovery_attempts == []


def test_build_includes_payment_fields(db_session, make_payment) -> None:
    payment = make_payment(
        amount=Decimal("1499.00"),
        failure_code="GATEWAY_ERROR",
        failure_message="The customer did not complete the payment in time",
    )

    context = builder_for(db_session).build(payment.id)

    assert context.payment.payment_id == payment.id
    assert context.payment.amount == Decimal("1499.00")
    assert context.payment.failure_code == "GATEWAY_ERROR"
    assert context.payment.failure_message == "The customer did not complete the payment in time"


def test_build_aggregates_customer_history(db_session, make_customer, make_payment) -> None:
    customer = make_customer(email="repeat_customer@example.com")

    # Two older failed payments for the same customer, then the current one.
    make_payment(customer_id=customer.id, status="failed")
    make_payment(customer_id=customer.id, status="recovered")
    current_payment = make_payment(customer_id=customer.id, status="failed")

    context = builder_for(db_session).build(current_payment.id)

    assert context.customer.is_known_customer is True
    assert context.customer_history.total_payment_count == 3
    assert context.customer_history.total_failed_count == 2
    assert context.customer_history.total_recovered_count == 1
    # Excludes the current payment itself from the "previous failures" count.
    assert context.customer_history.previous_failure_count_excluding_current == 1


def test_build_includes_previous_recovery_attempts(db_session, make_payment) -> None:
    payment = make_payment()
    RecoveryAttemptRepository(db_session).add(
        RecoveryAttempt(
            payment_id=payment.id,
            action_type="RETRY_PAYMENT",
            status="failed",
            policy_decision="approved",
        )
    )

    context = builder_for(db_session).build(payment.id)

    assert len(context.previous_recovery_attempts) == 1
    assert context.previous_recovery_attempts[0].action_type == "RETRY_PAYMENT"
    assert context.previous_recovery_attempts[0].policy_decision == "approved"


def test_build_includes_merchant_policy(db_session, make_merchant, make_payment) -> None:
    merchant = make_merchant(
        merchant_id="policy_test_merchant",
        max_retry_count=7,
        high_risk_amount_threshold=Decimal("25000.00"),
    )
    payment = make_payment(merchant_id=merchant.merchant_id)

    context = builder_for(db_session).build(payment.id)

    assert context.merchant_policy.merchant_id == "policy_test_merchant"
    assert context.merchant_policy.max_retry_count == 7
    assert context.merchant_policy.high_risk_amount_threshold == Decimal("25000.00")


def builder_for(db_session) -> ContextBuilder:
    return ContextBuilder(db_session)
