"""
PaymentGatewayClient tests — Phase 5.

RazorpayGatewayClient tests monkeypatch httpx.post directly (no real
network calls), the same pattern test_anthropic_provider.py uses for the
real LLM provider — this tests our request-building/response-handling,
not Razorpay's API itself.
"""
from decimal import Decimal
from types import SimpleNamespace

import httpx
import pytest

from app.exceptions import PaymentGatewayError
from app.integrations.payment_gateway_client.base import PaymentLinkRequest, RetryPaymentRequest
from app.integrations.payment_gateway_client.mock_client import MockPaymentGatewayClient
from app.integrations.payment_gateway_client.razorpay_client import RazorpayGatewayClient


def build_retry_request(**overrides) -> RetryPaymentRequest:
    defaults = dict(
        gateway_payment_id="pay_test123",
        amount=Decimal("500.00"),
        currency="INR",
        customer_name="Test Customer",
        customer_email="test@example.com",
        customer_phone="+919800000000",
        reference="retry-ref-1",
    )
    defaults.update(overrides)
    return RetryPaymentRequest(**defaults)


def build_link_request(**overrides) -> PaymentLinkRequest:
    defaults = dict(
        amount=Decimal("500.00"),
        currency="INR",
        description="Retry of payment pay_test123",
        customer_name="Test Customer",
        customer_email="test@example.com",
        customer_phone="+919800000000",
        reference="plink-ref-1",
    )
    defaults.update(overrides)
    return PaymentLinkRequest(**defaults)


# --- MockPaymentGatewayClient ---


def test_mock_retry_payment_succeeds_by_default():
    client = MockPaymentGatewayClient()
    result = client.retry_payment(build_retry_request())
    assert result.success is True
    assert result.provider_reference is not None


def test_mock_retry_payment_can_be_forced_to_fail():
    client = MockPaymentGatewayClient(always_fail=True)
    result = client.retry_payment(build_retry_request())
    assert result.success is False
    assert result.provider_reference is None


def test_mock_create_payment_link_succeeds_by_default():
    client = MockPaymentGatewayClient()
    result = client.create_payment_link(build_link_request())
    assert result.success is True
    assert "razorpay.link" in result.message


def test_mock_create_payment_link_can_be_forced_to_fail():
    client = MockPaymentGatewayClient(always_fail=True)
    result = client.create_payment_link(build_link_request())
    assert result.success is False


# --- RazorpayGatewayClient ---


def test_razorpay_client_missing_credentials_raises_at_construction():
    with pytest.raises(PaymentGatewayError):
        RazorpayGatewayClient(key_id="", key_secret="")


def test_razorpay_create_payment_link_success(monkeypatch):
    client = RazorpayGatewayClient(key_id="rzp_test_id", key_secret="rzp_test_secret")

    def fake_post(url, json, auth, timeout):
        assert url.endswith("/payment_links")
        assert auth == ("rzp_test_id", "rzp_test_secret")
        assert json["amount"] == 50000  # 500.00 INR -> paise
        assert json["customer"]["email"] == "test@example.com"
        return httpx.Response(
            status_code=200,
            json={"id": "plink_ABC123", "short_url": "https://rzp.io/l/ABC123"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(
        "app.integrations.payment_gateway_client.razorpay_client.httpx.post", fake_post
    )

    result = client.create_payment_link(build_link_request())

    assert result.success is True
    assert result.provider_reference == "plink_ABC123"
    assert "rzp.io" in result.message


def test_razorpay_retry_payment_delegates_to_payment_link(monkeypatch):
    """
    See razorpay_client.py's module docstring: there is no direct retry
    endpoint, so retry_payment() must go through the same Payment Links
    call as create_payment_link().
    """
    client = RazorpayGatewayClient(key_id="rzp_test_id", key_secret="rzp_test_secret")
    calls = []

    def fake_post(url, json, auth, timeout):
        calls.append(json)
        return httpx.Response(
            status_code=200,
            json={"id": "plink_XYZ", "short_url": "https://rzp.io/l/XYZ"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(
        "app.integrations.payment_gateway_client.razorpay_client.httpx.post", fake_post
    )

    result = client.retry_payment(build_retry_request())

    assert result.success is True
    assert len(calls) == 1
    assert "Retry of payment" in calls[0]["description"]


def test_razorpay_non_2xx_response_raises_payment_gateway_error(monkeypatch):
    client = RazorpayGatewayClient(key_id="rzp_test_id", key_secret="rzp_test_secret")

    def fake_post(url, json, auth, timeout):
        return httpx.Response(
            status_code=401,
            json={"error": {"description": "Authentication failed"}},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(
        "app.integrations.payment_gateway_client.razorpay_client.httpx.post", fake_post
    )

    with pytest.raises(PaymentGatewayError, match="401"):
        client.create_payment_link(build_link_request())


def test_razorpay_network_error_raises_payment_gateway_error(monkeypatch):
    client = RazorpayGatewayClient(key_id="rzp_test_id", key_secret="rzp_test_secret")

    def raise_network_error(url, json, auth, timeout):
        raise httpx.ConnectError("connection refused", request=httpx.Request("POST", url))

    monkeypatch.setattr(
        "app.integrations.payment_gateway_client.razorpay_client.httpx.post", raise_network_error
    )

    with pytest.raises(PaymentGatewayError, match="Razorpay request failed"):
        client.create_payment_link(build_link_request())
