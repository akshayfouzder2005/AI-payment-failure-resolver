"""
Notification provider factory — Phase 5. Mirrors the payment gateway
client and LLM provider factories. Only "mock" exists today; NOTIFICATION_
PROVIDER is still config-driven so adding a real channel later is a
one-branch addition here, not a call-site change.
"""
from app.config import get_settings
from app.integrations.notification_provider.base import NotificationProvider
from app.integrations.notification_provider.mock_provider import MockNotificationProvider


def get_notification_provider() -> NotificationProvider:
    settings = get_settings()
    if settings.notification_provider != "mock":
        raise NotImplementedError(
            f"NOTIFICATION_PROVIDER={settings.notification_provider!r} is not implemented; only 'mock' exists."
        )
    return MockNotificationProvider()
