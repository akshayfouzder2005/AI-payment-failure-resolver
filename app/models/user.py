from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    A person who can log into RecoverAI — Phase 7 (auth). Belongs to
    exactly one Merchant; every merchant-scoped route derives its
    ownership filter from `current_user.merchant_id` (via
    app.api.deps.get_current_merchant_id), never from anything a client
    supplies directly in a query param or request body.

    `password_hash` is an Argon2 hash produced by app/security.py — never
    plaintext, and never returned by any API response (app/schemas/
    auth.py's UserRead excludes it by construction, not by after-the-fact
    filtering, so there is no response path that could accidentally leak
    it).
    """

    __tablename__ = "users"

    merchant_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("merchants.merchant_id"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    merchant: Mapped["Merchant"] = relationship(back_populates="users")
