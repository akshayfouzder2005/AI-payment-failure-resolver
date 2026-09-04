from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class RecoveryAttempt(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    One recovery action taken (or attempted) on a payment.

    A row is created here even when the policy engine rejects or modifies
    the AI's recommendation — `policy_decision` and `policy_reason` record
    that outcome, so "the AI recommended X but the system did Y and why"
    is always reconstructable from this table alone.

    Populated starting in Phase 4/5. `action_type` values match the five
    supported recovery actions (RETRY_PAYMENT, SEND_PAYMENT_LINK,
    SEND_NOTIFICATION, ESCALATE_TO_MERCHANT, NO_ACTION).
    """

    __tablename__ = "recovery_attempts"

    payment_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("payments.id"), index=True, nullable=False
    )
    ai_decision_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ai_decisions.id"), index=True, nullable=True
    )

    action_type: Mapped[str] = mapped_column(String(50), nullable=False)
    attempt_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    status: Mapped[str] = mapped_column(
        String(20), default="pending", index=True, nullable=False,
        doc="pending | in_progress | success | failed | skipped | rejected_by_policy",
    )

    policy_decision: Mapped[str | None] = mapped_column(
        String(20), nullable=True, doc="approved | modified | rejected | escalated"
    )
    policy_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    external_reference: Mapped[str | None] = mapped_column(
        String(255), nullable=True, doc="e.g. gateway retry id or payment link id"
    )

    payment: Mapped["Payment"] = relationship(back_populates="recovery_attempts")
