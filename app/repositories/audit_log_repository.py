import uuid

from sqlalchemy import select

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
