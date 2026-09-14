from app.integrations.notification_provider.base import NotificationRequest
from app.integrations.notification_provider.mock_provider import MockNotificationProvider


def build_request(**overrides) -> NotificationRequest:
    defaults = dict(
        recipient_type="customer",
        channel="email",
        recipient_email="test@example.com",
        subject="Test subject",
        message="Test message",
        reference="notify-ref-1",
    )
    defaults.update(overrides)
    return NotificationRequest(**defaults)


def test_send_succeeds_by_default():
    provider = MockNotificationProvider()
    result = provider.send(build_request())
    assert result.success is True
    assert result.provider_reference is not None


def test_send_can_be_forced_to_fail():
    provider = MockNotificationProvider(always_fail=True)
    result = provider.send(build_request())
    assert result.success is False


def test_send_fails_gracefully_with_no_contact_channel():
    provider = MockNotificationProvider()
    request = build_request(recipient_email=None, recipient_phone=None)
    result = provider.send(request)
    assert result.success is False
    assert "No email" in result.message


def test_send_sms_channel_uses_phone():
    provider = MockNotificationProvider()
    request = build_request(channel="sms", recipient_email=None, recipient_phone="+919800000000")
    result = provider.send(request)
    assert result.success is True
