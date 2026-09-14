"""
Outbound payment-gateway integration (Phase 5).

Deliberately a *separate* package from app.integrations.payment_provider
(Phase 2), even though both ultimately talk to Razorpay, because the two
solve unrelated problems:

- payment_provider is INBOUND: validating and parsing webhooks Razorpay
  sends us. It never makes an outbound API call.
- payment_gateway_client is OUTBOUND: RecoveryActionExecutors calling
  Razorpay's API to retry a payment or create a payment link. It never
  touches a webhook.

Conflating them behind one interface would mean a "payment provider"
abstraction with half its methods only meaningful for inbound traffic and
half only for outbound — worse than two small, honest interfaces.

IMPORTANT — verified against Razorpay's own docs, not guessed: there is
no API endpoint to "retry" an already-failed one-time checkout payment.
Razorpay's documented retry patterns are (a) reusing the same order_id
for a fresh, customer-driven checkout attempt, or (b) for Subscriptions/
e-mandates, an invoice recharge — neither is a single server-side "retry
this payment" call. `retry_payment()` below is defined with that
constraint in mind: implementations are expected to generate a fresh
payment attempt (in practice, a Payment Link) rather than pretend a
direct retry endpoint exists.
"""
from abc import ABC, abstractmethod
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class RetryPaymentRequest(BaseModel):
    gateway_payment_id: str
    amount: Decimal
    currency: str
    customer_name: str | None = None
    customer_email: str | None = None
    customer_phone: str | None = None
    # Our RecoveryAttempt.id, passed through so a provider that supports
    # a reference/idempotency field can be traced back to our own audit
    # trail without a second lookup.
    reference: str

    model_config = ConfigDict(frozen=True)


class PaymentLinkRequest(BaseModel):
    amount: Decimal
    currency: str
    description: str
    customer_name: str | None = None
    customer_email: str | None = None
    customer_phone: str | None = None
    reference: str

    model_config = ConfigDict(frozen=True)


class GatewayActionResult(BaseModel):
    """
    What a PaymentGatewayClient call returns on a completed (2xx) request.
    `success` is the gateway's own verdict on the action, independent of
    whether the HTTP call itself succeeded — a non-2xx HTTP response is a
    PaymentGatewayError instead (see below), not a GatewayActionResult
    with success=False.
    """

    success: bool
    provider_reference: str | None = None
    message: str
    raw_response: dict | None = None

    model_config = ConfigDict(frozen=True)


class PaymentGatewayClient(ABC):
    """
    Outbound gateway actions a RecoveryActionExecutor can trigger.
    Implementations must never raise for an ordinary business-level
    decline (that's `GatewayActionResult(success=False, ...)`) — they
    should only raise `app.exceptions.PaymentGatewayError` for things the
    executor genuinely cannot recover from itself (network failure, bad
    credentials, malformed response, non-2xx status).
    """

    @abstractmethod
    def retry_payment(self, request: RetryPaymentRequest) -> GatewayActionResult: ...

    @abstractmethod
    def create_payment_link(self, request: PaymentLinkRequest) -> GatewayActionResult: ...
