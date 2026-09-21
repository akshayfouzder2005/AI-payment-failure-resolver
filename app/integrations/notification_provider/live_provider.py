"""
Composite NotificationProvider (Phase 8) — routes by
NotificationRequest.channel to the real per-channel implementation:
"email" -> BrevoEmailProvider, "sms" -> TwilioSmsProvider.

Exists because NOTIFICATION_PROVIDER is one config knob, mirroring
every other provider factory in this codebase (RECOVERY_GATEWAY_
PROVIDER, AI_PROVIDER), but a "live" notification channel genuinely
needs two unrelated vendor integrations, one per channel — see base.py's
docstring for why SEND_NOTIFICATION/ESCALATE_TO_MERCHANT already share
one interface with a `channel` field rather than being split in two.

Each channel provider validates its own credentials at construction
(see brevo_provider.py / twilio_provider.py). Either one may be None
here (only one channel's credentials configured) — this class still
constructs; the unconfigured channel raises NotificationError only if
it's actually used, exactly like a missing/invalid credential at the
per-provider level. That failure is caught by the executor and turned
into a failed RecoveryAttempt (see executors/base.py), never a crash.
"""
from app.exceptions import NotificationError
from app.integrations.notification_provider.base import (
    NotificationProvider,
    NotificationRequest,
    NotificationResult,
)


class LiveNotificationProvider(NotificationProvider):
    def __init__(
        self,
        email_provider: NotificationProvider | None,
        sms_provider: NotificationProvider | None,
    ):
        self._email_provider = email_provider
        self._sms_provider = sms_provider

    def send(self, request: NotificationRequest) -> NotificationResult:
        if request.channel == "email":
            if self._email_provider is None:
                raise NotificationError(
                    "channel='email' was requested but no email provider is "
                    "configured (set BREVO_API_KEY / BREVO_SENDER_EMAIL)."
                )
            return self._email_provider.send(request)

        if self._sms_provider is None:
            raise NotificationError(
                "channel='sms' was requested but no sms provider is "
                "configured (set TWILIO_ACCOUNT_SID / TWILIO_FROM_NUMBER and "
                "either TWILIO_API_KEY_SID/TWILIO_API_KEY_SECRET or "
                "TWILIO_AUTH_TOKEN)."
            )
        return self._sms_provider.send(request)
