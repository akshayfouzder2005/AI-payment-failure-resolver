"""
Shared model mixins.

Design decision: statuses/enums (PaymentStatus, ActionType, etc.) are stored
as plain `String` columns rather than native Postgres ENUM types. Postgres
enums require an explicit ALTER TYPE migration every time a value is added,
which is exactly the kind of migration friction a fast-moving hackathon
project shouldn't be fighting. Validity is enforced at the application layer
(Python Enum classes in app/schemas), not the database layer. This trades a
small amount of DB-level strictness for significantly simpler migrations —
an acceptable and reversible tradeoff for an MVP.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column


class UUIDPrimaryKeyMixin:
    """UUID primary key, generated in Python (no DB extension required)."""

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )


class TimestampMixin:
    """
    created_at / updated_at, managed by the database itself.

    created_at is given an explicit Python-side `default` (found during
    post-Phase-7 backend verification), not just `server_default=func.now()`
    alone — the same fix AuditLog.created_at already needed and got in
    Phase 6, generalized here for every other timestamped model. Postgres's
    now() returns the SAME value for every statement inside one
    transaction: the seed script inserts many rows of one model before
    its single commit(), and so does any endpoint or test that creates
    several rows before committing — both would otherwise make those
    rows indistinguishable in time and silently break any "newest
    first"/chronological ordering (e.g. GET /payments). A callable
    `default` is evaluated per-row at flush time, so ordering reflects
    real call order even within one transaction. `server_default` is
    left in place too, as a DB-level fallback for any row ever inserted
    outside the ORM.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

