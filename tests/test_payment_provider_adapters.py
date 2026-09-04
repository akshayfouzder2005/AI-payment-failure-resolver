"""
Adapter-level tests. These don't touch the database at all — signature
validation and payload parsing are pure functions of (bytes, headers), so
they're tested directly without going through the HTTP layer.
"""
from decimal import Decimal

import pytest

from app.exceptions import InvalidPayloadError
from app.integrations.payment_provider.mock_adapter import MockAdapter
from app.integrations.payment_provider.razorpay_adapter import RazorpayAdapter

SECRET = "test_secret_123"


def _sign(raw_body: bytes, secret: str = SECRET) -> str:
    import hashlib
    import hmac

    return hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()


class TestRazorpaySignatureValidation:
    def test_valid_signature_is_accepted(self, razorpay_failed_payment_payload) -> None:
        body = razorpay_failed_payment_payload()
        adapter = RazorpayAdapter(webhook_secret=SECRET)
        assert adapter.validate_signature(body, {"x-razorpay-signature": _sign(body)}) is True

    def test_wrong_signature_is_rejected(self, razorpay_failed_payment_payload) -> None:
        body = razorpay_failed_payment_payload()
        adapter = RazorpayAdapter(webhook_secret=SECRET)
        assert adapter.validate_signature(body, {"x-razorpay-signature": "0" * 64}) is False

    def test_signature_computed_over_different_body_is_rejected(
        self, razorpay_failed_payment_payload
    ) -> None:
        """Proves validation is over the actual raw body, not just 'a' valid-looking hash."""
        body = razorpay_failed_payment_payload(gateway_payment_id="pay_A")
        other_body = razorpay_failed_payment_payload(gateway_payment_id="pay_B")
        adapter = RazorpayAdapter(webhook_secret=SECRET)
        assert adapter.validate_signature(body, {"x-razorpay-signature": _sign(other_body)}) is False

    def test_missing_signature_header_is_rejected(self, razorpay_failed_payment_payload) -> None:
        body = razorpay_failed_payment_payload()
        adapter = RazorpayAdapter(webhook_secret=SECRET)
        assert adapter.validate_signature(body, {}) is False

    def test_missing_configured_secret_rejects_everything(
        self, razorpay_failed_payment_payload
    ) -> None:
        """An adapter with no secret configured must fail closed, not accept unsigned requests."""
        body = razorpay_failed_payment_payload()
        adapter = RazorpayAdapter(webhook_secret="")
        assert adapter.validate_signature(body, {"x-razorpay-signature": _sign(body, "")}) is False


class TestRazorpayEventParsing:
    def test_amount_is_converted_from_paise_to_rupees(self, razorpay_failed_payment_payload) -> None:
        body = razorpay_failed_payment_payload(amount_paise=149900)
        adapter = RazorpayAdapter(webhook_secret=SECRET)
        normalized = adapter.parse_event(body, {"x-razorpay-event-id": "evt_1"})
        assert normalized.amount == Decimal("1499.00")

    def test_event_id_is_read_from_header_not_payload(self, razorpay_failed_payment_payload) -> None:
        body = razorpay_failed_payment_payload()
        adapter = RazorpayAdapter(webhook_secret=SECRET)
        normalized = adapter.parse_event(body, {"x-razorpay-event-id": "evt_from_header"})
        assert normalized.event_id == "evt_from_header"
        assert normalized.provider == "razorpay"
        assert normalized.gateway == "razorpay"

    def test_missing_event_id_header_falls_back_to_content_hash(
        self, razorpay_failed_payment_payload
    ) -> None:
        body = razorpay_failed_payment_payload()
        adapter = RazorpayAdapter(webhook_secret=SECRET)
        normalized = adapter.parse_event(body, {})
        assert normalized.event_id.startswith("sha256:")

    def test_maps_core_fields_correctly(self, razorpay_failed_payment_payload) -> None:
        body = razorpay_failed_payment_payload(
            gateway_payment_id="pay_XYZ",
            error_code="GATEWAY_ERROR",
            email="shopper@example.com",
        )
        adapter = RazorpayAdapter(webhook_secret=SECRET)
        normalized = adapter.parse_event(body, {"x-razorpay-event-id": "evt_2"})
        assert normalized.gateway_payment_id == "pay_XYZ"
        assert normalized.status == "failed"
        assert normalized.failure_code == "GATEWAY_ERROR"
        assert normalized.customer_email == "shopper@example.com"
        assert normalized.raw_payload["event"] == "payment.failed"

    def test_malformed_payload_raises_invalid_payload_error(self) -> None:
        adapter = RazorpayAdapter(webhook_secret=SECRET)
        with pytest.raises(InvalidPayloadError):
            adapter.parse_event(b"not json at all", {"x-razorpay-event-id": "evt_3"})

    def test_payload_missing_expected_shape_raises_invalid_payload_error(self) -> None:
        import json

        adapter = RazorpayAdapter(webhook_secret=SECRET)
        with pytest.raises(InvalidPayloadError):
            adapter.parse_event(
                json.dumps({"event": "payment.failed", "payload": {}}).encode(),
                {"x-razorpay-event-id": "evt_4"},
            )


class TestMockAdapter:
    def test_round_trip_produces_consistent_normalized_event(self) -> None:
        adapter = MockAdapter()
        raw = adapter.build_failed_payment_event({})
        assert adapter.validate_signature(raw, {}) is True

        normalized = adapter.parse_event(raw, {})
        assert normalized.provider == "mock"
        assert normalized.event_type == "payment.failed"
        assert normalized.status == "failed"
        assert normalized.gateway_payment_id.startswith("pay_sim_")

    def test_overrides_are_honored(self) -> None:
        adapter = MockAdapter()
        raw = adapter.build_failed_payment_event(
            {"customer_email": "vip@example.com", "amount": "199900.00"}
        )
        normalized = adapter.parse_event(raw, {})
        assert normalized.customer_email == "vip@example.com"
        assert normalized.amount == Decimal("199900.00")

    def test_each_call_gets_a_unique_event_id(self) -> None:
        adapter = MockAdapter()
        first = adapter.parse_event(adapter.build_failed_payment_event({}), {})
        second = adapter.parse_event(adapter.build_failed_payment_event({}), {})
        assert first.event_id != second.event_id
