"""
NotificationProvider tests — Phase 5 (mock), extended Phase 8 (Brevo
email / Twilio sms / the live channel router).

BrevoEmailProvider/TwilioSmsProvider tests monkeypatch httpx.post
directly (no real network calls) — the same pattern
test_payment_gateway_client.py uses for RazorpayGatewayClient. Live-API
verification against the real vendors lives in
scripts/verify_notifications_live.py, outside pytest, per this
project's convention (see that script's docstring).
"""
import httpx
import pytest

from app.exceptions import NotificationError
from app.integrations.notification_provider.base import NotificationRequest
from app.integrations.notification_provider.brevo_provider import BrevoEmailProvider
from app.integrations.notification_provider.live_provider import LiveNotificationProvider
from app.integrations.notification_provider.mock_provider import MockNotificationProvider
from app.integrations.notification_provider.twilio_provider import TwilioSmsProvider


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


# --- BrevoEmailProvider ---


def test_brevo_missing_credentials_raises_at_construction():
    with pytest.raises(NotificationError):
        BrevoEmailProvider(api_key="", sender_email="")


def test_brevo_send_success(monkeypatch):
    provider = BrevoEmailProvider(api_key="xkeysib-test", sender_email="ops@example.com")

    def fake_post(url, json, headers, timeout):
        assert url.endswith("/v3/smtp/email")
        assert headers["api-key"] == "xkeysib-test"
        assert json["sender"]["email"] == "ops@example.com"
        assert json["to"] == [{"email": "test@example.com"}]
        assert json["subject"] == "Test subject"
        return httpx.Response(
            status_code=201,
            json={"messageId": "<abc123@relay.brevo.com>"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(
        "app.integrations.notification_provider.brevo_provider.httpx.post", fake_post
    )

    result = provider.send(build_request())

    assert result.success is True
    assert result.provider_reference == "<abc123@relay.brevo.com>"


def test_brevo_wrong_channel_raises():
    provider = BrevoEmailProvider(api_key="k", sender_email="ops@example.com")
    with pytest.raises(NotificationError):
        provider.send(
            build_request(channel="sms", recipient_email=None, recipient_phone="+919800000000")
        )


def test_brevo_no_recipient_email_fails_gracefully():
    provider = BrevoEmailProvider(api_key="k", sender_email="ops@example.com")
    result = provider.send(build_request(recipient_email=None))
    assert result.success is False


def test_brevo_non_2xx_response_raises_notification_error(monkeypatch):
    provider = BrevoEmailProvider(api_key="k", sender_email="ops@example.com")

    def fake_post(url, json, headers, timeout):
        return httpx.Response(
            status_code=401,
            json={"code": "unauthorized", "message": "Key not found"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(
        "app.integrations.notification_provider.brevo_provider.httpx.post", fake_post
    )

    with pytest.raises(NotificationError, match="401"):
        provider.send(build_request())


def test_brevo_network_error_raises_notification_error(monkeypatch):
    provider = BrevoEmailProvider(api_key="k", sender_email="ops@example.com")

    def raise_network_error(url, json, headers, timeout):
        raise httpx.ConnectError("connection refused", request=httpx.Request("POST", url))

    monkeypatch.setattr(
        "app.integrations.notification_provider.brevo_provider.httpx.post", raise_network_error
    )

    with pytest.raises(NotificationError, match="Brevo request failed"):
        provider.send(build_request())


# --- TwilioSmsProvider ---


def test_twilio_missing_credentials_raises_at_construction():
    with pytest.raises(NotificationError):
        TwilioSmsProvider(account_sid="", from_number="")


def test_twilio_missing_auth_raises_at_construction():
    with pytest.raises(NotificationError):
        TwilioSmsProvider(account_sid="ACxxx", from_number="+15005550006")


def test_twilio_prefers_api_key_over_auth_token(monkeypatch):
    provider = TwilioSmsProvider(
        account_sid="ACxxx",
        from_number="+15005550006",
        auth_token="should_not_be_used",
        api_key_sid="SKxxx",
        api_key_secret="secret",
    )

    def fake_post(url, data, auth, timeout):
        assert auth == ("SKxxx", "secret")
        assert url.endswith("/Accounts/ACxxx/Messages.json")
        return httpx.Response(
            status_code=201, json={"sid": "SMxxx"}, request=httpx.Request("POST", url)
        )

    monkeypatch.setattr(
        "app.integrations.notification_provider.twilio_provider.httpx.post", fake_post
    )

    result = provider.send(
        build_request(channel="sms", recipient_email=None, recipient_phone="+919800000000")
    )
    assert result.success is True
    assert result.provider_reference == "SMxxx"


def test_twilio_falls_back_to_auth_token(monkeypatch):
    provider = TwilioSmsProvider(account_sid="ACxxx", from_number="+15005550006", auth_token="tok")

    def fake_post(url, data, auth, timeout):
        assert auth == ("ACxxx", "tok")
        assert data["To"] == "+919800000000"
        assert data["From"] == "+15005550006"
        return httpx.Response(
            status_code=201, json={"sid": "SMyyy"}, request=httpx.Request("POST", url)
        )

    monkeypatch.setattr(
        "app.integrations.notification_provider.twilio_provider.httpx.post", fake_post
    )

    result = provider.send(
        build_request(channel="sms", recipient_email=None, recipient_phone="+919800000000")
    )
    assert result.success is True


def test_twilio_wrong_channel_raises():
    provider = TwilioSmsProvider(account_sid="ACxxx", from_number="+15005550006", auth_token="tok")
    with pytest.raises(NotificationError):
        provider.send(build_request())


def test_twilio_no_recipient_phone_fails_gracefully():
    provider = TwilioSmsProvider(account_sid="ACxxx", from_number="+15005550006", auth_token="tok")
    result = provider.send(build_request(channel="sms", recipient_email=None, recipient_phone=None))
    assert result.success is False


def test_twilio_non_2xx_response_raises_notification_error(monkeypatch):
    provider = TwilioSmsProvider(account_sid="ACxxx", from_number="+15005550006", auth_token="tok")

    def fake_post(url, data, auth, timeout):
        return httpx.Response(
            status_code=400,
            json={"code": 21211, "message": "Invalid 'To' Phone Number"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(
        "app.integrations.notification_provider.twilio_provider.httpx.post", fake_post
    )

    with pytest.raises(NotificationError, match="400"):
        provider.send(
            build_request(channel="sms", recipient_email=None, recipient_phone="+919800000000")
        )


def test_twilio_network_error_raises_notification_error(monkeypatch):
    provider = TwilioSmsProvider(account_sid="ACxxx", from_number="+15005550006", auth_token="tok")

    def raise_network_error(url, data, auth, timeout):
        raise httpx.ConnectError("connection refused", request=httpx.Request("POST", url))

    monkeypatch.setattr(
        "app.integrations.notification_provider.twilio_provider.httpx.post", raise_network_error
    )

    with pytest.raises(NotificationError, match="Twilio request failed"):
        provider.send(
            build_request(channel="sms", recipient_email=None, recipient_phone="+919800000000")
        )


# --- LiveNotificationProvider (channel router) ---


def test_live_provider_routes_email_to_email_provider():
    calls = []

    class FakeEmailProvider:
        def send(self, request):
            calls.append(request.channel)
            return MockNotificationProvider().send(request)

    provider = LiveNotificationProvider(email_provider=FakeEmailProvider(), sms_provider=None)
    result = provider.send(build_request(channel="email"))

    assert calls == ["email"]
    assert result.success is True


def test_live_provider_routes_sms_to_sms_provider():
    calls = []

    class FakeSmsProvider:
        def send(self, request):
            calls.append(request.channel)
            return MockNotificationProvider().send(request)

    provider = LiveNotificationProvider(email_provider=None, sms_provider=FakeSmsProvider())
    result = provider.send(
        build_request(channel="sms", recipient_email=None, recipient_phone="+919800000000")
    )

    assert calls == ["sms"]
    assert result.success is True


def test_live_provider_raises_if_email_channel_unconfigured():
    provider = LiveNotificationProvider(email_provider=None, sms_provider=None)
    with pytest.raises(NotificationError):
        provider.send(build_request(channel="email"))


def test_live_provider_raises_if_sms_channel_unconfigured():
    provider = LiveNotificationProvider(email_provider=None, sms_provider=None)
    with pytest.raises(NotificationError):
        provider.send(
            build_request(channel="sms", recipient_email=None, recipient_phone="+919800000000")
        )
