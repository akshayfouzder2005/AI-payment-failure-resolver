"""
Context builder — Phase 3.

Turns a payment_id into a `PaymentContext`: the payment itself, its
customer (if known) and their payment history, any previous recovery
attempts on this payment, and the merchant's deterministic policy
settings. This is the ONLY input `LLMProvider.generate_decision()` ever
sees — no ORM session, no raw model objects, nothing beyond what's in the
returned context.

Kept separate from `AIDecisionService` (which orchestrates the full
diagnose pipeline) the same way `PaymentService` is kept separate from
`WebhookService` in Phase 2 — one class, one job: given a payment_id,
decide what the AI should be told about it.
"""
import uuid

from sqlalchemy.orm import Session

from app.exceptions import PaymentNotFoundError
from app.integrations.llm_provider.base import (
    CustomerHistory,
    CustomerSnapshot,
    MerchantPolicyContext,
    PaymentContext,
    PaymentSnapshot,
    PreviousRecoveryAttemptSnapshot,
)
from app.repositories.customer_repository import CustomerRepository
from app.repositories.merchant_settings_repository import MerchantSettingsRepository
from app.repositories.payment_repository import PaymentRepository
from app.repositories.recovery_attempt_repository import RecoveryAttemptRepository

_EMPTY_CUSTOMER = CustomerSnapshot(
    customer_id=None, name=None, email=None, phone=None, is_known_customer=False
)
_EMPTY_HISTORY = CustomerHistory(
    total_payment_count=0,
    total_failed_count=0,
    total_recovered_count=0,
    previous_failure_count_excluding_current=0,
)


class ContextBuilder:
    def __init__(self, db: Session):
        self.db = db
        self.payment_repo = PaymentRepository(db)
        self.customer_repo = CustomerRepository(db)
        self.merchant_repo = MerchantSettingsRepository(db)
        self.recovery_attempt_repo = RecoveryAttemptRepository(db)

    def build(self, payment_id: uuid.UUID) -> PaymentContext:
        payment = self.payment_repo.get_by_id(payment_id)
        if payment is None:
            raise PaymentNotFoundError(f"No payment found with id {payment_id}")

        merchant = self.merchant_repo.get_by_merchant_id(payment.merchant_id)
        if merchant is None:
            # Shouldn't happen in practice — PaymentService.ensure_default_merchant()
            # (Phase 2) auto-provisions this before any Payment can be created — but
            # if it ever does, that's exactly the kind of thing that should surface
            # as "payment not found in a usable state" rather than a 500 deep in a
            # policy-settings lookup.
            raise PaymentNotFoundError(
                f"Payment {payment_id} references unknown merchant '{payment.merchant_id}'"
            )

        customer_snapshot, history = self._build_customer_context(payment)

        prior_attempts = [
            PreviousRecoveryAttemptSnapshot(
                action_type=attempt.action_type,
                status=attempt.status,
                policy_decision=attempt.policy_decision,
                created_at=attempt.created_at,
            )
            for attempt in self.recovery_attempt_repo.list_for_payment(payment.id)
        ]

        return PaymentContext(
            payment=PaymentSnapshot(
                payment_id=payment.id,
                gateway=payment.gateway,
                gateway_payment_id=payment.gateway_payment_id,
                amount=payment.amount,
                currency=payment.currency,
                status=payment.status,
                failure_code=payment.failure_code,
                failure_message=payment.failure_message,
                original_transaction_at=payment.original_transaction_at,
            ),
            customer=customer_snapshot,
            customer_history=history,
            previous_recovery_attempts=prior_attempts,
            merchant_policy=MerchantPolicyContext(
                merchant_id=merchant.merchant_id,
                max_retry_count=merchant.max_retry_count,
                retry_delay_minutes=merchant.retry_delay_minutes,
                high_risk_amount_threshold=merchant.high_risk_amount_threshold,
                escalation_failure_threshold=merchant.escalation_failure_threshold,
                auto_recovery_enabled=merchant.auto_recovery_enabled,
            ),
        )

    def _build_customer_context(self, payment) -> tuple[CustomerSnapshot, CustomerHistory]:
        if payment.customer_id is None:
            return _EMPTY_CUSTOMER, _EMPTY_HISTORY

        customer = self.customer_repo.get_by_id(payment.customer_id)
        if customer is None:
            return _EMPTY_CUSTOMER, _EMPTY_HISTORY

        snapshot = CustomerSnapshot(
            customer_id=customer.id,
            name=customer.name,
            email=customer.email,
            phone=customer.phone,
            is_known_customer=True,
        )

        past_payments = self.payment_repo.list_by_customer_id(customer.id)
        history = CustomerHistory(
            total_payment_count=len(past_payments),
            total_failed_count=sum(1 for p in past_payments if p.status == "failed"),
            total_recovered_count=sum(1 for p in past_payments if p.status == "recovered"),
            previous_failure_count_excluding_current=sum(
                1 for p in past_payments if p.status == "failed" and p.id != payment.id
            ),
        )
        return snapshot, history
