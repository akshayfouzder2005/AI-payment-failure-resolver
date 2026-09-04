"""
Razorpay webhook adapter.

Signature scheme and idempotency mechanism verified against Razorpay's
official docs (razorpay.com/docs/webhooks/validate-test/) rather than
assumed:

- Signature: HMAC-SHA256, keyed with the dashboard webhook secret, over
  the RAW request body, hex-encoded, sent in the `X-Razorpay-Signature`
  header. Their docs explicitly warn: "Do not parse or cast the webhook
  request body" before computing it.
- Idempotency: "You can identify the duplicate webhooks using the
  x-razorpay-event-id header. The value for this header is unique per
  event." That header is what we key PaymentEvent's (provider, event_id)
  uniqueness on — not a value pulled from the payload itself.
- Delivery: a non-2xx response is treated as a delivery failure and
  retried with exponential backoff for 24 hours — informs why
  webhook_service always returns 2xx once an event is durably stored,
  even if downstream processing of it then fails.
- Ordering: events are not guaranteed to arrive in the order they
  occurred — informs the out-of-order guard in PaymentService.
"""
import hashlib
import hmac
import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Mapping

from pydantic import BaseModel, ConfigDict, ValidationError

from app.exceptions import InvalidPayloadError
from app.integrations.payment_provider.base import NormalizedPaymentEvent, PaymentProviderAdapter

# Razorpay payment.entity.status -> our Payment.status vocabulary.
# Phase 2 only acts on "failed" (see webhook_service); other statuses are
# accepted and normalized here so parsing never fails, but the service
# decides what, if anything, to do with them.
_STATUS_MAP = {
    "failed": "failed",
    "captured": "captured",
    "authorized": "authorized",
}


class _RazorpayPaymentEntity(BaseModel):
    """Only the fields this MVP needs; unknown fields are ignored, not rejected."""

    id: str
    amount: int  # paise (smallest currency unit) per Razorpay convention
    currency: str
    status: str
    order_id: str | None = None
    method: str | None = None
    email: str | None = None
    contact: str | None = None
    error_code: str | None = None
    error_description: str | None = None
    created_at: int  # unix timestamp

    model_config = ConfigDict(extra="ignore")


class _RazorpayPayload(BaseModel):
    payment: dict  # narrowed to {"entity": _RazorpayPaymentEntity} below


class _RazorpayEnvelope(BaseModel):
    event: str
    payload: _RazorpayPayload
    created_at: int

    model_config = ConfigDict(extra="ignore")


class RazorpayAdapter(PaymentProviderAdapter):
    def __init__(self, webhook_secret: str):
        self.webhook_secret = webhook_secret

    def validate_signature(self, raw_body: bytes, headers: Mapping[str, str]) -> bool:
        signature = headers.get("x-razorpay-signature")
        if not signature or not self.webhook_secret:
            return False
        expected = hmac.new(
            key=self.webhook_secret.encode("utf-8"),
            msg=raw_body,
            digestmod=hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    def parse_event(self, raw_body: bytes, headers: Mapping[str, str]) -> NormalizedPaymentEvent:
        try:
            data = json.loads(raw_body)
            envelope = _RazorpayEnvelope.model_validate(data)
            entity = _RazorpayPaymentEntity.model_validate(envelope.payload.payment["entity"])
        except (json.JSONDecodeError, ValidationError, KeyError, TypeError) as exc:
            raise InvalidPayloadError(f"Malformed Razorpay webhook payload: {exc}") from exc

        event_id = headers.get("x-razorpay-event-id")
        if not event_id:
            # Defensive fallback only — Razorpay's docs say this header is
            # always present and unique per event. If it's ever missing,
            # dedupe on content instead of silently accepting an event we
            # can't actually deduplicate.
            event_id = f"sha256:{hashlib.sha256(raw_body).hexdigest()}"

        return NormalizedPaymentEvent(
            provider="razorpay",
            event_id=event_id,
            event_type=envelope.event,
            gateway="razorpay",
            gateway_payment_id=entity.id,
            amount=(Decimal(entity.amount) / Decimal(100)),
            currency=entity.currency,
            status=_STATUS_MAP.get(entity.status, entity.status),
            failure_code=entity.error_code,
            failure_message=entity.error_description,
            customer_email=entity.email,
            customer_phone=entity.contact,
            original_transaction_at=datetime.fromtimestamp(entity.created_at, tz=timezone.utc),
            raw_payload=data,
        )
