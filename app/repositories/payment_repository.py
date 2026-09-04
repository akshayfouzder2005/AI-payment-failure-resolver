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
