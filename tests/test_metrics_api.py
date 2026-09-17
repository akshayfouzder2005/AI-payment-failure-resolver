"""
GET /metrics/summary API tests — Phase 6.
"""
import uuid
from decimal import Decimal


def test_metrics_summary_on_empty_database(client) -> None:
    response = client.get("/metrics/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["payments_analyzed"] == 0
    assert body["recovery_rate"] == 0.0
    assert body["average_recovery_time_seconds"] is None
    assert body["merchant_id"] is None


def test_metrics_summary_reflects_seeded_rows(client, db_session, make_payment) -> None:
    make_payment(status="recovered", amount=Decimal("500.00"))
    make_payment(status="failed", amount=Decimal("250.00"))
    db_session.commit()

    response = client.get("/metrics/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["payments_analyzed"] >= 2
    assert body["recovered_count"] >= 1
    assert Decimal(body["revenue_recovered"]) >= Decimal("500.00")


def test_metrics_summary_merchant_filter(client, db_session, make_merchant, make_payment) -> None:
    merchant = make_merchant(merchant_id=f"metrics_api_merchant_{uuid.uuid4().hex[:8]}")
    make_payment(merchant_id=merchant.merchant_id, status="recovered", amount=Decimal("111.00"))
    db_session.commit()

    response = client.get("/metrics/summary", params={"merchant_id": merchant.merchant_id})

    assert response.status_code == 200
    body = response.json()
    assert body["merchant_id"] == merchant.merchant_id
    assert body["payments_analyzed"] == 1
    assert body["recovered_count"] == 1
