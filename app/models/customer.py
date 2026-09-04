from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class Customer(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    A merchant's end customer. Deliberately minimal for the MVP — just
    enough identity/contact info to give the AI context and to let the
    executor send a notification or payment link.
    """

    __tablename__ = "customers"

    external_id: Mapped[str | None] = mapped_column(
        String(255), index=True, nullable=True, doc="Customer id from the payment gateway, if any"
    )
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    payments: Mapped[list["Payment"]] = relationship(back_populates="customer")
