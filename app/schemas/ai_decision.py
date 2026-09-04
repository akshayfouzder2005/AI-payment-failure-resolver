"""
Schemas for the AI decision layer — Phase 3.

`AIDecisionOutput` is the validation boundary the architecture's safety
rule hangs off of: raw LLM output (any provider) is a plain, untrusted
`dict` until it passes through `AIDecisionOutput.model_validate(...)`. If
it doesn't validate — wrong types, an action outside the five supported
enum values, a probability outside [0, 1] — AIDecisionService treats that
exactly like an LLM failure and falls back to a deterministic decision.
Nothing downstream (the policy engine in Phase 4, the executor in Phase 5)
ever sees unvalidated model output.

Note on why probability/confidence bounds still matter even though Claude
Structured Outputs guarantees schema-shape compliance: the API's grammar
constrains *type and enum* correctly, but numeric `minimum`/`maximum`
constraints are NOT grammar-enforced (Anthropic's docs: these are
"unsupported constraints" that get stripped from the compiled schema and
turned into a description hint instead). So `Field(ge=0.0, le=1.0)` here
is doing real enforcement work, not just documenting intent.
"""
import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.enums import FailureCategory, RecoveryActionType


class AIDecisionOutput(BaseModel):
    """The exact shape the LLM (or the mock provider) must produce."""

    failure_category: FailureCategory
    root_cause: str = Field(min_length=1, description="1-2 sentence explanation of the likely cause")
    recovery_probability: float = Field(ge=0.0, le=1.0)
    recommended_action: RecoveryActionType
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str = Field(min_length=1, description="Why this action was recommended")
    risk_factors: list[str] = Field(description="Short tags, e.g. 'high_transaction_amount'")

    model_config = ConfigDict(extra="ignore")  # tolerate incidental extra keys, don't reject the whole payload for them


class AIDecisionRead(BaseModel):
    """API-facing representation of a persisted AIDecision row."""

    id: uuid.UUID
    payment_id: uuid.UUID
    model_name: str
    failure_category: str | None
    root_cause: str | None
    recovery_probability: Decimal | None
    recommended_action: str | None
    confidence: Decimal | None
    reason: str | None
    risk_factors: list[str] | None
    raw_response: dict | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
