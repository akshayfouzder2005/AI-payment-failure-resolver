from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class MerchantSettings(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Deterministic policy configuration, one row per merchant.

    The MVP runs as effectively single-tenant, but merchant_id is still a
    first-class field (rather than assuming one global config) so the
    policy engine already has a natural home for per-merchant limits
    without a future schema change. `merchant_id` is a plain application
    identifier — not tied to any gateway — so it works the same in tests,
    demos, and multi-merchant setups later.

    Phase 7 (auth): `merchant_id` is now a real FK into `merchants`
    (previously just UNIQUE, no FK) rather than an unconstrained string —
    see the Merchant model's docstring for why merchant_id is that
    table's primary key rather than a new UUID.
    """

    __tablename__ = "merchant_settings"

    merchant_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("merchants.merchant_id"), unique=True, index=True, nullable=False
    )

    max_retry_count: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    retry_delay_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)

    # Amounts above this are treated as high-risk by the policy engine
    # (e.g. auto-retry disallowed, escalation preferred).
    high_risk_amount_threshold: Mapped[float] = mapped_column(
        Numeric(12, 2), default=50000, nullable=False
    )

    # Number of prior failed attempts on the same payment before the
    # policy engine forces escalation regardless of AI recommendation.
    escalation_failure_threshold: Mapped[int] = mapped_column(Integer, default=2, nullable=False)

    auto_recovery_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
