"""
Executor registry — Phase 5. One place mapping a policy engine's
`final_action` to the executor that handles it, so
RecoveryExecutionService never branches on RecoveryActionType itself.
Mirrors the provider factories in app/integrations/*/factory.py.
"""
from app.enums import RecoveryActionType
from app.executors.base import RecoveryActionExecutor
from app.executors.escalation_executor import EscalationExecutor
from app.executors.no_action_executor import NoActionExecutor
from app.executors.notification_executor import NotificationExecutor
from app.executors.payment_link_executor import PaymentLinkExecutor
from app.executors.retry_payment_executor import RetryPaymentExecutor

_REGISTRY: dict[RecoveryActionType, type[RecoveryActionExecutor]] = {
    RecoveryActionType.RETRY_PAYMENT: RetryPaymentExecutor,
    RecoveryActionType.SEND_PAYMENT_LINK: PaymentLinkExecutor,
    RecoveryActionType.SEND_NOTIFICATION: NotificationExecutor,
    RecoveryActionType.ESCALATE_TO_MERCHANT: EscalationExecutor,
    RecoveryActionType.NO_ACTION: NoActionExecutor,
}


def get_executor(action_type: RecoveryActionType) -> RecoveryActionExecutor:
    executor_cls = _REGISTRY.get(action_type)
    if executor_cls is None:
        # Unreachable for a valid RecoveryActionType — every member is
        # registered above — but fail loudly rather than silently
        # no-op'ing an action the registry doesn't know about, in case
        # the enum ever grows without this registry being updated too.
        raise ValueError(f"No executor registered for action type {action_type!r}")
    return executor_cls()
