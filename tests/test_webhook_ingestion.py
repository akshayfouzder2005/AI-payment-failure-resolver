"""
End-to-end ingestion tests, through the real HTTP routes (not calling
WebhookService directly) — these are what actually prove the wiring in
app/api/routes/webhooks.py and simulate.py is correct, not just the
service logic in isolation.
"""
from unittest.mock import patch

from sqlalchemy import select

from app.config import get_settings
from app.models.audit_log import AuditLog
from app.models.customer import Customer
from app.models.merchant_settings import MerchantSettings
from app.models.payment import Payment
from app.models.payment_event import PaymentEvent


def test_new_failed_payment_creates_full_chain(
    client, db_session, razorpay_failed_payment_payload, sign, event_id_header
) -> None:
    body = razorpay_failed_payment_payload(gateway_payment_id="pay_CHAIN001")
    headers = {"x-razorpay-signature": sign(body), **event_id_header()}

    response = client.post("/webhooks/razorpay", content=body, headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "processed"
    assert data["payment_status"] == "failed"
    assert data["payment_summary"]["amount"] == "500.00"

    payment = db_session.scalars(
        select(Payment).where(Payment.gateway_payment_id == "pay_CHAIN001")
    ).one()
    # NOT "failed" — the auto-chain (app/services/recovery_pipeline.py)
    # already ran by the time this line executes (TestClient runs
    # BackgroundTasks synchronously as part of the request/response
    # cycle). This fixture's failure message ("insufficient funds")
    # deterministically classifies as RETRY_PAYMENT via MockLLMProvider,
    # the default merchant policy has no threshold that blocks it at
    # ₹500, and MockPaymentGatewayClient succeeds deterministically by
    # default — so "recovered" is the correct, non-flaky final state,
    # not a race. The ingestion-time state ("failed") is still what the
    # HTTP response itself reports, asserted above via data["payment_status"].
    assert payment.status == "recovered"
    assert payment.failure_code == "BAD_REQUEST_ERROR"

    customer = db_session.scalars(
        select(Customer).where(Customer.email == "test.customer@example.com")
    ).one()
    assert payment.customer_id == customer.id

    events = db_session.scalars(select(PaymentEvent)).all()
    assert len(events) == 1
    assert events[0].processing_status == "processed"
    assert events[0].payment_id == payment.id


def test_duplicate_delivery_same_event_id_is_ignored(
    client, db_session, razorpay_failed_payment_payload, sign, event_id_header
) -> None:
    body = razorpay_failed_payment_payload(gateway_payment_id="pay_DUP001")
    headers = {"x-razorpay-signature": sign(body), **event_id_header("evt_fixed_dup")}

    first = client.post("/webhooks/razorpay", content=body, headers=headers)
    second = client.post("/webhooks/razorpay", content=body, headers=headers)

    assert first.status_code == 200
    assert first.json()["status"] == "processed"
    assert second.status_code == 200
    assert second.json()["status"] == "duplicate"
    assert second.json()["payment_id"] == first.json()["payment_id"]

    assert len(db_session.scalars(select(PaymentEvent)).all()) == 1
    assert len(db_session.scalars(select(Payment)).all()) == 1


def test_redelivered_duplicate_preserves_original_payload(
    client, db_session, razorpay_failed_payment_payload, sign, event_id_header
) -> None:
    """Same event id redelivered with a (hypothetically) altered body — the
    ORIGINAL payload wins; Razorpay redeliveries are retries of the same
    event, not a way to amend it."""
    headers = event_id_header("evt_redelivery_test")
    original = razorpay_failed_payment_payload(gateway_payment_id="pay_REDELIVER", error_code="GATEWAY_ERROR")
    client.post(
        "/webhooks/razorpay", content=original,
        headers={"x-razorpay-signature": sign(original), **headers},
    )

    redelivered = razorpay_failed_payment_payload(gateway_payment_id="pay_REDELIVER", error_code="BAD_REQUEST_ERROR")
    client.post(
        "/webhooks/razorpay", content=redelivered,
        headers={"x-razorpay-signature": sign(redelivered), **headers},
    )

    payment = db_session.scalars(
        select(Payment).where(Payment.gateway_payment_id == "pay_REDELIVER")
    ).one()
    assert payment.failure_code == "GATEWAY_ERROR"  # from the original delivery, not the redelivery


def test_invalid_signature_rejected_nothing_stored(
    client, db_session, razorpay_failed_payment_payload, event_id_header
) -> None:
    body = razorpay_failed_payment_payload()
    response = client.post(
        "/webhooks/razorpay",
        content=body,
        headers={"x-razorpay-signature": "0" * 64, **event_id_header()},
    )
    assert response.status_code == 400
    assert db_session.scalars(select(PaymentEvent)).all() == []


def test_missing_signature_header_rejected(client, razorpay_failed_payment_payload) -> None:
    body = razorpay_failed_payment_payload()
    response = client.post("/webhooks/razorpay", content=body)
    assert response.status_code == 400


def test_malformed_json_body_rejected(client, db_session, sign, event_id_header) -> None:
    body = b"this is not json"
    response = client.post(
        "/webhooks/razorpay",
        content=body,
        headers={"x-razorpay-signature": sign(body), **event_id_header()},
    )
    assert response.status_code == 400
    assert db_session.scalars(select(PaymentEvent)).all() == []


def test_second_event_same_payment_id_updates_existing_row(
    client, db_session, razorpay_failed_payment_payload, sign, event_id_header
) -> None:
    body1 = razorpay_failed_payment_payload(
        gateway_payment_id="pay_UPDATE001", error_code="GATEWAY_ERROR", created_at=1735689600
    )
    client.post(
        "/webhooks/razorpay", content=body1,
        headers={"x-razorpay-signature": sign(body1), **event_id_header("evt_update_1")},
    )

    body2 = razorpay_failed_payment_payload(
        gateway_payment_id="pay_UPDATE001", error_code="BAD_REQUEST_ERROR", created_at=1735689700
    )
    client.post(
        "/webhooks/razorpay", content=body2,
        headers={"x-razorpay-signature": sign(body2), **event_id_header("evt_update_2")},
    )

    payments = db_session.scalars(
        select(Payment).where(Payment.gateway_payment_id == "pay_UPDATE001")
    ).all()
    assert len(payments) == 1
    assert payments[0].failure_code == "BAD_REQUEST_ERROR"
    assert len(db_session.scalars(select(PaymentEvent)).all()) == 2  # both events logged


def test_unhandled_event_type_is_ignored_not_turned_into_payment(
    client, db_session, razorpay_failed_payment_payload, sign, event_id_header
) -> None:
    import json

    body_dict = json.loads(razorpay_failed_payment_payload(gateway_payment_id="pay_CAPTURED001"))
    body_dict["event"] = "payment.captured"
    body = json.dumps(body_dict).encode()

    response = client.post(
        "/webhooks/razorpay", content=body,
        headers={"x-razorpay-signature": sign(body), **event_id_header()},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "ignored"
    assert db_session.scalars(select(Payment)).all() == []
    event = db_session.scalars(select(PaymentEvent)).one()
    assert event.processing_status == "ignored"


def test_processing_failure_returns_202_and_marks_event_failed(
    client, db_session, razorpay_failed_payment_payload, sign, event_id_header
) -> None:
    body = razorpay_failed_payment_payload(gateway_payment_id="pay_BOOM001")
    headers = {"x-razorpay-signature": sign(body), **event_id_header()}

    with patch(
        "app.services.payment_service.PaymentService.upsert_from_event",
        side_effect=RuntimeError("simulated downstream failure"),
    ):
        response = client.post("/webhooks/razorpay", content=body, headers=headers)

    assert response.status_code == 202
    assert response.json()["status"] == "processing_failed"

    event = db_session.scalars(select(PaymentEvent)).one()
    assert event.processing_status == "failed"
    assert "simulated downstream failure" in event.error_message


def test_audit_actions_recorded_for_successful_ingest(
    client, db_session, razorpay_failed_payment_payload, sign, event_id_header
) -> None:
    body = razorpay_failed_payment_payload(gateway_payment_id="pay_AUDIT001")
    client.post(
        "/webhooks/razorpay", content=body,
        headers={"x-razorpay-signature": sign(body), **event_id_header()},
    )

    logs = db_session.scalars(select(AuditLog)).all()
    actions = {log.action for log in logs}
    assert "payment_failed_recorded" in actions
    assert "recovery_pipeline_queued" in actions

    # Ingestion's own entries are all attributed to "system" — the
    # auto-chain that now also runs (app/services/recovery_pipeline.py)
    # adds its own entries under "ai_engine"/"policy_engine"/"executor",
    # so the blanket "every log this test produced is system" no longer
    # holds across the WHOLE audit trail; scope it to ingestion's own
    # entities instead (PaymentEvent, and Payment's ingestion-stage rows).
    ingestion_actions = {"webhook_received", "payment_failed_recorded", "recovery_pipeline_queued"}
    assert all(log.actor == "system" for log in logs if log.action in ingestion_actions)


def test_default_merchant_auto_provisioned_on_first_use(
    client, db_session, razorpay_failed_payment_payload, sign, event_id_header
) -> None:
    merchant_id = get_settings().default_merchant_id
    assert (
        db_session.scalars(
            select(MerchantSettings).where(MerchantSettings.merchant_id == merchant_id)
        ).first()
        is None
    )

    body = razorpay_failed_payment_payload()
    client.post(
        "/webhooks/razorpay", content=body,
        headers={"x-razorpay-signature": sign(body), **event_id_header()},
    )

    merchant = db_session.scalars(
        select(MerchantSettings).where(MerchantSettings.merchant_id == merchant_id)
    ).one()
    assert merchant.max_retry_count == 3  # model default, proving it wasn't hand-crafted


def test_simulate_endpoint_creates_full_chain(client, db_session) -> None:
    response = client.post("/simulate/failed-payment", json={})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "processed"
    assert data["payment_status"] == "failed"

    payment = db_session.scalars(
        select(Payment).where(Payment.id == data["payment_id"])
    ).one()
    assert payment.gateway == "mock"


def test_simulate_endpoint_honors_overrides(client) -> None:
    response = client.post(
        "/simulate/failed-payment",
        json={"customer_email": "vip@example.com", "amount": "1999.00"},
    )
    assert response.status_code == 200
    summary = response.json()["payment_summary"]
    assert summary["amount"] == "1999.00"


def test_simulate_two_calls_produce_two_independent_events(client, db_session) -> None:
    client.post("/simulate/failed-payment", json={})
    client.post("/simulate/failed-payment", json={})
    assert len(db_session.scalars(select(PaymentEvent)).all()) == 2
    assert len(db_session.scalars(select(Payment)).all()) == 2


def test_simulate_without_merchant_id_uses_default_merchant(client, db_session) -> None:
    from app.config import get_settings

    response = client.post("/simulate/failed-payment", json={})
    payment = db_session.scalars(select(Payment).where(Payment.id == response.json()["payment_id"])).one()
    assert payment.merchant_id == get_settings().default_merchant_id


def test_simulate_honors_merchant_id_override(client, db_session, make_merchant) -> None:
    """
    A caller who already knows their own merchant_id (from GET /auth/me)
    can attribute a simulated payment to themselves instead of always
    the single default merchant — see app/api/routes/simulate.py.
    """
    make_merchant(merchant_id="acme-store-1234")

    response = client.post("/simulate/failed-payment", json={"merchant_id": "acme-store-1234"})
    assert response.status_code == 200

    payment = db_session.scalars(select(Payment).where(Payment.id == response.json()["payment_id"])).one()
    assert payment.merchant_id == "acme-store-1234"


def test_simulate_merchant_id_override_auto_provisions_unknown_merchant(client, db_session) -> None:
    """merchant_id doesn't have to already exist — ensure_merchant() lazily provisions it, same as the default merchant."""
    response = client.post("/simulate/failed-payment", json={"merchant_id": "brand-new-merchant-9999"})
    assert response.status_code == 200

    payment = db_session.scalars(select(Payment).where(Payment.id == response.json()["payment_id"])).one()
    assert payment.merchant_id == "brand-new-merchant-9999"


def test_simulate_merchant_id_is_not_leaked_into_synthetic_payload(client, db_session) -> None:
    """merchant_id is routing info for WebhookService.ingest(), not a field of the synthetic payment.failed event body."""
    response = client.post(
        "/simulate/failed-payment",
        json={"merchant_id": "acme-store-1234", "customer_email": "vip@example.com"},
    )
    assert response.status_code == 200
    event = db_session.scalars(select(PaymentEvent).where(PaymentEvent.payment_id == response.json()["payment_id"])).one()
    assert "merchant_id" not in event.payload

