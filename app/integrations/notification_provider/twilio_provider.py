"""
Real outbound Twilio client (sms channel) — Phase 8.

Verified against Twilio's own docs before writing this (twilio.com/docs/
api/rest/request, twilio.com/docs/sms/api/message-resource,
twilio.com/docs/iam/api-keys):

- POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json
- Form-urlencoded body: To, From, Body.
- HTTP Basic Auth. Twilio supports two credential pairs for that Basic
  Auth — Account SID + Auth Token, or an API Key SID/Secret pair — and
  the Account SID is ALWAYS required in the URL path regardless of
  which pair authenticates the request (an API key alone doesn't tell
  Twilio which account it belongs to). This client prefers the API Key
  pair when both TWILIO_API_KEY_SID/TWILIO_API_KEY_SECRET are set
  (independently revocable, scope-able — Twilio's own recommendation
  beyond local testing), falling back to TWILIO_AUTH_TOKEN otherwise.
- A successful send returns 201 with a "sid" (the message resource's
  own id) in the JSON body.

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

_BASE_URL = "https://api.twilio.com/2010-04-01"


class TwilioSmsProvider(NotificationProvider):
    def __init__(
        self,
        account_sid: str,
        from_number: str,
        auth_token: str = "",
        api_key_sid: str = "",
        api_key_secret: str = "",
        timeout_seconds: float = 15.0,
    ):
        if not account_sid or not from_number:
            raise NotificationError(
                "TWILIO_ACCOUNT_SID / TWILIO_FROM_NUMBER are not configured — "
                "set both, or use NOTIFICATION_PROVIDER=mock."
            )
        if api_key_sid and api_key_secret:
            auth = (api_key_sid, api_key_secret)
        elif auth_token:
            auth = (account_sid, auth_token)
        else:
            raise NotificationError(
                "Neither TWILIO_API_KEY_SID/TWILIO_API_KEY_SECRET nor "
                "TWILIO_AUTH_TOKEN is configured — set one pair, or use "
                "NOTIFICATION_PROVIDER=mock."
            )
        self._account_sid = account_sid
        self._from_number = from_number
        self._auth = auth
        self._timeout = timeout_seconds

    def send(self, request: NotificationRequest) -> NotificationResult:
        # See brevo_provider.py's docstring for why a channel mismatch
        # raises rather than returning success=False.
        if request.channel != "sms":
            raise NotificationError(
                f"TwilioSmsProvider only handles channel='sms', got {request.channel!r}."
            )
        if not request.recipient_phone:
            return NotificationResult(
                success=False,
                message=f"No phone number on file for {request.recipient_type} recipient.",
            )

        try:
            response = httpx.post(
                f"{_BASE_URL}/Accounts/{self._account_sid}/Messages.json",
                data={
                    "To": request.recipient_phone,
                    "From": self._from_number,
                    "Body": request.message,
                },
                auth=self._auth,
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise NotificationError(f"Twilio request failed: {exc}") from exc

        if response.status_code >= 400:
            raise NotificationError(
                f"Twilio returned {response.status_code} sending SMS: {response.text}"
            )

        data = response.json()
        return NotificationResult(
            success=True,
            provider_reference=data.get("sid"),
            message=f"SMS sent to {request.recipient_phone} via Twilio.",
        )
