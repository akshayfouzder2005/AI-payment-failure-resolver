"""
API tests for /ai-decisions — Phase 3.

Exercises the route layer specifically (status codes, response shape,
404 handling) on top of the service-level tests in
test_ai_decision_service.py. Uses the default provider from settings
(AI_PROVIDER=mock in this environment), so no credentials are needed.
"""
import uuid


def test_diagnose_returns_200_with_decision_json(client, make_payment) -> None:
    payment = make_payment(failure_message="Insufficient funds in the customer's account")

    response = client.post(f"/ai-decisions/diagnose/{payment.id}")

    assert response.status_code == 200
    body = response.json()
    assert body["payment_id"] == str(payment.id)
    assert body["recommended_action"] in {
        "RETRY_PAYMENT",
        "SEND_PAYMENT_LINK",
        "SEND_NOTIFICATION",
        "ESCALATE_TO_MERCHANT",
        "NO_ACTION",
    }
    assert "risk_factors" in body
    assert "raw_response" in body


def test_diagnose_unknown_payment_returns_404(client) -> None:
    response = client.post(f"/ai-decisions/diagnose/{uuid.uuid4()}")
    assert response.status_code == 404


def test_list_decisions_for_payment(client, make_payment) -> None:
    payment = make_payment()
    client.post(f"/ai-decisions/diagnose/{payment.id}")
    client.post(f"/ai-decisions/diagnose/{payment.id}")

    response = client.get(f"/ai-decisions/payment/{payment.id}")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert all(d["payment_id"] == str(payment.id) for d in body)


def test_list_decisions_for_payment_with_none_is_empty(client, make_payment) -> None:
    payment = make_payment()
    response = client.get(f"/ai-decisions/payment/{payment.id}")
    assert response.status_code == 200
    assert response.json() == []
