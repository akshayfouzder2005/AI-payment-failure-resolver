"""
The executor interface every RecoveryActionExecutor implements.

`ExecutionContext` is everything an executor is allowed to see — the same
"pass in a self-contained schema, not a db session" pattern as
PaymentContext (LLM provider) and PolicyEvaluationInput (policy engine).
Executors do no querying of their own; RecoveryExecutionService builds
this from Payment/Customer/RecoveryAttempt rows first.

`ExecutionOutcome` is everything an executor is allowed to report back.
Executors must not raise for an ordinary provider-level failure (a
declined retry, an undeliverable notification) — that's
`ExecutionOutcome(status=FAILED, error=...)`. Raising is reserved for
genuine bugs, which RecoveryExecutionService catches defensively anyway
(see its docstring) but which an executor should never rely on.
"""
from abc import ABC, abstractmethod
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.enums import RecoveryActionType, RecoveryAttemptStatus


class ExecutionContext(BaseModel):
    recovery_attempt_id: UUID
    payment_id: UUID
    ai_decision_id: UUID
    action_type: RecoveryActionType
    attempt_number: int

    payment_amount: Decimal
    currency: str
    gateway: str
    gateway_payment_id: str

    customer_name: str | None = None
    customer_email: str | None = None
    customer_phone: str | None = None

    merchant_id: str
    # Why the policy engine approved/modified/escalated to this action —
    # threaded through so a notification/escalation executor can include
    # it in the message it sends, without re-fetching the PolicyDecision.
    policy_reason: str

    model_config = ConfigDict(frozen=True)


class ExecutionOutcome(BaseModel):
    status: RecoveryAttemptStatus
    result_message: str | None = None
    provider_reference: str | None = None
    error: str | None = None

    model_config = ConfigDict(frozen=True)


class RecoveryActionExecutor(ABC):
    action_type: RecoveryActionType

    @abstractmethod
    def execute(self, context: ExecutionContext) -> ExecutionOutcome: ...
