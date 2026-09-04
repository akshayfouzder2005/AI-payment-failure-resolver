"""
Payment upsert logic — Phase 2.

Kept separate from WebhookService (which orchestrates the full ingestion
pipeline: signature, idempotency, audit) so this class has exactly one
job: given a NormalizedPaymentEvent, decide what the Customer and Payment
rows should look like afterward.
"""
from app.config import get_settings
from app.models.customer import Customer
from app.models.merchant_settings import MerchantSettings
from app.models.payment import Payment
from app.repositories.customer_repository import CustomerRepository
from app.repositories.merchant_settings_repository import MerchantSettingsRepository
from app.repositories.payment_repository import PaymentRepository
from app.integrations.payment_provider.base import NormalizedPaymentEvent
from sqlalchemy.orm import Session


class PaymentService:
    def __init__(self, db: Session):
        self.db = db
        self.payment_repo = PaymentRepository(db)
        self.customer_repo = CustomerRepository(db)
        self.merchant_repo = MerchantSettingsRepository(db)

    def ensure_default_merchant(self) -> MerchantSettings:
        """
        Get-or-create the single-tenant MVP's one MerchantSettings row, so
        Payment.merchant_id (a real, enforced FK) always has something
        valid to point at without requiring manual setup before the first
        webhook can be demoed.
        """
        merchant_id = get_settings().default_merchant_id
        merchant = self.merchant_repo.get_by_merchant_id(merchant_id)
        if merchant is None:
            merchant = self.merchant_repo.add(MerchantSettings(merchant_id=merchant_id))
        return merchant

    def _resolve_customer(self, normalized: NormalizedPaymentEvent) -> Customer | None:
        if not (normalized.customer_external_id or normalized.customer_email):
            return None

        customer = None
        if normalized.customer_external_id:
            customer = self.customer_repo.get_by_external_id(normalized.customer_external_id)
        if customer is None and normalized.customer_email:
            customer = self.customer_repo.get_by_email(normalized.customer_email)
        if customer is None:
            customer = self.customer_repo.add(
                Customer(
                    external_id=normalized.customer_external_id,
                    email=normalized.customer_email,
                    name=normalized.customer_name,
                    phone=normalized.customer_phone,
                )
            )
        return customer

    def upsert_from_event(self, normalized: NormalizedPaymentEvent) -> Payment:
        merchant = self.ensure_default_merchant()
        customer = self._resolve_customer(normalized)

        payment = self.payment_repo.get_by_gateway_payment_id(
            normalized.gateway, normalized.gateway_payment_id
        )

        if payment is None:
            return self.payment_repo.add(
                Payment(
                    customer_id=customer.id if customer else None,
                    merchant_id=merchant.merchant_id,
                    gateway=normalized.gateway,
                    gateway_payment_id=normalized.gateway_payment_id,
                    amount=normalized.amount,
                    currency=normalized.currency,
                    status=normalized.status,
                    failure_code=normalized.failure_code,
                    failure_message=normalized.failure_message,
                    original_transaction_at=normalized.original_transaction_at,
                )
            )

        # Existing payment (e.g. this event survived a retry of processing,
        # or — per Razorpay's docs — webhooks aren't guaranteed to arrive in
        # order). Don't let a stale event overwrite more recent state.
        is_stale = (
            normalized.original_transaction_at is not None
            and payment.original_transaction_at is not None
            and normalized.original_transaction_at < payment.original_transaction_at
        )
        if not is_stale:
            payment.status = normalized.status
            payment.failure_code = normalized.failure_code
            payment.failure_message = normalized.failure_message
            payment.original_transaction_at = normalized.original_transaction_at
            if customer and payment.customer_id is None:
                payment.customer_id = customer.id
            self.payment_repo.add(payment)

        return payment
