"""
Aggregate read-side queries for the metrics layer — Phase 6.

Not a BaseRepository subclass: BaseRepository is keyed to exactly one ORM
model (see its docstring), and every query here spans at least Payment +
RecoveryAttempt. Kept here regardless, not inline in MetricsService, for
the same reason every other repository exists — "repositories are the
only layer allowed to construct SQLAlchemy queries" (app/repositories/
base.py's docstring). MetricsService composes these already-aggregated
numbers into rates and definitions; it builds no SQL of its own.

Every method accepts an optional merchant_id filter. The MVP is
single-tenant in practice (see MerchantSettings' docstring), but Payment
already carries a real, FK-enforced merchant_id column, so filtering
costs one WHERE/JOIN clause here and keeps this layer honest about not
silently assuming a single merchant forever.
"""
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.payment import Payment
from app.models.recovery_attempt import RecoveryAttempt


class MetricsRepository:
    def __init__(self, db: Session):
        self.db = db

    def count_payments(self, merchant_id: str | None = None) -> int:
        stmt = select(func.count(Payment.id))
        if merchant_id:
            stmt = stmt.where(Payment.merchant_id == merchant_id)
        return self.db.scalar(stmt) or 0

    def count_payments_by_statuses(self, statuses: list[str], merchant_id: str | None = None) -> int:
        stmt = select(func.count(Payment.id)).where(Payment.status.in_(statuses))
        if merchant_id:
            stmt = stmt.where(Payment.merchant_id == merchant_id)
        return self.db.scalar(stmt) or 0

    def sum_amount_by_statuses(self, statuses: list[str], merchant_id: str | None = None) -> Decimal:
        stmt = select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.status.in_(statuses))
        if merchant_id:
            stmt = stmt.where(Payment.merchant_id == merchant_id)
        result = self.db.scalar(stmt)
        return Decimal(result) if result is not None else Decimal("0")

    def count_recovery_attempts_by_status(
        self, statuses: list[str], merchant_id: str | None = None
    ) -> int:
        stmt = select(func.count(RecoveryAttempt.id)).where(RecoveryAttempt.status.in_(statuses))
        if merchant_id:
            stmt = stmt.join(Payment, Payment.id == RecoveryAttempt.payment_id).where(
                Payment.merchant_id == merchant_id
            )
        return self.db.scalar(stmt) or 0

    def count_distinct_payments_with_successful_action(
        self, action_type: str, merchant_id: str | None = None
    ) -> int:
        stmt = select(func.count(func.distinct(RecoveryAttempt.payment_id))).where(
            RecoveryAttempt.action_type == action_type, RecoveryAttempt.status == "success"
        )
        if merchant_id:
            stmt = stmt.join(Payment, Payment.id == RecoveryAttempt.payment_id).where(
                Payment.merchant_id == merchant_id
            )
        return self.db.scalar(stmt) or 0

    def successful_recovery_durations(
        self, action_types: list[str], merchant_id: str | None = None
    ) -> list[tuple]:
        """
        Returns (payment.created_at, recovery_attempt.completed_at) pairs
        for every successful attempt of the given action type(s), so
        MetricsService can compute an average duration in plain Python
        rather than fighting Postgres INTERVAL-vs-numeric semantics for a
        single-purpose average. completed_at is expected to be non-null
        for status='success' — RecoveryExecutionService always sets it
        right before setting status (see its execute_recovery()) — but
        this query filters on it explicitly rather than trusting that
        invariant blindly: a single malformed row must never crash the
        whole /metrics/summary endpoint with a TypeError.
        """
        stmt = (
            select(Payment.created_at, RecoveryAttempt.completed_at)
            .join(Payment, Payment.id == RecoveryAttempt.payment_id)
            .where(
                RecoveryAttempt.action_type.in_(action_types),
                RecoveryAttempt.status == "success",
                RecoveryAttempt.completed_at.isnot(None),
            )
        )
        if merchant_id:
            stmt = stmt.where(Payment.merchant_id == merchant_id)
        return list(self.db.execute(stmt).all())
