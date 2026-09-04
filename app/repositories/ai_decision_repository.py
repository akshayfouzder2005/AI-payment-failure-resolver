import uuid

from sqlalchemy import select

from app.models.ai_decision import AIDecision
from app.repositories.base import BaseRepository


class AIDecisionRepository(BaseRepository[AIDecision]):
    model = AIDecision

    def list_for_payment(self, payment_id: uuid.UUID) -> list[AIDecision]:
        """
        AIDecision is append-only (see its model docstring) — every call
        to AIDecisionService.diagnose_payment() adds a new row rather than
        updating one, so this can return more than one decision per
        payment. Ordered oldest-first to read like a timeline.
        """
        stmt = (
            select(AIDecision)
            .where(AIDecision.payment_id == payment_id)
            .order_by(AIDecision.created_at.asc())
        )
        return list(self.db.scalars(stmt).all())

    def get_latest_for_payment(self, payment_id: uuid.UUID) -> AIDecision | None:
        """
        What the policy engine (Phase 4) will read: the most recent
        decision is the one that should currently be acted on.
        """
        stmt = (
            select(AIDecision)
            .where(AIDecision.payment_id == payment_id)
            .order_by(AIDecision.created_at.desc())
            .limit(1)
        )
        return self.db.scalars(stmt).first()
