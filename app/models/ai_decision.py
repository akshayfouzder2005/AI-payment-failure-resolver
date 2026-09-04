from __future__ import annotations

import uuid

from sqlalchemy import JSON, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class AIDecision(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    A single AI diagnosis + recommendation for a payment.

    This table is append-only by design: every AI call — even ones later
    overridden or rejected by the policy engine — is persisted here for
    auditability. `raw_response` keeps the full, unmodified JSON returned
    by the model, separate from the parsed/validated fields, so we can
    always trace exactly what the model said versus what we acted on.

    Populated starting in Phase 3. The table exists now so the schema and
    relationships are stable from the start.
    """

    __tablename__ = "ai_decisions"

    payment_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("payments.id"), index=True, nullable=False
    )

    model_name: Mapped[str] = mapped_column(String(100), nullable=False)

    failure_category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    root_cause: Mapped[str | None] = mapped_column(Text, nullable=True)
    recovery_probability: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)
    recommended_action: Mapped[str | None] = mapped_column(String(50), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    risk_factors: Mapped[list | None] = mapped_column(JSON, nullable=True)

    raw_response: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    payment: Mapped["Payment"] = relationship(back_populates="ai_decisions")
