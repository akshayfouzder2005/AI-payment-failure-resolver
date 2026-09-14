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

    Populated starting in Phase 5. `action_type` values match the five
    supported recovery actions (RETRY_PAYMENT, SEND_PAYMENT_LINK,
    SEND_NOTIFICATION, ESCALATE_TO_MERCHANT, NO_ACTION) and always reflect
    the policy engine's `final_action` — i.e. what actually got dispatched
    to an executor, which may differ from the AI's original recommendation
    when the engine modifies it.
    """

    __tablename__ = "recovery_attempts"

    payment_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("payments.id"), index=True, nullable=False
    )
    ai_decision_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ai_decisions.id"), index=True, nullable=True
    )

    action_type: Mapped[str] = mapped_column(String(50), nullable=False)
    attempt_number: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False,
        doc="1-indexed count of recovery attempts of any action type on this payment, oldest first.",
    )

    status: Mapped[str] = mapped_column(
        String(20), default="pending", index=True, nullable=False,
        doc=(
            "pending | in_progress | success | failed | skipped — see "
            "RecoveryAttemptStatus (app/enums.py). The policy engine's own "
            "verdict (approve/modify/reject/escalate) lives in "
            "`policy_decision` below, not here."
        ),
    )

    policy_decision: Mapped[str | None] = mapped_column(
        String(20), nullable=True, doc="approve | modify | reject | escalate"
    )
    policy_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, doc="Set when the executor is handed the action."
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, doc="Set when the executor returns (success, failure, or skip)."
    )
    result_message: Mapped[str | None] = mapped_column(
        Text, nullable=True, doc="Human-readable outcome, e.g. what a provider call did."
    )
    error_message: Mapped[str | None] = mapped_column(
        Text, nullable=True, doc="Populated only when status == failed; the provider/executor error."
    )
    external_reference: Mapped[str | None] = mapped_column(
        String(255), nullable=True, doc="e.g. gateway retry id, payment link id, or notification provider id"
    )

    payment: Mapped["Payment"] = relationship(back_populates="recovery_attempts")
