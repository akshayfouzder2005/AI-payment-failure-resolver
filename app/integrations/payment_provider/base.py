"""
Payment provider adapter interface.

This is the seam the architectural rule in the project brief hangs off of:
webhook_service (and, later, the recovery executor) only ever talks to
`PaymentProviderAdapter`, never to a specific gateway's SDK or wire format
directly. Swapping or adding a gateway means writing one new adapter class,
not touching the service layer.

`NormalizedPaymentEvent` is the contract every adapter must produce. Its
field names deliberately mirror the Payment/Customer model columns
(`gateway_payment_id`, `failure_message`, `original_transaction_at`, ...)
so PaymentService's upsert logic is a near-direct field mapping rather than
a second layer of translation.
"""
from abc import ABC, abstractmethod
from datetime import datetime
from decimal import Decimal
from typing import Mapping

from pydantic import BaseModel


class NormalizedPaymentEvent(BaseModel):
    # Idempotency identity — matches PaymentEvent's (provider, event_id)
    # unique constraint exactly.
    provider: str
    event_id: str
    event_type: str

    # Matches Payment.gateway / Payment.gateway_payment_id.
    gateway: str
    gateway_payment_id: str

    amount: Decimal
    currency: str
    status: str

    failure_code: str | None = None
    failure_message: str | None = None

    customer_external_id: str | None = None
    customer_email: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None

    original_transaction_at: datetime | None = None

    # Full raw payload, preserved as-is on PaymentEvent.payload regardless
    # of what did/didn't make it into the normalized fields above — so
    # nothing the gateway sent is ever lost, even fields this MVP doesn't
    # promote to their own column yet (e.g. Razorpay's error_source/step).
    raw_payload: dict


class PaymentProviderAdapter(ABC):
    """One implementation per payment gateway (+ one for local simulation)."""

    @abstractmethod
    def validate_signature(self, raw_body: bytes, headers: Mapping[str, str]) -> bool:
        """
        Verify the request actually came from the provider.

        Must be checked against `raw_body` before any JSON parsing —
        parsing and re-serializing can change byte-for-byte content
        (key order, whitespace) and silently break signature validation.
        """
        ...

    @abstractmethod
    def parse_event(self, raw_body: bytes, headers: Mapping[str, str]) -> NormalizedPaymentEvent:
        """
        Turn a validated webhook request into the normalized contract.

        Takes `headers` as well as `raw_body` because some providers (e.g.
        Razorpay) carry the event's unique id in a header, not the body.

        Raises `app.exceptions.InvalidPayloadError` if the body doesn't
        match the shape this adapter expects.
        """
        ...
