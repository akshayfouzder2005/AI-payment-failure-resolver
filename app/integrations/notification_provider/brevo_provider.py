"""
Real outbound Brevo client (email channel) — Phase 8.

Verified against Brevo's own docs before writing this, per the "never
invent external API behavior" rule (developers.brevo.com/reference/
send-transac-email):

- POST https://api.brevo.com/v3/smtp/email
- Authenticated with the `api-key` request header — Brevo's own scheme,
  not Basic Auth or a Bearer token.
- Body requires `sender` ({name, email} — must be a sender verified in
  the Brevo account under Senders, Domains & Dedicated IPs, or the API
  rejects the send even with a valid key) and `to` (a list of
  {email, name}); one of `htmlContent`/`textContent`/`templateId`
  carries the message body — this MVP always sends plain text.
- A successful call returns 201 with {"messageId": "..."}.

Untested against the live API in this codebase (see
scripts/verify_notifications_live.py for a standalone script that does
hit the real API, kept outside pytest per this project's convention) —
tests instead monkeypatch httpx.post, the same pattern
test_payment_gateway_client.py uses for RazorpayGatewayClient.
"""
import httpx

from app.exceptions import NotificationError
from app.integrations.notification_provider.base import (
    NotificationProvider,
    NotificationRequest,
    NotificationResult,
)

_BASE_URL = "https://api.brevo.com/v3/smtp/email"


class BrevoEmailProvider(NotificationProvider):
    def __init__(
        self,
        api_key: str,
        sender_email: str,
        sender_name: str = "Revenue Recovery Agent",
        timeout_seconds: float = 15.0,
    ):
        if not api_key or not sender_email:
            raise NotificationError(
                "BREVO_API_KEY / BREVO_SENDER_EMAIL are not configured — "
                "set both, or use NOTIFICATION_PROVIDER=mock."
            )
        self._api_key = api_key
        self._sender_email = sender_email
        self._sender_name = sender_name
        self._timeout = timeout_seconds

    def send(self, request: NotificationRequest) -> NotificationResult:
        # A channel mismatch means the caller (LiveNotificationProvider)
        # routed wrong — a bug, not an ordinary delivery failure — so
        # this raises rather than returning success=False. Same
        # reasoning as PaymentGatewayClient's "non-2xx status" bucket
        # below.
        if request.channel != "email":
            raise NotificationError(
                f"BrevoEmailProvider only handles channel='email', got {request.channel!r}."
            )
        if not request.recipient_email:
            return NotificationResult(
                success=False,
                message=f"No email address on file for {request.recipient_type} recipient.",
            )

        payload = {
            "sender": {"name": self._sender_name, "email": self._sender_email},
            "to": [{"email": request.recipient_email}],
            "subject": request.subject,
            "textContent": request.message,
            # Brevo's send-email endpoint has no reference/idempotency
            # field of its own (unlike Razorpay's reference_id) — a
            # custom header is the closest equivalent for tracing a
            # delivery back to our RecoveryAttempt.
            "headers": {"X-Recovery-Attempt-Reference": request.reference},
        }

        try:
            response = httpx.post(
                _BASE_URL,
                json=payload,
                headers={
                    "api-key": self._api_key,
                    "accept": "application/json",
                    "content-type": "application/json",
                },
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise NotificationError(f"Brevo request failed: {exc}") from exc

        if response.status_code >= 400:
            raise NotificationError(
                f"Brevo returned {response.status_code} sending email: {response.text}"
            )

        data = response.json()
        return NotificationResult(
            success=True,
            provider_reference=data.get("messageId"),
            message=f"Email sent to {request.recipient_email} via Brevo.",
        )
