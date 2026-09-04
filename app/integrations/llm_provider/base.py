"""
LLM provider adapter interface — Phase 3.

Mirrors app/integrations/payment_provider/base.py's pattern deliberately:
`AIDecisionService` (and, later, the recovery executor for notification
providers) only ever talks to `LLMProvider`, never to a specific vendor's
SDK. Swapping models/vendors means writing one new provider class, not
touching the service layer.

`PaymentContext` is the contract every provider consumes — everything
ContextBuilder assembles from Payment/Customer/RecoveryAttempt/
MerchantSettings, with nothing else. This is the ONLY thing an LLMProvider
implementation is allowed to see; it never receives the ORM session or
raw model objects, which is what keeps "the LLM only recommends" true at
the type level, not just as a convention.

CRITICAL SAFETY NOTE: `generate_decision()` returns raw, UNVALIDATED JSON
(`LLMDecisionResult.raw_output`). Schema validation against
`app.schemas.ai_decision.AIDecisionOutput` happens one layer up, in
AIDecisionService — deliberately kept as a separate, visible pipeline step
(see the Phase 3 architecture diagram: "Structured AI Decision -> Schema
Validation -> Persist AIDecision") rather than folded into the provider,
so it's obvious in the code that nothing from the model is trusted before
validation, regardless of which provider produced it.
"""
from abc import ABC, abstractmethod
from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class PaymentSnapshot(BaseModel):
    payment_id: UUID
    gateway: str
    gateway_payment_id: str
    amount: Decimal
    currency: str
    status: str
    failure_code: str | None
    failure_message: str | None
    original_transaction_at: datetime | None


class CustomerSnapshot(BaseModel):
    customer_id: UUID | None
    name: str | None
    email: str | None
    phone: str | None
    is_known_customer: bool


class CustomerHistory(BaseModel):
    """Aggregate stats about this customer's other payments, if any."""

    total_payment_count: int
    total_failed_count: int
    total_recovered_count: int
    previous_failure_count_excluding_current: int


class PreviousRecoveryAttemptSnapshot(BaseModel):
    """
    One prior RecoveryAttempt on THIS payment. Always empty in Phase 3
    demos (the executor doesn't exist until Phase 5), but ContextBuilder
    queries for it now so the context shape — and the prompt built from
    it — doesn't change once attempts start existing.
    """

    action_type: str
    status: str
    policy_decision: str | None
    created_at: datetime


class MerchantPolicyContext(BaseModel):
    """
    The deterministic limits the policy engine (Phase 4) will enforce.
    Given to the LLM too, as context (not authority) — so its
    recommendation can be policy-aware without the policy engine ever
    trusting it to have applied the policy correctly itself.
    """

    merchant_id: str
    max_retry_count: int
    retry_delay_minutes: int
    high_risk_amount_threshold: Decimal
    escalation_failure_threshold: int
    auto_recovery_enabled: bool


class PaymentContext(BaseModel):
    """Everything an LLMProvider is given to produce a decision. Nothing else."""

    payment: PaymentSnapshot
    customer: CustomerSnapshot
    customer_history: CustomerHistory
    previous_recovery_attempts: list[PreviousRecoveryAttemptSnapshot]
    merchant_policy: MerchantPolicyContext

    def to_prompt_dict(self) -> dict[str, Any]:
        """
        JSON-safe dict for embedding in a prompt: `mode="json"` converts
        Decimal/UUID/datetime to plain strings rather than relying on a
        provider's own default JSON encoding rules (which vary and aren't
        part of this contract).
        """
        return self.model_dump(mode="json")


class LLMDecisionResult(BaseModel):
    """
    What an LLMProvider hands back: which model produced the output, and
    the output itself as a plain dict — parsed JSON, not yet validated
    against AIDecisionOutput.
    """

    model_name: str
    raw_output: dict[str, Any]


class LLMProvider(ABC):
    """One implementation per LLM vendor (+ one deterministic mock)."""

    @abstractmethod
    def generate_decision(self, context: PaymentContext) -> LLMDecisionResult:
        """
        Produce a diagnosis + recovery recommendation for the given
        payment context.

        Raises `app.exceptions.LLMProviderError` if no usable response
        could be obtained at all (network/auth/rate-limit failure,
        safety refusal, truncated response, unparseable JSON). Does NOT
        raise for JSON that parses but doesn't match AIDecisionOutput's
        schema — that's the caller's job to detect via validation.
        """
        ...
