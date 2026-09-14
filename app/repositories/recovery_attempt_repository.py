import uuid

from sqlalchemy import select

from app.models.recovery_attempt import RecoveryAttempt
from app.repositories.base import BaseRepository


class RecoveryAttemptRepository(BaseRepository[RecoveryAttempt]):
    model = RecoveryAttempt

    def list_for_payment(self, payment_id: uuid.UUID) -> list[RecoveryAttempt]:
        """
        Introduced in Phase 3 for ContextBuilder — the AI is given a
        payment's recovery history so it doesn't, say, recommend another
        retry after three have already failed. Was always empty until
        Phase 5 started writing rows here; now also used by
        PolicyInputBuilder to compute RetryHistory and by
        RecoveryExecutionService to number attempts.
        """
        stmt = (
            select(RecoveryAttempt)
            .where(RecoveryAttempt.payment_id == payment_id)
            .order_by(RecoveryAttempt.created_at.asc())
        )
        return list(self.db.scalars(stmt).all())

    def get_latest_for_ai_decision(self, ai_decision_id: uuid.UUID) -> RecoveryAttempt | None:
        """
        Backs RecoveryExecutionService's idempotency check (Phase 5): if a
        SUCCESS attempt already exists for this exact AI decision, a
        repeat call to execute recovery for it is a no-op rather than a
        second real action. Only the most recent attempt matters here —
        a decision can only be legitimately re-attempted after a prior
        FAILED one, never re-run after a SUCCESS.
        """
        stmt = (
            select(RecoveryAttempt)
            .where(RecoveryAttempt.ai_decision_id == ai_decision_id)
            .order_by(RecoveryAttempt.created_at.desc())
            .limit(1)
        )
        return self.db.scalars(stmt).first()
