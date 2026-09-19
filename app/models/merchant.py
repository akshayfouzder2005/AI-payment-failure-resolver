from __future__ import annotations

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin


class Merchant(Base, TimestampMixin):
    """
    A tenant of this system — one row per business using the recovery
    agent. Phase 7 (auth) introduces this table to give `merchant_id`
    (previously just a free-floating string convention shared by
    MerchantSettings/Payment — see MerchantSettings' docstring) a real,
    first-class identity: a name, an active flag, and a proper FK target
    for MerchantSettings and the new User table.

    Deliberately does NOT use UUIDPrimaryKeyMixin like every other model.
    `merchant_id` (a plain string) is already the identifier every
    existing table keys off of (MerchantSettings.merchant_id, unique;
    Payment.merchant_id, FK'd to it). Introducing a second, UUID-typed
    `id` here would mean either a confusing second identity for the same
    concept, or a migration touching every existing merchant_id column —
    neither of which this MVP's ownership layer needs. Reusing the string
    as the primary key keeps this a pure additive change (see the 0003
    migration): every existing merchant_id value just starts pointing at
    a real row instead of being an unconstrained string.
    """

    __tablename__ = "merchants"

    merchant_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    users: Mapped[list["User"]] = relationship(back_populates="merchant")
