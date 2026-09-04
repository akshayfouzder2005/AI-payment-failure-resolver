"""
API-facing schemas for Phase 2's ingestion endpoints
(app/api/routes/webhooks.py, app/api/routes/simulate.py).

Not to be confused with NormalizedPaymentEvent (app/integrations/
payment_provider/base.py), which is the internal adapter<->service
contract, not something a caller sends or receives over HTTP.
"""
import uuid
from typing import Literal

from pydantic import BaseModel


class SimulateFailedPaymentRequest(BaseModel):
    """All fields optional — POST an empty body to get a fully random failed payment."""

    amount: str | None = None  # e.g. "999.00"; string so callers don't need to know Decimal
    customer_email: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    failure_code: str | None = None
    failure_message: str | None = None


class WebhookIngestResult(BaseModel):
    status: Literal["processed", "duplicate", "ignored", "processing_failed"]
    payment_event_id: uuid.UUID
    payment_id: uuid.UUID | None = None
    payment_status: str | None = None
    payment_summary: dict | None = None
    detail: str | None = None
