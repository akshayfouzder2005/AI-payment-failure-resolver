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
        retry after three have already failed. Always returns an empty
        list until the executor (Phase 5) starts writing rows here; the
        query is added now so the context shape is stable from the start.
        """
        stmt = (
            select(RecoveryAttempt)
            .where(RecoveryAttempt.payment_id == payment_id)
            .order_by(RecoveryAttempt.created_at.asc())
        )
        return list(self.db.scalars(stmt).all())
