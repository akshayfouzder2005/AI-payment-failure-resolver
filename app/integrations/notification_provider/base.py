"""
Outbound customer/merchant messaging (Phase 5).

One interface for both SEND_NOTIFICATION (customer-facing) and
ESCALATE_TO_MERCHANT (merchant-facing) — they're the same underlying
operation ("deliver this message to this recipient over this channel"),
differing only in who receives it and why, which `recipient_type` and
`subject`/`message` already capture. Splitting them into two interfaces
would just duplicate the same three methods.

Only a mock implementation exists for Phase 5 (see mock_provider.py). A
real channel (email via SES/SendGrid, SMS via Twilio, etc.) is a genuine
external integration with its own documented API and credentials, and
none is configured for this hackathon — wiring one is a config +
provider-class addition here, not a redesign, once one is actually
needed.
"""
from abc import ABC, abstractmethod
from typing import Literal

from pydantic import BaseModel, ConfigDict


class NotificationRequest(BaseModel):
    recipient_type: Literal["customer", "merchant"]
    channel: Literal["email", "sms"]
    recipient_email: str | None = None
    recipient_phone: str | None = None
    subject: str
    message: str
    # Our RecoveryAttempt.id, for provider-side tracing back to our audit
    # trail — same purpose as RetryPaymentRequest.reference.
    reference: str

    model_config = ConfigDict(frozen=True)


class NotificationResult(BaseModel):
    success: bool
    provider_reference: str | None = None
    message: str

    model_config = ConfigDict(frozen=True)


class NotificationProvider(ABC):
    """
    Implementations must never raise for an ordinary delivery failure
    (that's `NotificationResult(success=False, ...)`) — only raise
    `app.exceptions.NotificationError` for something the executor cannot
    recover from itself (network failure, bad credentials, malformed
    response).
    """

    @abstractmethod
    def send(self, request: NotificationRequest) -> NotificationResult: ...
