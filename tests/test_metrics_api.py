"""
GET /metrics/summary API tests — Phase 6.

Phase 7 (auth) BEHAVIOR CHANGE: merchant_id is no longer an optional
query parameter (previously omitting it aggregated across every
merchant, and passing it filtered to one) — it's now always derived
from the caller's bearer token. See app/api/routes/metrics.py's
docstring for why. test_metrics_summary_merchant_filter below now
proves that scoping directly: two merchants both have data, and the
authenticated caller only ever sees its own.
"""
import uuid
from decimal import Decimal


def test_metrics_summary_on_empty_database(client, make_user, auth_headers) -> None:
    user = make_user()

    response = client.get("/metrics/summary", headers=auth_headers(user=user))

    assert response.status_code == 200
    body = response.json()
    assert body["payments_analyzed"] == 0
    assert body["recovery_rate"] == 0.0
    assert body["average_recovery_time_seconds"] is None
    assert body["merchant_id"] == user.merchant_id


def test_metrics_summary_reflects_seeded_rows(client, db_session, make_merchant, make_payment, auth_headers) -> None:
    merchant_id = f"metrics_seeded_merchant_{uuid.uuid4().hex[:8]}"
    make_merchant(merchant_id=merchant_id)
    make_payment(merchant_id=merchant_id, status="recovered", amount=Decimal("500.00"))
    make_payment(merchant_id=merchant_id, status="failed", amount=Decimal("250.00"))
    db_session.commit()

    response = client.get("/metrics/summary", headers=auth_headers(merchant_id=merchant_id))

    assert response.status_code == 200
    body = response.json()
    assert body["payments_analyzed"] >= 2
    assert body["recovered_count"] >= 1
    assert Decimal(body["revenue_recovered"]) >= Decimal("500.00")


def test_metrics_summary_merchant_filter(client, db_session, make_merchant, make_payment, auth_headers) -> None:
    merchant_a = make_merchant(merchant_id=f"metrics_api_merchant_a_{uuid.uuid4().hex[:8]}")
    merchant_b = make_merchant(merchant_id=f"metrics_api_merchant_b_{uuid.uuid4().hex[:8]}")
    make_payment(merchant_id=merchant_a.merchant_id, status="recovered", amount=Decimal("111.00"))
    make_payment(merchant_id=merchant_b.merchant_id, status="recovered", amount=Decimal("999.00"))
    db_session.commit()

    response = client.get("/metrics/summary", headers=auth_headers(merchant_id=merchant_a.merchant_id))

    assert response.status_code == 200
    body = response.json()
    assert body["merchant_id"] == merchant_a.merchant_id
    assert body["payments_analyzed"] == 1
    assert body["recovered_count"] == 1
    assert Decimal(body["revenue_recovered"]) == Decimal("111.00")


def test_metrics_summary_without_token_returns_401(client) -> None:
    response = client.get("/metrics/summary")
    assert response.status_code == 401
