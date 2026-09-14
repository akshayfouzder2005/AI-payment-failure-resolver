"""
PolicyInputBuilder tests — Phase 5. Runs against real Payment/AIDecision/
MerchantSettings/RecoveryAttempt rows (real Postgres, per conftest.py),
proving the connective piece Phase 4 deferred (PHASE_4_NOTES.md) actually
turns real DB state into a correct PolicyEvaluationInput — as opposed to
test_policy_engine.py, which only ever constructs PolicyEvaluationInput
by hand.
"""
from decimal import Decimal

from app.enums import RecoveryActionType, RecoveryAttemptStatus
from app.models.recovery_attempt import RecoveryAttempt
from app.repositories.recovery_attempt_repository import RecoveryAttemptRepository
from app.services.policy_input_builder import PolicyInputBuilder


def test_build_maps_payment_and_ai_decision_fields(db_session, make_payment, make_ai_decision):
    payment = make_payment(amount=Decimal("750.00"), currency="INR")
    decision = make_ai_decision(
        payment.id,
        failure_category="CARD_DECLINED",
        recommended_action="SEND_PAYMENT_LINK",
        confidence=0.85,
        recovery_probability=0.6,
    )

    result = PolicyInputBuilder(db_session).build(payment, decision)

    assert result.payment_id == payment.id
    assert result.payment_amount == Decimal("750.00")
    assert result.currency == "INR"
    assert result.failure_category == "CARD_DECLINED"
    assert result.recommended_action == "SEND_PAYMENT_LINK"
    assert result.ai_confidence == 0.85
    assert result.ai_recovery_probability == 0.6


def test_build_maps_merchant_policy_limits(db_session, make_merchant, make_payment, make_ai_decision):
    merchant = make_merchant(
        merchant_id="policy_input_merchant",
        max_retry_count=5,
        retry_delay_minutes=30,
        high_risk_amount_threshold=Decimal("10000.00"),
        escalation_failure_threshold=4,
        auto_recovery_enabled=False,
    )
    payment = make_payment(merchant_id=merchant.merchant_id)
    decision = make_ai_decision(payment.id)

    result = PolicyInputBuilder(db_session).build(payment, decision)

    assert result.merchant_policy.merchant_id == "policy_input_merchant"
    assert result.merchant_policy.max_retry_count == 5
    assert result.merchant_policy.retry_delay_minutes == 30
    assert result.merchant_policy.high_risk_amount_threshold == Decimal("10000.00")
    assert result.merchant_policy.escalation_failure_threshold == 4
    assert result.merchant_policy.auto_recovery_enabled is False


def test_build_with_no_recovery_history_defaults_to_zero(db_session, make_payment, make_ai_decision):
    payment = make_payment()
    decision = make_ai_decision(payment.id)

    result = PolicyInputBuilder(db_session).build(payment, decision)

    assert result.retry_history.retry_attempt_count == 0
    assert result.retry_history.failed_attempt_count == 0
    assert result.retry_history.last_retry_attempted_at is None


def test_build_counts_prior_retry_and_failed_attempts(db_session, make_payment, make_ai_decision):
    payment = make_payment()
    decision = make_ai_decision(payment.id)
    repo = RecoveryAttemptRepository(db_session)

    # Two prior RETRY_PAYMENT attempts (one failed, one succeeded), plus
    # one unrelated failed SEND_NOTIFICATION attempt.
    repo.add(
        RecoveryAttempt(
            payment_id=payment.id,
            action_type=RecoveryActionType.RETRY_PAYMENT.value,
            attempt_number=1,
            status=RecoveryAttemptStatus.FAILED.value,
        )
    )
    repo.add(
        RecoveryAttempt(
            payment_id=payment.id,
            action_type=RecoveryActionType.RETRY_PAYMENT.value,
            attempt_number=2,
            status=RecoveryAttemptStatus.SUCCESS.value,
        )
    )
    repo.add(
        RecoveryAttempt(
            payment_id=payment.id,
            action_type=RecoveryActionType.SEND_NOTIFICATION.value,
            attempt_number=3,
            status=RecoveryAttemptStatus.FAILED.value,
        )
    )
    db_session.commit()

    result = PolicyInputBuilder(db_session).build(payment, decision)

    assert result.retry_history.retry_attempt_count == 2
    assert result.retry_history.failed_attempt_count == 2
    assert result.retry_history.last_retry_attempted_at is not None


def test_build_falls_back_to_safe_defaults_for_null_ai_fields(db_session, make_payment, make_ai_decision):
    """
    Defensive path: AIDecision.failure_category/recommended_action are
    nullable at the DB level even though AIDecisionService never leaves
    them null in practice (see its two AIDecision(...) construction
    sites) — PolicyInputBuilder shouldn't hand the policy engine a raw
    None for either.
    """
    payment = make_payment()
    decision = make_ai_decision(payment.id, failure_category=None, recommended_action=None)

    result = PolicyInputBuilder(db_session).build(payment, decision)

    assert result.failure_category == "UNKNOWN"
    assert result.recommended_action == RecoveryActionType.NO_ACTION.value
