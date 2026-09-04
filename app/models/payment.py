from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class Payment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    A single payment/transaction as known to the recovery agent.

    `status` is intentionally a free-form string validated at the app layer
    (see app/models/base.py for why). Expected values for the MVP:
    "failed", "retry_scheduled", "recovered", "escalated", "abandoned".

    `gateway_payment_id` + `gateway` uniquely identify the transaction at
    the source system and are what webhook events key off of.
    """

    __tablename__ = "payments"

    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("customers.id"), index=True, nullable=True
    )
    merchant_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("merchant_settings.merchant_id"), index=True, nullable=False
    )

    gateway: Mapped[str] = mapped_column(String(50), nullable=False)
    gateway_payment_id: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)

    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="INR", nullable=False)

    status: Mapped[str] = mapped_column(String(30), default="failed", index=True, nullable=False)

    failure_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    failure_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    original_transaction_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, doc="When the payment was originally attempted at the gateway"
    )

    customer: Mapped["Customer"] = relationship(back_populates="payments")
    events: Mapped[list["PaymentEvent"]] = relationship(back_populates="payment")
    recovery_attempts: Mapped[list["RecoveryAttempt"]] = relationship(back_populates="payment")
    ai_decisions: Mapped[list["AIDecision"]] = relationship(back_populates="payment")
