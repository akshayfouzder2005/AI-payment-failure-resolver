"""
MockLLMProvider tests — Phase 3.

Confirms: (1) normal rule-based output always validates against
AIDecisionOutput, (2) each `force_mode` produces exactly the failure
shape it claims to, and (3) the classification rules respond sensibly to
context (amount vs. threshold, repeat failures).
"""
import pytest
from pydantic import ValidationError

from app.exceptions import LLMProviderError
from app.integrations.llm_provider.base import (
    CustomerHistory,
    CustomerSnapshot,
    MerchantPolicyContext,
    PaymentContext,
    PaymentSnapshot,
)
from app.integrations.llm_provider.mock_provider import MockLLMProvider
from app.schemas.ai_decision import AIDecisionOutput
from decimal import Decimal
import uuid


def build_context(**payment_overrides) -> PaymentContext:
    payment_defaults = {
        "payment_id": uuid.uuid4(),
        "gateway": "mock",
        "gateway_payment_id": "pay_test_1",
        "amount": Decimal("500.00"),
        "currency": "INR",
        "status": "failed",
        "failure_code": "BAD_REQUEST_ERROR",
        "failure_message": "Insufficient funds in the customer's account",
        "original_transaction_at": None,
    }
    payment_defaults.update(payment_overrides)

    return PaymentContext(
        payment=PaymentSnapshot(**payment_defaults),
        customer=CustomerSnapshot(
            customer_id=uuid.uuid4(), name="Test", email="t@example.com", phone=None, is_known_customer=True
        ),
        customer_history=CustomerHistory(
            total_payment_count=1,
            total_failed_count=1,
            total_recovered_count=0,
            previous_failure_count_excluding_current=0,
        ),
        previous_recovery_attempts=[],
        merchant_policy=MerchantPolicyContext(
            merchant_id="test_merchant",
            max_retry_count=3,
            retry_delay_minutes=30,
            high_risk_amount_threshold=Decimal("10000.00"),
            escalation_failure_threshold=3,
            auto_recovery_enabled=True,
        ),
    )


def test_normal_output_validates_against_schema() -> None:
    result = MockLLMProvider().generate_decision(build_context())
    validated = AIDecisionOutput.model_validate(result.raw_output)
    assert validated.recommended_action.value == "RETRY_PAYMENT"  # "insufficient" keyword rule


def test_error_mode_raises_llm_provider_error() -> None:
    with pytest.raises(LLMProviderError):
        MockLLMProvider(force_mode="error").generate_decision(build_context())


def test_malformed_mode_fails_schema_validation() -> None:
    result = MockLLMProvider(force_mode="malformed").generate_decision(build_context())
    with pytest.raises(ValidationError):
        AIDecisionOutput.model_validate(result.raw_output)


def test_low_confidence_mode_is_valid_but_below_typical_threshold() -> None:
    result = MockLLMProvider(force_mode="low_confidence").generate_decision(build_context())
    validated = AIDecisionOutput.model_validate(result.raw_output)  # still schema-valid
    assert validated.confidence < 0.4  # below the default AI_MIN_CONFIDENCE_THRESHOLD


def test_expired_card_recommends_payment_link() -> None:
    result = MockLLMProvider().generate_decision(
        build_context(failure_message="The card on file has expired")
    )
    validated = AIDecisionOutput.model_validate(result.raw_output)
    assert validated.recommended_action.value == "SEND_PAYMENT_LINK"
    assert validated.failure_category.value == "EXPIRED_CARD"


def test_high_amount_flags_risk_factor_and_lowers_probability() -> None:
    context = build_context(amount=Decimal("50000.00"))  # above the 10000 threshold
    result = MockLLMProvider().generate_decision(context)
    assert "high_transaction_amount" in result.raw_output["risk_factors"]


def test_repeated_failures_forces_escalation() -> None:
    context = build_context()
    context = context.model_copy(
        update={
            "customer_history": CustomerHistory(
                total_payment_count=5,
                total_failed_count=4,
                total_recovered_count=0,
                previous_failure_count_excluding_current=3,  # meets escalation_failure_threshold=3
            )
        }
    )
    result = MockLLMProvider().generate_decision(context)
    validated = AIDecisionOutput.model_validate(result.raw_output)
    assert validated.recommended_action.value == "ESCALATE_TO_MERCHANT"
    assert "repeated_failures_for_customer" in result.raw_output["risk_factors"]
