"""
Local simulation adapter.

Lets the entire ingestion pipeline (signature step included, as a no-op)
be exercised and demoed through the exact same webhook_service code path
as a real Razorpay delivery, without any gateway account or credentials.
This is what /simulate/failed-payment (app/api/routes/simulate.py) uses.

The synthetic payload here is our own internal shape (amount already in
rupees, not paise) rather than a mimicked Razorpay wire format — it isn't
standing in for Razorpay's contract, just generating a normalizable event.
"""
import json
import random
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Mapping

from app.integrations.payment_provider.base import NormalizedPaymentEvent, PaymentProviderAdapter

_FAILURE_REASONS = [
    ("BAD_REQUEST_ERROR", "Insufficient funds in the customer's account"),
    ("GATEWAY_ERROR", "The card was declined by the issuing bank"),
    ("BAD_REQUEST_ERROR", "The card has expired"),
    ("GATEWAY_ERROR", "The customer did not complete the payment in time"),
]
_AMOUNTS = ["499.00", "999.00", "1499.00", "2499.00"]


class MockAdapter(PaymentProviderAdapter):
    def validate_signature(self, raw_body: bytes, headers: Mapping[str, str]) -> bool:
        return True  # nothing external signed this; there's nothing to check

    def parse_event(self, raw_body: bytes, headers: Mapping[str, str]) -> NormalizedPaymentEvent:
        data = json.loads(raw_body)
        return NormalizedPaymentEvent(
            provider="mock",
            event_id=data["event_id"],
            event_type=data["event_type"],
            gateway="mock",
            gateway_payment_id=data["gateway_payment_id"],
            amount=Decimal(data["amount"]),
            currency=data.get("currency", "INR"),
            status=data["status"],
            failure_code=data.get("failure_code"),
            failure_message=data.get("failure_message"),
            customer_email=data.get("customer_email"),
            customer_name=data.get("customer_name"),
            customer_phone=data.get("customer_phone"),
            original_transaction_at=datetime.now(timezone.utc),
            raw_payload=data,
        )

    def build_failed_payment_event(self, overrides: dict) -> bytes:
        """Build a synthetic payment.failed event, honoring any caller overrides."""
        rand_id = uuid.uuid4().hex[:12]
        failure_code, failure_message = random.choice(_FAILURE_REASONS)
        payload = {
            "event_id": f"evt_sim_{uuid.uuid4().hex}",
            "event_type": "payment.failed",
            "gateway_payment_id": f"pay_sim_{rand_id}",
            "amount": overrides.get("amount") or random.choice(_AMOUNTS),
            "currency": "INR",
            "status": "failed",
            "failure_code": overrides.get("failure_code") or failure_code,
            "failure_message": overrides.get("failure_message") or failure_message,
            "customer_email": overrides.get("customer_email") or f"customer_{rand_id[:6]}@example.com",
            "customer_name": overrides.get("customer_name") or "Test Customer",
            "customer_phone": overrides.get("customer_phone") or "+919800000000",
        }
        return json.dumps(payload).encode("utf-8")
