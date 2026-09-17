"""
MetricsService tests — Phase 6. Runs against real Postgres (per
conftest.py), constructing Payment/RecoveryAttempt rows directly via the
make_payment/make_recovery_attempt fixtures rather than driving the full
webhook->AI->policy->execution pipeline — MetricsService only ever reads
already-persisted rows, so these tests exercise exactly that: given rows
in this shape, does get_summary() return this exact number.
"""
from datetime import timedelta
from decimal import Decimal

from app.services.metrics_service import MetricsService


def test_empty_database_returns_zeroes_not_errors(db_session) -> None:
    summary = MetricsService(db_session).get_summary()

    assert summary.payments_analyzed == 0
    assert summary.revenue_at_risk == Decimal("0")
    assert summary.revenue_recovered == Decimal("0")
    assert summary.recovered_count == 0
    assert summary.escalated_count == 0
    assert summary.automatically_recovered_count == 0
    assert summary.recovery_rate == 0.0
    assert summary.automatic_recovery_rate == 0.0
    assert summary.escalation_rate == 0.0
    assert summary.recovery_attempt_success_rate == 0.0
    assert summary.average_recovery_time_seconds is None
    assert summary.failed_or_blocked_intervention_count == 0


def test_revenue_at_risk_sums_unresolved_payments_only(db_session, make_payment) -> None:
    make_payment(amount=Decimal("100.00"), status="failed")
    make_payment(amount=Decimal("200.00"), status="retry_scheduled")
    make_payment(amount=Decimal("300.00"), status="escalated")
    make_payment(amount=Decimal("400.00"), status="recovered")  # NOT at risk
    make_payment(amount=Decimal("500.00"), status="abandoned")  # NOT at risk
    db_session.commit()

    summary = MetricsService(db_session).get_summary()

    assert summary.revenue_at_risk == Decimal("600.00")  # 100 + 200 + 300
    assert summary.revenue_recovered == Decimal("400.00")
    assert summary.payments_analyzed == 5


def test_recovery_rate_counts_recovered_status(db_session, make_payment) -> None:
    make_payment(status="recovered")
    make_payment(status="recovered")
    make_payment(status="failed")
    make_payment(status="failed")
    db_session.commit()

    summary = MetricsService(db_session).get_summary()

    assert summary.recovered_count == 2
    assert summary.payments_analyzed == 4
    assert summary.recovery_rate == 0.5


def test_automatic_recovery_rate_only_counts_successful_retry_payment(
    db_session, make_payment, make_ai_decision, make_recovery_attempt
) -> None:
    """
    A successful SEND_PAYMENT_LINK only moves a payment to
    'retry_scheduled' (see RecoveryExecutionService's success-status
    transition map) — it must NOT count as an automatic recovery, even
    though the RecoveryAttempt itself succeeded.
    """
    auto_recovered = make_payment(status="recovered")
    decision_a = make_ai_decision(auto_recovered.id)
    make_recovery_attempt(
        auto_recovered.id, ai_decision_id=decision_a.id, action_type="RETRY_PAYMENT", status="success"
    )

    link_sent = make_payment(status="retry_scheduled")
    decision_b = make_ai_decision(link_sent.id, recommended_action="SEND_PAYMENT_LINK")
    make_recovery_attempt(
        link_sent.id, ai_decision_id=decision_b.id, action_type="SEND_PAYMENT_LINK", status="success"
    )
    db_session.commit()

    summary = MetricsService(db_session).get_summary()

    assert summary.automatically_recovered_count == 1
    assert summary.automatic_recovery_rate == 0.5  # 1 of 2 payments


def test_escalation_rate_counts_escalated_status(db_session, make_payment) -> None:
    make_payment(status="escalated")
    make_payment(status="failed")
    make_payment(status="failed")
    make_payment(status="failed")
    db_session.commit()

    summary = MetricsService(db_session).get_summary()

    assert summary.escalated_count == 1
    assert summary.escalation_rate == 0.25


def test_recovery_attempt_success_rate_excludes_skipped(
    db_session, make_payment, make_recovery_attempt
) -> None:
    """
    A SKIPPED attempt (the policy engine blocking the AI's recommendation
    into a NO_ACTION no-op) was never a real attempt at recovery, so it
    must not water down the success rate's denominator.
    """
    p1 = make_payment()
    make_recovery_attempt(p1.id, status="success")
    p2 = make_payment()
    make_recovery_attempt(p2.id, status="success")
    p3 = make_payment()
    make_recovery_attempt(p3.id, status="failed")
    p4 = make_payment()
    make_recovery_attempt(p4.id, status="skipped", action_type="NO_ACTION")
    db_session.commit()

    summary = MetricsService(db_session).get_summary()

    # 2 success / (2 success + 1 failed) = 0.6667 — skipped excluded entirely
    assert summary.recovery_attempt_success_rate == round(2 / 3, 4)


def test_failed_or_blocked_intervention_count_sums_failed_and_skipped(
    db_session, make_payment, make_recovery_attempt
) -> None:
    p1 = make_payment()
    make_recovery_attempt(p1.id, status="failed")
    p2 = make_payment()
    make_recovery_attempt(p2.id, status="skipped", action_type="NO_ACTION")
    p3 = make_payment()
    make_recovery_attempt(p3.id, status="success")
    db_session.commit()

    summary = MetricsService(db_session).get_summary()

    assert summary.failed_or_blocked_intervention_count == 2


def test_average_recovery_time_seconds_uses_created_at_to_completed_at(
    db_session, make_payment, make_recovery_attempt
) -> None:
    from datetime import datetime, timezone

    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)

    payment_a = make_payment(created_at=t0)
    make_recovery_attempt(
        payment_a.id, status="success", action_type="RETRY_PAYMENT", completed_at=t0 + timedelta(seconds=60)
    )

    payment_b = make_payment(created_at=t0)
    make_recovery_attempt(
        payment_b.id, status="success", action_type="RETRY_PAYMENT", completed_at=t0 + timedelta(seconds=180)
    )
    db_session.commit()

    summary = MetricsService(db_session).get_summary()

    assert summary.average_recovery_time_seconds == 120.0  # (60 + 180) / 2


def test_merchant_id_filter_scopes_all_metrics(
    db_session, make_merchant, make_payment
) -> None:
    merchant_a = make_merchant(merchant_id="metrics_merchant_a")
    merchant_b = make_merchant(merchant_id="metrics_merchant_b")
    make_payment(merchant_id=merchant_a.merchant_id, status="recovered", amount=Decimal("100.00"))
    make_payment(merchant_id=merchant_b.merchant_id, status="failed", amount=Decimal("999.00"))
    db_session.commit()

    summary_a = MetricsService(db_session).get_summary(merchant_id=merchant_a.merchant_id)

    assert summary_a.payments_analyzed == 1
    assert summary_a.recovered_count == 1
    assert summary_a.revenue_at_risk == Decimal("0")

    summary_all = MetricsService(db_session).get_summary()
    assert summary_all.payments_analyzed >= 2
