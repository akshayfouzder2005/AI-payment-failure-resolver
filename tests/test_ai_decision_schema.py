"""
AIDecisionOutput validation tests — Phase 3.

This schema is the safety boundary: everything here is exactly what
AIDecisionService relies on to decide "trust this LLM output" vs.
"fall back to a deterministic decision". Each test below corresponds to
a way real model output could be malformed.
"""
import pytest
from pydantic import ValidationError

from app.schemas.ai_decision import AIDecisionOutput

VALID_PAYLOAD = {
    "failure_category": "INSUFFICIENT_FUNDS",
    "root_cause": "Customer's account likely had insufficient balance.",
    "recovery_probability": 0.55,
    "recommended_action": "RETRY_PAYMENT",
    "confidence": 0.85,
    "reason": "Transient failure, retry is likely to succeed.",
    "risk_factors": ["low_balance_pattern"],
}


def test_valid_payload_parses() -> None:
    output = AIDecisionOutput.model_validate(VALID_PAYLOAD)
    assert output.recommended_action.value == "RETRY_PAYMENT"
    assert output.recovery_probability == 0.55


def test_rejects_unsupported_action() -> None:
    payload = {**VALID_PAYLOAD, "recommended_action": "REFUND_EVERYTHING"}
    with pytest.raises(ValidationError):
        AIDecisionOutput.model_validate(payload)


def test_rejects_unsupported_failure_category() -> None:
    payload = {**VALID_PAYLOAD, "failure_category": "ALIEN_INTERFERENCE"}
    with pytest.raises(ValidationError):
        AIDecisionOutput.model_validate(payload)


@pytest.mark.parametrize("bad_probability", [-0.1, 1.1, 5.0])
def test_rejects_recovery_probability_out_of_range(bad_probability: float) -> None:
    payload = {**VALID_PAYLOAD, "recovery_probability": bad_probability}
    with pytest.raises(ValidationError):
        AIDecisionOutput.model_validate(payload)


@pytest.mark.parametrize("bad_confidence", [-0.5, 1.5])
def test_rejects_confidence_out_of_range(bad_confidence: float) -> None:
    payload = {**VALID_PAYLOAD, "confidence": bad_confidence}
    with pytest.raises(ValidationError):
        AIDecisionOutput.model_validate(payload)


def test_rejects_wrong_type_for_confidence() -> None:
    payload = {**VALID_PAYLOAD, "confidence": "very sure"}
    with pytest.raises(ValidationError):
        AIDecisionOutput.model_validate(payload)


@pytest.mark.parametrize("missing_field", ["recommended_action", "failure_category", "reason"])
def test_rejects_missing_required_field(missing_field: str) -> None:
    payload = {k: v for k, v in VALID_PAYLOAD.items() if k != missing_field}
    with pytest.raises(ValidationError):
        AIDecisionOutput.model_validate(payload)


def test_ignores_unexpected_extra_fields() -> None:
    payload = {**VALID_PAYLOAD, "some_field_the_model_invented": "oops"}
    output = AIDecisionOutput.model_validate(payload)
    assert not hasattr(output, "some_field_the_model_invented")


def test_rejects_empty_reason() -> None:
    payload = {**VALID_PAYLOAD, "reason": ""}
    with pytest.raises(ValidationError):
        AIDecisionOutput.model_validate(payload)
