"""
Schemas for the deterministic policy engine — Phase 4.

`PolicyEvaluationInput` is everything `PolicyEngine.evaluate()` is allowed
to see, the same role `PaymentContext` plays for `LLMProvider` (see
app/integrations/llm_provider/base.py's docstring). The engine takes no
database session and does no I/O of its own — whatever calls it (a test,
or a future orchestrating service) is responsible for assembling this
object from Payment / AIDecision / RecoveryAttempt / MerchantSettings
rows.

Note on why `recommended_action` and `failure_category` are typed as
plain `str` here instead of `RecoveryActionType` / `FailureCategory`.
By the time a real `AIDecision` row exists, both values already passed
through `AIDecisionOutput` validation in Phase 3 — so in practice they're
always valid. Typing them as the enums here would make Pydantic reject an
invalid value before the policy engine ever ran, which would make
"unsupported action" a dead rule no test could actually exercise. The
policy engine is supposed to be the authoritative, final safety check
(architectural rule #13), not a layer that trusts an earlier validation
step to have caught everything — so it independently parses and validates
these itself as part of its own rule set (see `_UNSUPPORTED_ACTION` in
policy_engine.py). This is deliberate defense-in-depth, not an oversight.
"""
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.enums import RecoveryActionType


class PolicyDecisionType(str, Enum):
    """The four outcomes a policy evaluation can produce. Nothing else."""

    APPROVE = "APPROVE"
    MODIFY = "MODIFY"
    REJECT = "REJECT"
    ESCALATE = "ESCALATE"


class MerchantPolicyLimits(BaseModel):
    """
    The deterministic per-merchant limits the policy engine enforces.
    Field-for-field the same values as `MerchantSettings` (see that
    model's docstring for what each one means) and as
    `llm_provider.base.MerchantPolicyContext`, but defined fresh here on
    purpose: the policy engine shouldn't import from the LLM integration
    package just because the shape happens to match today. If the LLM
    prompt's context ever needs to grow or change independently, this
    stays untouched.
    """

    merchant_id: str
    max_retry_count: int
    retry_delay_minutes: int
    high_risk_amount_threshold: Decimal
    escalation_failure_threshold: int
    auto_recovery_enabled: bool


class RetryHistory(BaseModel):
    """
    Deterministic counts/timestamps derived from this payment's
    `RecoveryAttempt` rows. The engine does no querying itself (it's pure
    — no I/O), so whoever calls `evaluate()` computes these first. Every
    field defaults to "nothing has happened yet" so a payment with no
    recovery history at all (the common case pre-Phase-5, since nothing
    writes RecoveryAttempt rows yet) can be evaluated with
    `RetryHistory()`.
    """

    retry_attempt_count: int = Field(
        default=0, ge=0, description="Prior RETRY_PAYMENT attempts on this payment, any status"
    )
    failed_attempt_count: int = Field(
        default=0, ge=0, description="Prior recovery attempts on this payment with status='failed'"
    )
    last_retry_attempted_at: datetime | None = Field(
        default=None, description="When the most recent RETRY_PAYMENT attempt was made, if any"
    )


class PolicyEvaluationInput(BaseModel):
    """Everything PolicyEngine.evaluate() is given. Nothing else."""

    payment_id: UUID
    payment_amount: Decimal
    currency: str = "INR"

    failure_category: str
    recommended_action: str
    ai_confidence: float = Field(ge=0.0, le=1.0)
    ai_recovery_probability: float = Field(ge=0.0, le=1.0)

    retry_history: RetryHistory = Field(default_factory=RetryHistory)
    merchant_policy: MerchantPolicyLimits

    evaluated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PolicyDecision(BaseModel):
    """
    The policy engine's authoritative verdict on an AI recommendation.

    `ai_recommended_action` is kept as the raw string the AI said (not
    forced into the enum) so a genuinely unsupported value is preserved
    for the audit trail exactly as received, rather than silently
    coerced. `final_action` is always a valid `RecoveryActionType` — it's
    entirely engine-determined and the one thing Phase 5's executor is
    allowed to act on.
    """

    decision: PolicyDecisionType
    final_action: RecoveryActionType
    reason: str
    violated_rules: list[str] = Field(default_factory=list)

    ai_recommended_action: str
    ai_confidence: float

    approval_metadata: dict[str, Any] = Field(default_factory=dict)
    evaluated_at: datetime

    model_config = ConfigDict(frozen=True)
