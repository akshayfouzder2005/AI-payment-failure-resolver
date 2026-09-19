"""
API tests for /recovery — Phase 5.

test_full_demo_flow_via_http below is the complete pipeline the PRIMARY
DEMO FLOW describes, driven entirely through the same HTTP surface a
frontend or curl would use: simulate a failed payment -> diagnose it ->
execute recovery -> inspect the resulting attempt and audit trail.

Phase 7 (auth): every protected call needs a bearer token scoped to the
payment's own merchant. /simulate/failed-payment itself stays
unauthenticated (see app/api/routes/simulate.py) — it plays the same
role a real, signature-verified Razorpay webhook would, and always
attributes the payment to settings.default_merchant_id, so the demo
flow's auth token is created only after that call, once the default
merchant is guaranteed to exist (see PaymentService.ensure_default_merchant).
"""
import uuid

from app.config import get_settings


def test_execute_returns_200_with_result_json(
    client, make_payment, make_ai_decision, db_session, auth_headers
):
    payment = make_payment()
    make_ai_decision(payment.id, recommended_action="RETRY_PAYMENT", confidence=0.9)
    db_session.commit()

    response = client.post(
        f"/recovery/execute/{payment.id}", headers=auth_headers(merchant_id=payment.merchant_id)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["payment_id"] == str(payment.id)
    assert body["policy_decision"] in {"APPROVE", "MODIFY", "REJECT", "ESCALATE"}
    assert body["recovery_attempt"]["action_type"] in {
        "RETRY_PAYMENT",
        "SEND_PAYMENT_LINK",
        "SEND_NOTIFICATION",
        "ESCALATE_TO_MERCHANT",
        "NO_ACTION",
    }
    assert body["recovery_attempt"]["status"] in {"success", "failed", "skipped"}


def test_execute_unknown_payment_returns_404(client, auth_headers) -> None:
    response = client.post(f"/recovery/execute/{uuid.uuid4()}", headers=auth_headers())
    assert response.status_code == 404


def test_execute_with_no_ai_decision_returns_409(client, make_payment, auth_headers) -> None:
    payment = make_payment()
    response = client.post(
        f"/recovery/execute/{payment.id}", headers=auth_headers(merchant_id=payment.merchant_id)
    )
    assert response.status_code == 409


def test_execute_honors_explicit_ai_decision_id_query_param(
    client, make_payment, make_ai_decision, db_session, auth_headers
):
    payment = make_payment()
    decision = make_ai_decision(payment.id, recommended_action="SEND_NOTIFICATION", confidence=0.9)
    db_session.commit()

    response = client.post(
        f"/recovery/execute/{payment.id}?ai_decision_id={decision.id}",
        headers=auth_headers(merchant_id=payment.merchant_id),
    )

    assert response.status_code == 200
    assert response.json()["ai_decision_id"] == str(decision.id)


def test_list_recovery_attempts_for_payment(
    client, make_payment, make_ai_decision, db_session, auth_headers
):
    payment = make_payment()
    make_ai_decision(payment.id, recommended_action="RETRY_PAYMENT", confidence=0.9)
    db_session.commit()
    headers = auth_headers(merchant_id=payment.merchant_id)

    client.post(f"/recovery/execute/{payment.id}", headers=headers)
    response = client.get(f"/recovery/payment/{payment.id}", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["payment_id"] == str(payment.id)


def test_list_recovery_attempts_with_none_is_empty(client, make_payment, auth_headers) -> None:
    payment = make_payment()
    response = client.get(
        f"/recovery/payment/{payment.id}", headers=auth_headers(merchant_id=payment.merchant_id)
    )
    assert response.status_code == 200
    assert response.json() == []


def test_execute_without_token_returns_401(client, make_payment) -> None:
    payment = make_payment()
    response = client.post(f"/recovery/execute/{payment.id}")
    assert response.status_code == 401


def test_full_demo_flow_via_http(client, razorpay_failed_payment_payload, auth_headers) -> None:
    """
    FAILED PAYMENT -> WEBHOOK -> AI DECISION -> POLICY DECISION ->
    ACTION EXECUTION -> RESULT -> AUDIT LOG, driven end-to-end through
    the same three HTTP endpoints a frontend or curl would call.
    """
    # 1. A failed payment arrives (via the no-credential simulate route,
    #    always attributed to the default merchant).
    sim_response = client.post(
        "/simulate/failed-payment",
        json={"failure_code": "INSUFFICIENT_FUNDS", "amount": "500.00"},
    )
    assert sim_response.status_code == 200
    payment_id = sim_response.json()["payment_id"]

    # The default merchant now exists (simulate's ingestion path
    # provisions it) — authenticate as a user belonging to it.
    headers = auth_headers(merchant_id=get_settings().default_merchant_id)

    # 2. The AI diagnoses it and recommends an action.
    diagnose_response = client.post(f"/ai-decisions/diagnose/{payment_id}", headers=headers)
    assert diagnose_response.status_code == 200

    # 3. The policy engine validates the recommendation and the approved
    #    action executes.
    execute_response = client.post(f"/recovery/execute/{payment_id}", headers=headers)
    assert execute_response.status_code == 200
    result = execute_response.json()
    assert result["payment_id"] == payment_id
    assert result["recovery_attempt"]["status"] in {"success", "failed", "skipped"}

    # 4. The full attempt + audit trail is inspectable afterwards.
    attempts_response = client.get(f"/recovery/payment/{payment_id}", headers=headers)
    assert attempts_response.status_code == 200
    assert len(attempts_response.json()) == 1
    assert attempts_response.json()[0]["id"] == result["recovery_attempt"]["id"]
