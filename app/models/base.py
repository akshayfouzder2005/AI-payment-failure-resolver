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
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column


class UUIDPrimaryKeyMixin:
    """UUID primary key, generated in Python (no DB extension required)."""

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )


class TimestampMixin:
    """created_at / updated_at, managed by the database itself."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
