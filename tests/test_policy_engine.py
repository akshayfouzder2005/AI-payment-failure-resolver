"""
PolicyEngine tests — Phase 4.

No `db_session`, no `client`, no Postgres: the whole point of a pure,
no-I/O policy engine is that every rule is verifiable with nothing more
than "construct an input, call evaluate(), assert on the output." Each
rule from the Phase 4 rule table gets its own trigger test, its own
boundary/edge-case test, and there's a dedicated section at the bottom
for precedence (what happens when more than one rule's condition is
simultaneously true).
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.enums import FailureCategory, RecoveryActionType
from app.policy_engine import MIN_CONFIDENCE_FOR_AUTO_APPROVAL, PolicyEngine
from app.schemas.policy import (
    MerchantPolicyLimits,
    PolicyDecision,
    PolicyDecisionType,
    PolicyEvaluationInput,
    RetryHistory,
)

NOW = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)


def build_input(**overrides) -> PolicyEvaluationInput:
    """
    Factory mirroring test_mock_llm_provider.py's build_context() —
    sensible defaults for a payment that should sail through every rule
    untouched (APPROVE), overridable per test so each test only states
    the one thing it's actually testing.
    """
    merchant_overrides = overrides.pop("merchant_policy_overrides", {})
    merchant_defaults = dict(
        merchant_id="test_merchant",
        max_retry_count=3,
        retry_delay_minutes=60,
        high_risk_amount_threshold=Decimal("50000.00"),
        escalation_failure_threshold=3,
        auto_recovery_enabled=True,
    )
    merchant_defaults.update(merchant_overrides)

    defaults = dict(
        payment_id=uuid4(),
        payment_amount=Decimal("999.00"),
        currency="INR",
        failure_category=FailureCategory.INSUFFICIENT_FUNDS.value,
        recommended_action=RecoveryActionType.RETRY_PAYMENT.value,
        ai_confidence=0.85,
        ai_recovery_probability=0.55,
        retry_history=RetryHistory(),
        merchant_policy=MerchantPolicyLimits(**merchant_defaults),
        evaluated_at=NOW,
    )
    defaults.update(overrides)
    return PolicyEvaluationInput(**defaults)


@pytest.fixture
def engine() -> PolicyEngine:
    return PolicyEngine()


# ---------------------------------------------------------------------------
# APPROVE
# ---------------------------------------------------------------------------


def test_clean_recommendation_is_approved(engine) -> None:
    decision = engine.evaluate(build_input())

    assert decision.decision == PolicyDecisionType.APPROVE
    assert decision.final_action == RecoveryActionType.RETRY_PAYMENT
    assert decision.violated_rules == []


@pytest.mark.parametrize(
    "action",
    [
        RecoveryActionType.SEND_PAYMENT_LINK,
        RecoveryActionType.SEND_NOTIFICATION,
        RecoveryActionType.ESCALATE_TO_MERCHANT,
        RecoveryActionType.NO_ACTION,
    ],
)
def test_non_retry_actions_pass_through_unchanged_when_clean(engine, action) -> None:
    decision = engine.evaluate(build_input(recommended_action=action.value))

    assert decision.decision == PolicyDecisionType.APPROVE
    assert decision.final_action == action


def test_approval_metadata_always_includes_engine_version_and_merchant(engine) -> None:
    decision = engine.evaluate(build_input())

    assert decision.approval_metadata["engine_version"] == "policy-engine-v1"
    assert decision.approval_metadata["merchant_id"] == "test_merchant"


def test_decision_is_immutable(engine) -> None:
    decision = engine.evaluate(build_input())
    with pytest.raises(ValidationError):
        decision.decision = PolicyDecisionType.REJECT


def test_evaluate_is_deterministic_across_repeated_calls(engine) -> None:
    payload = build_input(retry_history=RetryHistory(retry_attempt_count=5))
    first = engine.evaluate(payload)
    second = engine.evaluate(payload)

    assert first == second


# ---------------------------------------------------------------------------
# Rule 1: UNSUPPORTED_ACTION
# ---------------------------------------------------------------------------


def test_unsupported_action_is_rejected_and_escalated(engine) -> None:
    decision = engine.evaluate(build_input(recommended_action="REFUND_EVERYTHING"))

    assert decision.decision == PolicyDecisionType.REJECT
    assert decision.final_action == RecoveryActionType.ESCALATE_TO_MERCHANT
    assert decision.violated_rules == ["UNSUPPORTED_ACTION"]
    assert decision.ai_recommended_action == "REFUND_EVERYTHING"


def test_empty_string_action_is_rejected(engine) -> None:
    decision = engine.evaluate(build_input(recommended_action=""))

    assert decision.decision == PolicyDecisionType.REJECT
    assert decision.violated_rules == ["UNSUPPORTED_ACTION"]


# ---------------------------------------------------------------------------
# Rule 2: FRAUD_SUSPECTED_BLOCK
# ---------------------------------------------------------------------------


def test_fraud_suspected_blocks_to_no_action(engine) -> None:
    decision = engine.evaluate(
        build_input(
            failure_category=FailureCategory.FRAUD_SUSPECTED.value,
            recommended_action=RecoveryActionType.RETRY_PAYMENT.value,
        )
    )

    assert decision.decision == PolicyDecisionType.REJECT
    assert decision.final_action == RecoveryActionType.NO_ACTION
    assert decision.violated_rules == ["FRAUD_SUSPECTED_BLOCK"]


def test_fraud_suspected_blocks_even_an_escalate_recommendation(engine) -> None:
    """Fraud is a hard stop — even the AI's own ESCALATE_TO_MERCHANT gets overridden to NO_ACTION."""
    decision = engine.evaluate(
        build_input(
            failure_category=FailureCategory.FRAUD_SUSPECTED.value,
            recommended_action=RecoveryActionType.ESCALATE_TO_MERCHANT.value,
        )
    )

    assert decision.decision == PolicyDecisionType.REJECT
    assert decision.final_action == RecoveryActionType.NO_ACTION


def test_unrecognized_failure_category_does_not_trigger_fraud_block(engine) -> None:
    """Fails open on this one rule for an unrecognized category — see policy_engine.py's _is_fraud_suspected docstring."""
    decision = engine.evaluate(build_input(failure_category="SOME_NEW_CATEGORY_NOT_YET_MAPPED"))

    assert "FRAUD_SUSPECTED_BLOCK" not in decision.violated_rules


# ---------------------------------------------------------------------------
# Rule 3: AUTO_RECOVERY_DISABLED
# ---------------------------------------------------------------------------


def test_auto_recovery_disabled_suppresses_retry_to_no_action(engine) -> None:
    decision = engine.evaluate(
        build_input(merchant_policy_overrides={"auto_recovery_enabled": False})
    )

    assert decision.decision == PolicyDecisionType.MODIFY
    assert decision.final_action == RecoveryActionType.NO_ACTION
    assert decision.violated_rules == ["AUTO_RECOVERY_DISABLED"]


def test_auto_recovery_disabled_still_allows_escalate_through(engine) -> None:
    decision = engine.evaluate(
        build_input(
            recommended_action=RecoveryActionType.ESCALATE_TO_MERCHANT.value,
            merchant_policy_overrides={"auto_recovery_enabled": False},
        )
    )

    assert decision.decision == PolicyDecisionType.APPROVE
    assert decision.final_action == RecoveryActionType.ESCALATE_TO_MERCHANT


def test_auto_recovery_disabled_still_allows_no_action_through(engine) -> None:
    decision = engine.evaluate(
        build_input(
            recommended_action=RecoveryActionType.NO_ACTION.value,
            merchant_policy_overrides={"auto_recovery_enabled": False},
        )
    )

    assert decision.decision == PolicyDecisionType.APPROVE
    assert decision.final_action == RecoveryActionType.NO_ACTION


# ---------------------------------------------------------------------------
# Rule 4: REPEATED_FAILURES_THRESHOLD
# ---------------------------------------------------------------------------


def test_repeated_failures_forces_escalation(engine) -> None:
    decision = engine.evaluate(
        build_input(
            retry_history=RetryHistory(failed_attempt_count=3),
            merchant_policy_overrides={"escalation_failure_threshold": 3},
        )
    )

    assert decision.decision == PolicyDecisionType.ESCALATE
    assert decision.final_action == RecoveryActionType.ESCALATE_TO_MERCHANT
    assert decision.violated_rules == ["REPEATED_FAILURES_THRESHOLD"]


def test_repeated_failures_below_threshold_does_not_escalate(engine) -> None:
    decision = engine.evaluate(
        build_input(
            retry_history=RetryHistory(failed_attempt_count=2),
            merchant_policy_overrides={"escalation_failure_threshold": 3},
        )
    )

    assert "REPEATED_FAILURES_THRESHOLD" not in decision.violated_rules


def test_repeated_failures_when_ai_already_recommends_escalate_is_a_clean_approve(engine) -> None:
    """If the AI already said ESCALATE_TO_MERCHANT, the rule has nothing to force — it's a plain approve, not a second ESCALATE verdict layered on top."""
    decision = engine.evaluate(
        build_input(
            recommended_action=RecoveryActionType.ESCALATE_TO_MERCHANT.value,
            retry_history=RetryHistory(failed_attempt_count=5),
            merchant_policy_overrides={"escalation_failure_threshold": 3},
        )
    )

    assert decision.decision == PolicyDecisionType.APPROVE
    assert decision.violated_rules == []


# ---------------------------------------------------------------------------
# Rule 5: MAX_RETRY_COUNT_EXCEEDED
# ---------------------------------------------------------------------------


def test_max_retry_count_exceeded_matches_spec_example(engine) -> None:
    """
    The exact example from the Phase 4 brief:
        AI: RETRY_PAYMENT
        Policy: retry_count = 3, max_retry_count = 2
        Result: REJECT / ESCALATE_TO_MERCHANT
    """
    decision = engine.evaluate(
        build_input(
            retry_history=RetryHistory(retry_attempt_count=3),
            merchant_policy_overrides={"max_retry_count": 2},
        )
    )

    assert decision.decision == PolicyDecisionType.REJECT
    assert decision.final_action == RecoveryActionType.ESCALATE_TO_MERCHANT
    assert decision.violated_rules == ["MAX_RETRY_COUNT_EXCEEDED"]


def test_retry_count_exactly_at_max_is_rejected(engine) -> None:
    """Boundary: >= , not > — reaching the max is enough, not just exceeding it."""
    decision = engine.evaluate(
        build_input(
            retry_history=RetryHistory(retry_attempt_count=2),
            merchant_policy_overrides={"max_retry_count": 2},
        )
    )

    assert decision.decision == PolicyDecisionType.REJECT


def test_retry_count_below_max_is_approved(engine) -> None:
    decision = engine.evaluate(
        build_input(
            retry_history=RetryHistory(retry_attempt_count=1),
            merchant_policy_overrides={"max_retry_count": 2},
        )
    )

    assert decision.decision == PolicyDecisionType.APPROVE


def test_max_retry_rule_only_applies_to_retry_payment_action(engine) -> None:
    """A high retry_attempt_count shouldn't block a SEND_NOTIFICATION recommendation."""
    decision = engine.evaluate(
        build_input(
            recommended_action=RecoveryActionType.SEND_NOTIFICATION.value,
            retry_history=RetryHistory(retry_attempt_count=10),
            merchant_policy_overrides={"max_retry_count": 2},
        )
    )

    assert decision.decision == PolicyDecisionType.APPROVE
    assert decision.final_action == RecoveryActionType.SEND_NOTIFICATION


# ---------------------------------------------------------------------------
# Rule 6: RETRY_DELAY_NOT_ELAPSED
# ---------------------------------------------------------------------------


def test_retry_too_soon_after_last_attempt_is_modified_to_no_action(engine) -> None:
    decision = engine.evaluate(
        build_input(
            retry_history=RetryHistory(
                retry_attempt_count=1, last_retry_attempted_at=NOW - timedelta(minutes=10)
            ),
            merchant_policy_overrides={"retry_delay_minutes": 60},
            evaluated_at=NOW,
        )
    )

    assert decision.decision == PolicyDecisionType.MODIFY
    assert decision.final_action == RecoveryActionType.NO_ACTION
    assert decision.violated_rules == ["RETRY_DELAY_NOT_ELAPSED"]
    assert "retry_available_at" in decision.approval_metadata


def test_retry_after_delay_window_has_elapsed_is_approved(engine) -> None:
    decision = engine.evaluate(
        build_input(
            retry_history=RetryHistory(
                retry_attempt_count=1, last_retry_attempted_at=NOW - timedelta(minutes=90)
            ),
            merchant_policy_overrides={"retry_delay_minutes": 60},
            evaluated_at=NOW,
        )
    )

    assert decision.decision == PolicyDecisionType.APPROVE


def test_retry_delay_with_no_prior_attempt_is_not_blocked(engine) -> None:
    """RetryHistory() default (no last_retry_attempted_at) means this is the first attempt — nothing to be 'too soon' after."""
    decision = engine.evaluate(build_input(retry_history=RetryHistory()))

    assert "RETRY_DELAY_NOT_ELAPSED" not in decision.violated_rules


# ---------------------------------------------------------------------------
# Rule 7: HIGH_VALUE_AUTO_RETRY_DISALLOWED
# ---------------------------------------------------------------------------


def test_high_value_retry_is_downgraded_to_payment_link(engine) -> None:
    decision = engine.evaluate(
        build_input(
            payment_amount=Decimal("75000.00"),
            merchant_policy_overrides={"high_risk_amount_threshold": Decimal("50000.00")},
        )
    )

    assert decision.decision == PolicyDecisionType.MODIFY
    assert decision.final_action == RecoveryActionType.SEND_PAYMENT_LINK
    assert decision.violated_rules == ["HIGH_VALUE_AUTO_RETRY_DISALLOWED"]


def test_amount_exactly_at_threshold_is_not_high_value(engine) -> None:
    """Boundary: strictly greater-than the threshold, not >= — an amount equal to the threshold is still normal."""
    decision = engine.evaluate(
        build_input(
            payment_amount=Decimal("50000.00"),
            merchant_policy_overrides={"high_risk_amount_threshold": Decimal("50000.00")},
        )
    )

    assert "HIGH_VALUE_AUTO_RETRY_DISALLOWED" not in decision.violated_rules


def test_high_value_non_retry_action_is_untouched(engine) -> None:
    decision = engine.evaluate(
        build_input(
            recommended_action=RecoveryActionType.SEND_NOTIFICATION.value,
            payment_amount=Decimal("999999.00"),
            merchant_policy_overrides={"high_risk_amount_threshold": Decimal("50000.00")},
        )
    )

    assert decision.decision == PolicyDecisionType.APPROVE
    assert decision.final_action == RecoveryActionType.SEND_NOTIFICATION


# ---------------------------------------------------------------------------
# Rule 8: LOW_AI_CONFIDENCE
# ---------------------------------------------------------------------------


def test_low_confidence_forces_escalation(engine) -> None:
    decision = engine.evaluate(build_input(ai_confidence=0.55))

    assert decision.decision == PolicyDecisionType.ESCALATE
    assert decision.final_action == RecoveryActionType.ESCALATE_TO_MERCHANT
    assert decision.violated_rules == ["LOW_AI_CONFIDENCE"]


def test_confidence_exactly_at_threshold_is_approved(engine) -> None:
    """Boundary: strictly less-than the threshold triggers, not <=."""
    decision = engine.evaluate(build_input(ai_confidence=MIN_CONFIDENCE_FOR_AUTO_APPROVAL))

    assert "LOW_AI_CONFIDENCE" not in decision.violated_rules


def test_low_confidence_already_recommending_escalate_is_a_clean_approve(engine) -> None:
    decision = engine.evaluate(
        build_input(
            recommended_action=RecoveryActionType.ESCALATE_TO_MERCHANT.value, ai_confidence=0.0
        )
    )

    assert decision.decision == PolicyDecisionType.APPROVE
    assert decision.violated_rules == []


def test_custom_confidence_threshold_via_constructor() -> None:
    lenient_engine = PolicyEngine(min_confidence_for_auto_approval=0.10)
    decision = lenient_engine.evaluate(build_input(ai_confidence=0.55))

    assert decision.decision == PolicyDecisionType.APPROVE


# ---------------------------------------------------------------------------
# Precedence: when multiple rules' conditions are simultaneously true,
# the highest-priority one must win and be the ONLY one recorded.
# ---------------------------------------------------------------------------


def test_unsupported_action_takes_precedence_over_fraud(engine) -> None:
    decision = engine.evaluate(
        build_input(
            recommended_action="NOT_A_REAL_ACTION",
            failure_category=FailureCategory.FRAUD_SUSPECTED.value,
        )
    )

    assert decision.violated_rules == ["UNSUPPORTED_ACTION"]


def test_fraud_takes_precedence_over_max_retry_exceeded(engine) -> None:
    decision = engine.evaluate(
        build_input(
            failure_category=FailureCategory.FRAUD_SUSPECTED.value,
            retry_history=RetryHistory(retry_attempt_count=99),
            merchant_policy_overrides={"max_retry_count": 2},
        )
    )

    assert decision.violated_rules == ["FRAUD_SUSPECTED_BLOCK"]
    assert decision.final_action == RecoveryActionType.NO_ACTION


def test_auto_recovery_disabled_takes_precedence_over_high_value_and_low_confidence(engine) -> None:
    decision = engine.evaluate(
        build_input(
            payment_amount=Decimal("999999.00"),
            ai_confidence=0.01,
            merchant_policy_overrides={
                "auto_recovery_enabled": False,
                "high_risk_amount_threshold": Decimal("50000.00"),
            },
        )
    )

    assert decision.violated_rules == ["AUTO_RECOVERY_DISABLED"]


def test_repeated_failures_takes_precedence_over_max_retry_and_high_value(engine) -> None:
    decision = engine.evaluate(
        build_input(
            payment_amount=Decimal("999999.00"),
            retry_history=RetryHistory(retry_attempt_count=10, failed_attempt_count=5),
            merchant_policy_overrides={
                "max_retry_count": 2,
                "escalation_failure_threshold": 3,
                "high_risk_amount_threshold": Decimal("50000.00"),
            },
        )
    )

    assert decision.violated_rules == ["REPEATED_FAILURES_THRESHOLD"]


def test_max_retry_takes_precedence_over_high_value_and_low_confidence(engine) -> None:
    decision = engine.evaluate(
        build_input(
            payment_amount=Decimal("999999.00"),
            ai_confidence=0.01,
            retry_history=RetryHistory(retry_attempt_count=5),
            merchant_policy_overrides={
                "max_retry_count": 2,
                "high_risk_amount_threshold": Decimal("50000.00"),
            },
        )
    )

    assert decision.violated_rules == ["MAX_RETRY_COUNT_EXCEEDED"]


def test_high_value_takes_precedence_over_low_confidence(engine) -> None:
    decision = engine.evaluate(
        build_input(
            payment_amount=Decimal("999999.00"),
            ai_confidence=0.01,
            merchant_policy_overrides={"high_risk_amount_threshold": Decimal("50000.00")},
        )
    )

    assert decision.violated_rules == ["HIGH_VALUE_AUTO_RETRY_DISALLOWED"]


# ---------------------------------------------------------------------------
# The five worked examples requested in the Phase 4 brief. Each one is
# also reproduced with full JSON output in PHASE_4_NOTES.md.
# ---------------------------------------------------------------------------


def test_example_1_ai_recommendation_approved(engine) -> None:
    decision = engine.evaluate(
        build_input(
            recommended_action=RecoveryActionType.RETRY_PAYMENT.value,
            payment_amount=Decimal("1499.00"),
            ai_confidence=0.85,
        )
    )

    assert decision.decision == PolicyDecisionType.APPROVE
    assert decision.final_action == RecoveryActionType.RETRY_PAYMENT
    assert decision.violated_rules == []


def test_example_2_ai_recommendation_modified(engine) -> None:
    decision = engine.evaluate(
        build_input(
            recommended_action=RecoveryActionType.RETRY_PAYMENT.value,
            payment_amount=Decimal("75000.00"),
            merchant_policy_overrides={"high_risk_amount_threshold": Decimal("50000.00")},
        )
    )

    assert decision.decision == PolicyDecisionType.MODIFY
    assert decision.final_action == RecoveryActionType.SEND_PAYMENT_LINK
    assert decision.violated_rules == ["HIGH_VALUE_AUTO_RETRY_DISALLOWED"]


def test_example_3_ai_recommendation_rejected(engine) -> None:
    decision = engine.evaluate(
        build_input(
            recommended_action=RecoveryActionType.RETRY_PAYMENT.value,
            retry_history=RetryHistory(retry_attempt_count=3),
            merchant_policy_overrides={"max_retry_count": 2},
        )
    )

    assert decision.decision == PolicyDecisionType.REJECT
    assert decision.final_action == RecoveryActionType.ESCALATE_TO_MERCHANT
    assert decision.violated_rules == ["MAX_RETRY_COUNT_EXCEEDED"]


def test_example_4_ai_recommendation_escalated(engine) -> None:
    decision = engine.evaluate(
        build_input(
            recommended_action=RecoveryActionType.RETRY_PAYMENT.value,
            retry_history=RetryHistory(failed_attempt_count=3),
            merchant_policy_overrides={"escalation_failure_threshold": 3},
        )
    )

    assert decision.decision == PolicyDecisionType.ESCALATE
    assert decision.final_action == RecoveryActionType.ESCALATE_TO_MERCHANT
    assert decision.violated_rules == ["REPEATED_FAILURES_THRESHOLD"]


def test_example_5_high_risk_transaction_results_in_no_action(engine) -> None:
    decision = engine.evaluate(
        build_input(
            recommended_action=RecoveryActionType.RETRY_PAYMENT.value,
            failure_category=FailureCategory.FRAUD_SUSPECTED.value,
            payment_amount=Decimal("120000.00"),
        )
    )

    assert decision.decision == PolicyDecisionType.REJECT
    assert decision.final_action == RecoveryActionType.NO_ACTION
    assert decision.violated_rules == ["FRAUD_SUSPECTED_BLOCK"]
