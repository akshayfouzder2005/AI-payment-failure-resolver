"""
Real outbound Razorpay client (Phase 5).

Verified against Razorpay's own docs before writing this, per the "never
invent external API behavior" rule:

- Payment Links API (razorpay.com/docs/api/payments/payment-links/):
  POST /v1/payment_links, authenticated with HTTP Basic Auth using the
  account's key_id/key_secret, body takes amount (in the smallest
  currency unit — paise for INR), currency, description, an optional
  customer{name,email,contact} object, and an optional reference_id.
  This is real and documented, and is what create_payment_link() below
  calls directly.

- There is no documented endpoint to retry a specific already-failed
  one-time checkout payment. Razorpay's own supported patterns are
  reusing the same order_id for a fresh customer-driven checkout
  attempt, or (Subscriptions/e-mandates only) an invoice recharge —
  neither is a single server-side "retry this payment" call. Rather than
  invent one, retry_payment() below is honest about this: it creates a
  fresh Payment Link for the same amount so the customer can complete
  the retry themselves. In real mode, RETRY_PAYMENT and
  SEND_PAYMENT_LINK therefore hit the same underlying Razorpay API —
  they remain distinct at the RecoveryAttempt/audit level (different
  action_type, different policy reasoning for why one was chosen over
  the other), which is what actually matters for the audit trail.

Untested against the live API in this codebase (no real credentials are
configured for a hackathon) — tests instead monkeypatch httpx.post, the
same pattern test_anthropic_provider.py uses for the real LLM provider.
"""
import httpx

from app.exceptions import PaymentGatewayError
from app.integrations.payment_gateway_client.base import (
    GatewayActionResult,
    PaymentGatewayClient,
    PaymentLinkRequest,
    RetryPaymentRequest,
)

_BASE_URL = "https://api.razorpay.com/v1"


class RazorpayGatewayClient(PaymentGatewayClient):
    def __init__(self, key_id: str, key_secret: str, timeout_seconds: float = 15.0):
        if not key_id or not key_secret:
            raise PaymentGatewayError(
                "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not configured — "
                "set both, or use RECOVERY_GATEWAY_PROVIDER=mock."
            )
        self._auth = (key_id, key_secret)
        self._timeout = timeout_seconds

    def retry_payment(self, request: RetryPaymentRequest) -> GatewayActionResult:
        # See module docstring: no direct "retry" endpoint exists, so this
        # delegates to the real Payment Links API instead of pretending
        # otherwise.
        link_request = PaymentLinkRequest(
            amount=request.amount,
            currency=request.currency,
            description=f"Retry of payment {request.gateway_payment_id}",
            customer_name=request.customer_name,
            customer_email=request.customer_email,
            customer_phone=request.customer_phone,
            reference=request.reference,
        )
        return self.create_payment_link(link_request)

    def create_payment_link(self, request: PaymentLinkRequest) -> GatewayActionResult:
        customer = {
            key: value
            for key, value in {
                "name": request.customer_name,
                "email": request.customer_email,
                "contact": request.customer_phone,
            }.items()
            if value
        }
        payload: dict = {
            # Razorpay amounts are always in the currency's smallest unit
            # (paise for INR) — same convention the inbound webhook
            # adapter already assumes (see payment_provider/base.py).
            "amount": int(request.amount * 100),
            "currency": request.currency,
            "description": request.description,
            "reference_id": request.reference,
        }
        if customer:
            payload["customer"] = customer

        try:
            response = httpx.post(
                f"{_BASE_URL}/payment_links",
                json=payload,
                auth=self._auth,
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise PaymentGatewayError(f"Razorpay request failed: {exc}") from exc

        if response.status_code >= 400:
            raise PaymentGatewayError(
                f"Razorpay returned {response.status_code} creating a payment link: {response.text}"
            )

        data = response.json()
        return GatewayActionResult(
            success=True,
            provider_reference=data.get("id"),
            message=f"Payment link created: {data.get('short_url', '(no url returned)')}",
            raw_response=data,
        )
