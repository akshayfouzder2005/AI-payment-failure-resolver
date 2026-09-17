from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Index, String, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import UUIDPrimaryKeyMixin


class AuditLog(Base, UUIDPrimaryKeyMixin):
    """
    Immutable, append-only audit trail. Deliberately has no `updated_at`
    (uses UUIDPrimaryKeyMixin, not TimestampMixin) — audit entries are
    never edited, only ever inserted.

    `entity_type` + `entity_id` is a polymorphic reference (no FK
    constraint) so a single audit table can log against payments,
    recovery attempts, AI decisions, etc. without a join table per type.
    This is a deliberate, common tradeoff: we lose DB-level referential
    integrity on this table in exchange for one simple, queryable log
    instead of N audit tables.

    `created_at` is given an explicit Python-side `default` (Phase 6), not
    just the `server_default=func.now()` every other timestamped model
    uses. Postgres's `now()` returns the SAME value for every statement
    inside one transaction — several service methods add more than one
    AuditLog row before their single `commit()`, which would otherwise
    make those rows indistinguishable in time and defeat chronological
    reconstruction (the whole point of this table). A callable `default`
    is evaluated per-row at flush time, so ordering reflects real call
    order even within one transaction. `server_default` is left in place
    too, as a DB-level fallback for any row ever inserted outside the ORM.
    """

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_entity_type_entity_id", "entity_type", "entity_id"),
    )

    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, doc="e.g. 'payment', 'recovery_attempt'")
    entity_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)

    action: Mapped[str] = mapped_column(String(100), nullable=False, doc="e.g. 'ai_decision_created'")
    actor: Mapped[str] = mapped_column(
        String(50), nullable=False, doc="system | ai_engine | policy_engine | executor | user"
    )
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
