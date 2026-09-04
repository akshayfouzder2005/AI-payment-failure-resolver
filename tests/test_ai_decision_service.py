"""
AIDecisionService tests — Phase 3.

Covers the full diagnose_payment() pipeline against a real Postgres
session: the happy path, all four documented fallback triggers (missing
context, provider error, malformed output, low confidence), persistence
correctness (AIDecision row + AuditLog row), and append-only behavior
across repeated calls.
"""
import uuid
from decimal import Decimal

import pytest

from app.enums import RecoveryActionType
from app.exceptions import PaymentNotFoundError
from app.integrations.llm_provider.base import LLMDecisionResult, LLMProvider, PaymentContext
from app.integrations.llm_provider.mock_provider import MockLLMProvider
from app.repositories.ai_decision_repository import AIDecisionRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.services.ai_decision_service import AIDecisionService


def test_diagnose_unknown_payment_raises(db_session) -> None:
    service = AIDecisionService(db_session, llm_provider=MockLLMProvider())
    with pytest.raises(PaymentNotFoundError):
        service.diagnose_payment(uuid.uuid4())


def test_happy_path_persists_decision_and_audit_log(db_session, make_payment) -> None:
    payment = make_payment(failure_message="Insufficient funds in the customer's account")
    service = AIDecisionService(db_session, llm_provider=MockLLMProvider())

    decision = service.diagnose_payment(payment.id)

    assert decision.id is not None
    assert decision.payment_id == payment.id
    assert decision.model_name == "mock-llm-v1"
    assert decision.recommended_action == RecoveryActionType.RETRY_PAYMENT.value
    assert decision.confidence > Decimal("0.4")
    assert decision.raw_response is not None

    stored = AIDecisionRepository(db_session).get_latest_for_payment(payment.id)
    assert stored is not None
    assert stored.id == decision.id

    audit_entries = AuditLogRepository(db_session).list_for_entity("AIDecision", decision.id)
    assert any(a.action == "ai_decision_created" and a.actor == "ai_engine" for a in audit_entries)


def test_fallback_when_no_failure_detail(db_session, make_payment) -> None:
    payment = make_payment(failure_code=None, failure_message=None)
    service = AIDecisionService(db_session, llm_provider=MockLLMProvider())

    decision = service.diagnose_payment(payment.id)

    assert decision.model_name == "fallback-deterministic"
    assert decision.recommended_action == RecoveryActionType.ESCALATE_TO_MERCHANT.value
    assert decision.confidence == Decimal("0.000")
    assert "Insufficient context" in decision.reason

    audit_entries = AuditLogRepository(db_session).list_for_entity("AIDecision", decision.id)
    assert any(a.action == "ai_decision_fallback_used" and a.actor == "system" for a in audit_entries)


def test_fallback_when_llm_provider_errors(db_session, make_payment) -> None:
    payment = make_payment()
    service = AIDecisionService(db_session, llm_provider=MockLLMProvider(force_mode="error"))

    decision = service.diagnose_payment(payment.id)

    assert decision.model_name == "fallback-deterministic"
    assert decision.recommended_action == RecoveryActionType.ESCALATE_TO_MERCHANT.value
    assert "LLM provider error" in decision.reason


def test_fallback_when_output_is_malformed(db_session, make_payment) -> None:
    payment = make_payment()
    service = AIDecisionService(db_session, llm_provider=MockLLMProvider(force_mode="malformed"))

    decision = service.diagnose_payment(payment.id)

    assert decision.model_name == "mock-llm-v1"  # provider identity preserved even on fallback
    assert decision.recommended_action == RecoveryActionType.ESCALATE_TO_MERCHANT.value
    assert "failed schema validation" in decision.reason
    assert decision.raw_response is not None  # the bad output is preserved for audit


def test_fallback_when_confidence_too_low(db_session, make_payment) -> None:
    payment = make_payment()
    service = AIDecisionService(db_session, llm_provider=MockLLMProvider(force_mode="low_confidence"))

    decision = service.diagnose_payment(payment.id)

    assert decision.recommended_action == RecoveryActionType.ESCALATE_TO_MERCHANT.value
    assert "confidence" in decision.reason.lower()
    assert "below the minimum" in decision.reason


def test_repeated_calls_append_rather_than_overwrite(db_session, make_payment) -> None:
    """
    Two diagnose_payment() calls create two AIDecision rows, not one
    updated row. Doesn't assert which one get_latest_for_payment() sorts
    first: within a single test transaction, Postgres's now() (used by
    created_at's server_default) reflects the outer transaction's start
    time, not wall-clock call order — see db_session fixture's docstring.
    A real request-per-transaction deployment doesn't have this ambiguity.
    """
    payment = make_payment()
    service = AIDecisionService(db_session, llm_provider=MockLLMProvider())

    first = service.diagnose_payment(payment.id)
    second = service.diagnose_payment(payment.id)

    assert first.id != second.id
    all_decisions = AIDecisionRepository(db_session).list_for_payment(payment.id)
    assert {d.id for d in all_decisions} == {first.id, second.id}
    assert AIDecisionRepository(db_session).get_latest_for_payment(payment.id).id in {first.id, second.id}


class _StaticLLMProvider(LLMProvider):
    """Minimal hand-rolled provider for asserting exact request/response shape end-to-end."""

    def __init__(self, raw_output: dict):
        self._raw_output = raw_output
        self.received_context: PaymentContext | None = None

    def generate_decision(self, context: PaymentContext) -> LLMDecisionResult:
        self.received_context = context
        return LLMDecisionResult(model_name="static-test-model", raw_output=self._raw_output)


def test_context_passed_to_provider_matches_payment(db_session, make_payment) -> None:
    payment = make_payment(amount=Decimal("777.00"))
    provider = _StaticLLMProvider(
        {
            "failure_category": "UNKNOWN",
            "root_cause": "n/a",
            "recovery_probability": 0.5,
            "recommended_action": "NO_ACTION",
            "confidence": 0.9,
            "reason": "n/a",
            "risk_factors": [],
        }
    )
    service = AIDecisionService(db_session, llm_provider=provider)

    service.diagnose_payment(payment.id)

    assert provider.received_context is not None
    assert provider.received_context.payment.payment_id == payment.id
    assert provider.received_context.payment.amount == Decimal("777.00")
