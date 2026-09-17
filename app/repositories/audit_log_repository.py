import uuid

from sqlalchemy import and_, or_, select

from app.models.audit_log import AuditLog
from app.repositories.base import BaseRepository


class AuditLogRepository(BaseRepository[AuditLog]):
    model = AuditLog

    def list_for_entity(self, entity_type: str, entity_id: uuid.UUID) -> list[AuditLog]:
        """
        Uses the (entity_type, entity_id) index created for exactly this
        query — it's how a payment's audit timeline (surfaced in a later
        phase's UI) gets read back.
        """
        stmt = (
            select(AuditLog)
            .where(AuditLog.entity_type == entity_type, AuditLog.entity_id == entity_id)
            .order_by(AuditLog.created_at.asc())
        )
        return list(self.db.scalars(stmt).all())

    def list_for_entities(self, entity_ids_by_type: dict[str, list[uuid.UUID]]) -> list[AuditLog]:
        """
        The cross-entity variant of list_for_entity above — Phase 6.
        AuditService uses this to gather every audit row touching a
        single payment's full entity graph (the Payment row itself, plus
        every PaymentEvent / AIDecision / RecoveryAttempt that references
        it) in one query instead of N+1 separate list_for_entity calls.
        Entity types with an empty id list are skipped rather than
        producing an always-false `IN ()` clause.
        """
        conditions = [
            and_(AuditLog.entity_type == entity_type, AuditLog.entity_id.in_(ids))
            for entity_type, ids in entity_ids_by_type.items()
            if ids
        ]
        if not conditions:
            return []
        stmt = select(AuditLog).where(or_(*conditions)).order_by(AuditLog.created_at.asc())
        return list(self.db.scalars(stmt).all())
