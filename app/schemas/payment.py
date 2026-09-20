"""
Schemas for the Payments API — GET /payments (list) and
GET /payments/{payment_id} (detail).

Added post-Phase-7 during backend verification: every other
payment_id-keyed route (ai-decisions, recovery, audit) assumes the
caller already has a payment_id in hand. These two schemas back the
routes that let a frontend get one in the first place. Mirrors
AIDecisionRead/RecoveryAttemptRead's shape (from_attributes=True, direct
model_validate off the ORM row).
"""
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class CustomerSummary(BaseModel):
    """Minimal customer context for a payment list/detail row — not the full Customer record."""

    id: UUID
    name: str | None
    email: str | None
    phone: str | None

    model_config = ConfigDict(from_attributes=True)


class PaymentRead(BaseModel):
    """
    API-facing representation of a Payment row. Used for both the list
    endpoint's items and the detail endpoint's single response — same
    shape either way, same pattern AIDecisionRead already uses across
    its list and detail routes.
    """

    id: UUID
    merchant_id: str
    customer: CustomerSummary | None
    gateway: str
    gateway_payment_id: str
    amount: Decimal
    currency: str
    status: str
    failure_code: str | None
    failure_message: str | None
    original_transaction_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

