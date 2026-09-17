"""
Schemas for the audit-trail endpoints — Phase 6.
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuditLogRead(BaseModel):
    id: UUID
    entity_type: str
    entity_id: UUID
    action: str
    actor: str
    details: dict | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
