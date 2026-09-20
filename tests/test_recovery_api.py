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
from app.enums import AuditAction


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


def test_full_demo_flow_via_http(client, auth_headers) -> None:
    """
    FAILED PAYMENT -> WEBHOOK -> AI DECISION -> POLICY DECISION ->
    ACTION EXECUTION -> RESULT -> AUDIT LOG, completing automatically
    from a single call — this is what the PRIMARY DEMO FLOW actually
    promises now that app/services/recovery_pipeline.py auto-chains
    diagnosis and execution after ingestion (see that module's
    docstring). No manual diagnose/execute call anywhere in this test;
    that's the point.
    """
    # 1. A failed payment arrives (via the no-credential simulate route,
    #    always attributed to the default merchant unless overridden).
    #    Insufficient-funds framing -> MockLLMProvider deterministically
    #    recommends RETRY_PAYMENT, which the default merchant policy
    #    approves at this amount, and MockPaymentGatewayClient succeeds
    #    deterministically -> the whole chain lands on "recovered", not
    #    a flaky/random outcome.
    sim_response = client.post(
        "/simulate/failed-payment",
        json={"failure_message": "Insufficient funds in the customer's account", "amount": "500.00"},
    )
    assert sim_response.status_code == 200
    payment_id = sim_response.json()["payment_id"]
    # The HTTP response itself still reflects ingestion-time state — the
    # background pipeline runs AFTER this response is built, even though
    # (in tests) it's finished by the time client.post() returns.
    assert sim_response.json()["payment_status"] == "failed"

    # The default merchant now exists (simulate's ingestion path
    # provisions it) — authenticate as a user belonging to it to inspect
    # what the background pipeline did.
    headers = auth_headers(merchant_id=get_settings().default_merchant_id)

    # 2 & 3. AI diagnosis and policy-gated execution already happened,
    #    with no manual call in between.
    decisions_response = client.get(f"/ai-decisions/payment/{payment_id}", headers=headers)
    assert decisions_response.status_code == 200
    decisions = decisions_response.json()
    assert len(decisions) == 1
    assert decisions[0]["recommended_action"] == "RETRY_PAYMENT"

    attempts_response = client.get(f"/recovery/payment/{payment_id}", headers=headers)
    assert attempts_response.status_code == 200
    attempts = attempts_response.json()
    assert len(attempts) == 1
    assert attempts[0]["ai_decision_id"] == decisions[0]["id"]
    assert attempts[0]["status"] == "success"

    # 4. The payment itself reflects the outcome, and the metrics and
    #    audit trail an actual dashboard would show are consistent with
    #    it — the full chain the ORIGINAL spec's PRIMARY DEMO FLOW
    #    describes, driven by one HTTP call.
    payment_response = client.get(f"/payments/{payment_id}", headers=headers)
    assert payment_response.status_code == 200
    assert payment_response.json()["status"] == "recovered"

    audit_response = client.get(f"/audit/payment/{payment_id}", headers=headers)
    assert audit_response.status_code == 200
    audit_actions = {entry["action"] for entry in audit_response.json()}
    assert AuditAction.PAYMENT_RECOVERED.value in audit_actions
    assert AuditAction.PROCESSING_STOPPED.value not in audit_actions


def test_manual_diagnose_and_execute_still_work_after_auto_chain(client, auth_headers) -> None:
    """
    The auto-chain doesn't retire the manual on-demand endpoints — a
    caller can still explicitly re-diagnose/re-execute a payment (e.g.
    after merchant settings changed). AIDecision is append-only by
    design, so this produces a SECOND decision and a SECOND recovery
    attempt alongside the auto-chain's — not an error, not a replay.
    """
    sim_response = client.post("/simulate/failed-payment", json={"amount": "500.00"})
    payment_id = sim_response.json()["payment_id"]
    headers = auth_headers(merchant_id=get_settings().default_merchant_id)

    # Auto-chain already produced one of each.
    assert len(client.get(f"/ai-decisions/payment/{payment_id}", headers=headers).json()) == 1
    assert len(client.get(f"/recovery/payment/{payment_id}", headers=headers).json()) == 1

    manual_diagnose = client.post(f"/ai-decisions/diagnose/{payment_id}", headers=headers)
    assert manual_diagnose.status_code == 200
    manual_execute = client.post(f"/recovery/execute/{payment_id}", headers=headers)
    assert manual_execute.status_code == 200

    assert len(client.get(f"/ai-decisions/payment/{payment_id}", headers=headers).json()) == 2
    assert len(client.get(f"/recovery/payment/{payment_id}", headers=headers).json()) == 2

