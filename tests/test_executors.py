"""
RecoveryActionExecutor tests — Phase 5. Each executor is tested purely
in-memory: a mock gateway/notification provider is injected directly
(no DB, no HTTP), isolating "does this executor call the right provider
method with the right data and translate the result correctly" from
RecoveryExecutionService's orchestration (covered separately in
test_recovery_execution_service.py).
"""
import uuid
from decimal import Decimal

from app.enums import RecoveryActionType, RecoveryAttemptStatus
from app.executors.base import ExecutionContext
from app.executors.escalation_executor import EscalationExecutor
from app.executors.no_action_executor import NoActionExecutor
from app.executors.notification_executor import NotificationExecutor
from app.executors.payment_link_executor import PaymentLinkExecutor
from app.executors.retry_payment_executor import RetryPaymentExecutor
from app.integrations.notification_provider.mock_provider import MockNotificationProvider
from app.integrations.payment_gateway_client.mock_client import MockPaymentGatewayClient


def build_context(**overrides) -> ExecutionContext:
    defaults = dict(
        recovery_attempt_id=uuid.uuid4(),
        payment_id=uuid.uuid4(),
        ai_decision_id=uuid.uuid4(),
        action_type=RecoveryActionType.RETRY_PAYMENT,
        attempt_number=1,
        payment_amount=Decimal("500.00"),
        currency="INR",
        gateway="razorpay",
        gateway_payment_id="pay_test123",
        customer_name="Test Customer",
        customer_email="test@example.com",
        customer_phone="+919800000000",
        merchant_id="default_merchant",
        policy_reason="Approved: confidence and recovery probability both meet the auto-recovery threshold.",
    )
    defaults.update(overrides)
    return ExecutionContext(**defaults)


# --- RetryPaymentExecutor ---


def test_retry_payment_executor_success():
    executor = RetryPaymentExecutor(gateway_client=MockPaymentGatewayClient())
    outcome = executor.execute(build_context())
    assert outcome.status == RecoveryAttemptStatus.SUCCESS
    assert outcome.provider_reference is not None
    assert outcome.error is None


def test_retry_payment_executor_gateway_failure():
    executor = RetryPaymentExecutor(gateway_client=MockPaymentGatewayClient(always_fail=True))
    outcome = executor.execute(build_context())
    assert outcome.status == RecoveryAttemptStatus.FAILED
    assert outcome.error is not None


# --- PaymentLinkExecutor ---


def test_payment_link_executor_success():
    executor = PaymentLinkExecutor(gateway_client=MockPaymentGatewayClient())
    outcome = executor.execute(build_context(action_type=RecoveryActionType.SEND_PAYMENT_LINK))
    assert outcome.status == RecoveryAttemptStatus.SUCCESS
    assert outcome.provider_reference is not None


def test_payment_link_executor_gateway_failure():
    executor = PaymentLinkExecutor(gateway_client=MockPaymentGatewayClient(always_fail=True))
    outcome = executor.execute(build_context(action_type=RecoveryActionType.SEND_PAYMENT_LINK))
    assert outcome.status == RecoveryAttemptStatus.FAILED


# --- NotificationExecutor ---


def test_notification_executor_success():
    executor = NotificationExecutor(notification_provider=MockNotificationProvider())
    outcome = executor.execute(build_context(action_type=RecoveryActionType.SEND_NOTIFICATION))
    assert outcome.status == RecoveryAttemptStatus.SUCCESS


def test_notification_executor_fails_gracefully_with_no_contact_info():
    executor = NotificationExecutor(notification_provider=MockNotificationProvider())
    context = build_context(
        action_type=RecoveryActionType.SEND_NOTIFICATION,
        customer_email=None,
        customer_phone=None,
    )
    outcome = executor.execute(context)
    assert outcome.status == RecoveryAttemptStatus.FAILED
    assert "email or phone" in outcome.error


def test_notification_executor_provider_failure():
    executor = NotificationExecutor(notification_provider=MockNotificationProvider(always_fail=True))
    outcome = executor.execute(build_context(action_type=RecoveryActionType.SEND_NOTIFICATION))
    assert outcome.status == RecoveryAttemptStatus.FAILED


# --- EscalationExecutor ---


def test_escalation_executor_success():
    executor = EscalationExecutor(
        notification_provider=MockNotificationProvider(),
        merchant_contact_email="ops@merchant.example",
    )
    outcome = executor.execute(build_context(action_type=RecoveryActionType.ESCALATE_TO_MERCHANT))
    assert outcome.status == RecoveryAttemptStatus.SUCCESS


def test_escalation_executor_does_not_need_customer_contact_info():
    """Escalation notifies the merchant, not the customer, so a payment
    with no customer contact info on file should still escalate fine."""
    executor = EscalationExecutor(
        notification_provider=MockNotificationProvider(),
        merchant_contact_email="ops@merchant.example",
    )
    context = build_context(
        action_type=RecoveryActionType.ESCALATE_TO_MERCHANT,
        customer_email=None,
        customer_phone=None,
    )
    outcome = executor.execute(context)
    assert outcome.status == RecoveryAttemptStatus.SUCCESS


# --- NoActionExecutor ---


def test_no_action_executor_always_skips():
    executor = NoActionExecutor()
    outcome = executor.execute(build_context(action_type=RecoveryActionType.NO_ACTION))
    assert outcome.status == RecoveryAttemptStatus.SKIPPED
    assert outcome.error is None
