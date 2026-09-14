"""
Schemas for recovery-attempt persistence and the recovery-execution API
response — Phase 5. Mirrors app/schemas/ai_decision.py's Read-schema
pattern (from_attributes=True, direct model_validate off the ORM row).
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RecoveryAttemptRead(BaseModel):
    id: UUID
    payment_id: UUID
    ai_decision_id: UUID | None
    action_type: str
    attempt_number: int
    status: str
    policy_decision: str | None
    policy_reason: str | None
    started_at: datetime | None
    completed_at: datetime | None
    result_message: str | None
    external_reference: str | None
    error_message: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RecoveryExecutionResult(BaseModel):
    """What POST /recovery/execute/{payment_id} returns: the policy
    verdict plus the resulting RecoveryAttempt in one shape, so the
    caller never has to make a second request to see what happened."""

    payment_id: UUID
    ai_decision_id: UUID
    policy_decision: str
    policy_reason: str
    violated_rules: list[str] = Field(default_factory=list)
    recovery_attempt: RecoveryAttemptRead
    idempotent_replay: bool = Field(
        default=False,
        description="True if this call didn't execute anything new and returned a prior SUCCESS attempt as-is.",
    )

    model_config = ConfigDict(from_attributes=True)
