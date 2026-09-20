import uuid

from sqlalchemy import select

from app.models.payment import Payment
from app.repositories.base import BaseRepository


class PaymentRepository(BaseRepository[Payment]):
    model = Payment

    def get_by_gateway_payment_id(self, gateway: str, gateway_payment_id: str) -> Payment | None:
        stmt = select(Payment).where(
            Payment.gateway == gateway,
            Payment.gateway_payment_id == gateway_payment_id,
        )
        return self.db.scalars(stmt).first()

    def list_by_status(self, status: str, limit: int = 100, offset: int = 0) -> list[Payment]:
        stmt = select(Payment).where(Payment.status == status).limit(limit).offset(offset)
        return list(self.db.scalars(stmt).all())

    def list_by_customer_id(self, customer_id: uuid.UUID) -> list[Payment]:
        """
        Phase 3: ContextBuilder uses this to summarize a customer's
        payment/failure history for the AI. No limit/offset — the MVP's
        customers don't have payment volumes where this matters, and an
        accurate count is more useful here than a paginated one.
        """
        stmt = select(Payment).where(Payment.customer_id == customer_id)
        return list(self.db.scalars(stmt).all())

    def list_for_merchant(
        self,
        merchant_id: str,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Payment]:
        """
        Merchant-scoped payment list — backs GET /payments. Newest first
        (created_at desc): the Payments screen's job is surfacing recent
        failures needing attention, not a stable historical archive
        order. Optional status filter (e.g. "failed") narrows to
        payments still needing action; omit it to see the full history.
        merchant_id is baked into the WHERE clause (never filtered
        client-side), the same scoping guarantee get_by_id_for_merchant
        below gives a single lookup.
        """
        stmt = select(Payment).where(Payment.merchant_id == merchant_id)
        if status is not None:
            stmt = stmt.where(Payment.status == status)
        stmt = stmt.order_by(Payment.created_at.desc()).limit(limit).offset(offset)
        return list(self.db.scalars(stmt).all())

    def get_by_id_for_merchant(self, payment_id: uuid.UUID, merchant_id: str) -> Payment | None:
        """
        Merchant-scoped lookup — Phase 7 (auth). Returns None both when
        the payment doesn't exist at all AND when it exists but belongs
        to a different merchant, so a caller gets the exact same result
        either way — no observable difference between "not found" and
        "not yours", which is what keeps a merchant from being able to
        probe for another merchant's payment ids.
        """
        payment = self.get_by_id(payment_id)
        if payment is None or payment.merchant_id != merchant_id:
            return None
        return payment

