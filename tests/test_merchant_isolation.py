"""
Cross-merchant data isolation tests — Phase 7 (auth).

The whole point of authentication in this system: a valid token for
Merchant A must never expose Merchant B's payments, AI decisions,
recovery attempts, audit trail, or metrics — and must never be able to
execute a recovery action against Merchant B's payment. Every route
under test here derives its merchant scope from the bearer token alone
(app.api.deps.get_current_merchant_id); none of them accept a
client-supplied merchant_id.

Background processing (webhook -> AI -> policy -> recovery -> audit ->
metrics all completing without any HTTP/JWT context) is exercised by
test_recovery_api.py::test_full_demo_flow_via_http and by
test_webhook_ingestion.py, not repeated here.
"""
import uuid


def _setup_two_merchants(make_merchant, make_payment, make_ai_decision, db_session):
    merchant_a = make_merchant(merchant_id=f"isolation_merchant_a_{uuid.uuid4().hex[:8]}")
    merchant_b = make_merchant(merchant_id=f"isolation_merchant_b_{uuid.uuid4().hex[:8]}")
    payment_b = make_payment(merchant_id=merchant_b.merchant_id)
    decision_b = make_ai_decision(payment_b.id, recommended_action="RETRY_PAYMENT", confidence=0.9)
    db_session.commit()
    return merchant_a, merchant_b, payment_b, decision_b


def test_merchant_a_cannot_diagnose_merchant_b_payment(
    client, make_merchant, make_payment, make_ai_decision, db_session, auth_headers
):
    merchant_a, _merchant_b, payment_b, _decision_b = _setup_two_merchants(
        make_merchant, make_payment, make_ai_decision, db_session
    )
    headers_a = auth_headers(merchant_id=merchant_a.merchant_id)

    response = client.post(f"/ai-decisions/diagnose/{payment_b.id}", headers=headers_a)

    assert response.status_code == 404


def test_merchant_a_sees_empty_ai_decision_list_for_merchant_b_payment(
    client, make_merchant, make_payment, make_ai_decision, db_session, auth_headers
):
    merchant_a, _merchant_b, payment_b, _decision_b = _setup_two_merchants(
        make_merchant, make_payment, make_ai_decision, db_session
    )
    headers_a = auth_headers(merchant_id=merchant_a.merchant_id)

    response = client.get(f"/ai-decisions/payment/{payment_b.id}", headers=headers_a)

    assert response.status_code == 200
    assert response.json() == []


def test_merchant_a_cannot_execute_recovery_for_merchant_b_payment(
    client, make_merchant, make_payment, make_ai_decision, db_session, auth_headers
):
    merchant_a, _merchant_b, payment_b, _decision_b = _setup_two_merchants(
        make_merchant, make_payment, make_ai_decision, db_session
    )
    headers_a = auth_headers(merchant_id=merchant_a.merchant_id)

    response = client.post(f"/recovery/execute/{payment_b.id}", headers=headers_a)

    assert response.status_code == 404


def test_merchant_a_sees_empty_recovery_list_for_merchant_b_payment(
    client, make_merchant, make_payment, make_ai_decision, db_session, auth_headers
):
    merchant_a, merchant_b, payment_b, decision_b = _setup_two_merchants(
        make_merchant, make_payment, make_ai_decision, db_session
    )
    headers_b = auth_headers(merchant_id=merchant_b.merchant_id)
    # Merchant B actually executes recovery on its own payment first, so
    # there is a real RecoveryAttempt row for Merchant A to fail to see.
    execute_response = client.post(f"/recovery/execute/{payment_b.id}", headers=headers_b)
    assert execute_response.status_code == 200

    headers_a = auth_headers(merchant_id=merchant_a.merchant_id)
    response = client.get(f"/recovery/payment/{payment_b.id}", headers=headers_a)

    assert response.status_code == 200
    assert response.json() == []


def test_merchant_a_cannot_read_merchant_b_audit_timeline(
    client, make_merchant, make_payment, make_ai_decision, db_session, auth_headers
):
    merchant_a, _merchant_b, payment_b, _decision_b = _setup_two_merchants(
        make_merchant, make_payment, make_ai_decision, db_session
    )
    headers_a = auth_headers(merchant_id=merchant_a.merchant_id)

    response = client.get(f"/audit/payment/{payment_b.id}", headers=headers_a)

    assert response.status_code == 404


def test_merchant_b_can_still_read_its_own_payment_data(
    client, make_merchant, make_payment, make_ai_decision, db_session, auth_headers
):
    """
    The isolation checks above are only meaningful alongside proof that
    the SAME payment remains fully visible to its actual owner —
    otherwise a route that just 404s for everyone would pass every
    isolation test above for the wrong reason.
    """
    _merchant_a, merchant_b, payment_b, _decision_b = _setup_two_merchants(
        make_merchant, make_payment, make_ai_decision, db_session
    )
    headers_b = auth_headers(merchant_id=merchant_b.merchant_id)

    diagnose = client.get(f"/ai-decisions/payment/{payment_b.id}", headers=headers_b)
    audit = client.get(f"/audit/payment/{payment_b.id}", headers=headers_b)

    assert diagnose.status_code == 200
    assert len(diagnose.json()) == 1
    assert audit.status_code == 200


def test_merchants_do_not_see_each_others_metrics(
    client, make_merchant, make_payment, db_session, auth_headers
):
    from decimal import Decimal

    merchant_a = make_merchant(merchant_id=f"isolation_metrics_a_{uuid.uuid4().hex[:8]}")
    merchant_b = make_merchant(merchant_id=f"isolation_metrics_b_{uuid.uuid4().hex[:8]}")
    make_payment(merchant_id=merchant_a.merchant_id, status="recovered", amount=Decimal("100.00"))
    make_payment(merchant_id=merchant_b.merchant_id, status="recovered", amount=Decimal("777.00"))
    db_session.commit()

    response_a = client.get(
        "/metrics/summary", headers=auth_headers(merchant_id=merchant_a.merchant_id)
    )

    assert response_a.status_code == 200
    body_a = response_a.json()
    assert body_a["merchant_id"] == merchant_a.merchant_id
    assert body_a["payments_analyzed"] == 1
    assert Decimal(body_a["revenue_recovered"]) == Decimal("100.00")


def test_webhook_endpoint_requires_no_jwt(client, razorpay_failed_payment_payload, sign, event_id_header) -> None:
    """
    The external Razorpay webhook must keep working with zero user auth
    context — it authenticates itself via signature verification, not a
    bearer token (see app/api/routes/webhooks.py). A regression here
    would break real payment-failure ingestion, not just a test.
    """
    body = razorpay_failed_payment_payload(gateway_payment_id=f"pay_isolation_{uuid.uuid4().hex[:10]}")

    response = client.post(
        "/webhooks/razorpay",
        content=body,
        headers={"x-razorpay-signature": sign(body), **event_id_header()},
    )
    # No Authorization header was sent at all — 401 would mean the
    # webhook route accidentally started requiring one.
    assert response.status_code != 401
