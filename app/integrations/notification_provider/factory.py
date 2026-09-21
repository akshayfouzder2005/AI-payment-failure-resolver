"""
Notification provider factory — Phase 5, extended Phase 8 with a real
"live" provider. Mirrors the payment gateway client and LLM provider
factories: NOTIFICATION_PROVIDER decides the implementation, so
executors (and tests) never construct one directly.

"live" builds a LiveNotificationProvider from whichever of Brevo
(email) / Twilio (sms) has credentials configured — see live_provider.py
for why a missing channel doesn't prevent construction, only use.
"""
from app.config import get_settings
from app.integrations.notification_provider.base import NotificationProvider
from app.integrations.notification_provider.brevo_provider import BrevoEmailProvider
from app.integrations.notification_provider.live_provider import LiveNotificationProvider
from app.integrations.notification_provider.mock_provider import MockNotificationProvider
from app.integrations.notification_provider.twilio_provider import TwilioSmsProvider


def get_notification_provider() -> NotificationProvider:
    settings = get_settings()

    if settings.notification_provider == "live":
        email_provider = (
            BrevoEmailProvider(
                api_key=settings.brevo_api_key,
                sender_email=settings.brevo_sender_email,
                sender_name=settings.brevo_sender_name,
                timeout_seconds=settings.brevo_api_timeout_seconds,
            )
            if settings.brevo_api_key and settings.brevo_sender_email
            else None
        )
        sms_provider = (
            TwilioSmsProvider(
                account_sid=settings.twilio_account_sid,
                from_number=settings.twilio_from_number,
                auth_token=settings.twilio_auth_token,
                api_key_sid=settings.twilio_api_key_sid,
                api_key_secret=settings.twilio_api_key_secret,
                timeout_seconds=settings.twilio_api_timeout_seconds,
            )
            if settings.twilio_account_sid and settings.twilio_from_number
            else None
        )
        return LiveNotificationProvider(email_provider=email_provider, sms_provider=sms_provider)

    if settings.notification_provider != "mock":
        raise NotImplementedError(
            f"NOTIFICATION_PROVIDER={settings.notification_provider!r} is not implemented; "
            "use 'mock' or 'live'."
        )
    return MockNotificationProvider()
