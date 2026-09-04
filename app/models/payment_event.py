from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class PaymentEvent(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Raw log of every inbound webhook/payment event.

    This is the idempotency boundary for the whole system: the
    UniqueConstraint on (provider, event_id) means that if a gateway
    redelivers the same webhook (which all payment gateways do — retries on
    timeout are standard), the second insert raises IntegrityError and the
    webhook service treats it as a no-op instead of double-processing.

    `payment_id` is nullable because an event can arrive before we've
    decided whether/how to create or match a Payment row — the event is
    persisted first (source of truth for "we saw this"), then linked.
    """

    __tablename__ = "payment_events"
    __table_args__ = (
        UniqueConstraint("provider", "event_id", name="uq_payment_events_provider_event_id"),
    )

    provider: Mapped[str] = mapped_column(String(50), nullable=False, doc="e.g. 'razorpay'")
    event_id: Mapped[str] = mapped_column(String(255), nullable=False, doc="Provider's unique event/webhook id")
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, doc="e.g. 'payment.failed'")

    payment_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("payments.id"), index=True, nullable=True
    )

    payload: Mapped[dict] = mapped_column(JSON, nullable=False, doc="Full raw webhook payload, for audit/debug")

    processing_status: Mapped[str] = mapped_column(
        String(20), default="received", nullable=False, doc="received | processed | ignored | failed"
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    payment: Mapped["Payment"] = relationship(back_populates="events")
