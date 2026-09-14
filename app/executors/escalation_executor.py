from app.config import get_settings
from app.enums import RecoveryActionType, RecoveryAttemptStatus
from app.exceptions import NotificationError
from app.executors.base import ExecutionContext, ExecutionOutcome, RecoveryActionExecutor
from app.integrations.notification_provider.base import NotificationProvider, NotificationRequest
from app.integrations.notification_provider.factory import get_notification_provider


class EscalationExecutor(RecoveryActionExecutor):
    """
    Dispatched when the policy engine's final_action is
    ESCALATE_TO_MERCHANT. Notifies a single operational address
    (MERCHANT_ESCALATION_EMAIL) rather than a per-merchant contact column
    — see config.py's comment on why: the MVP is single-tenant and no
    other feature needs a per-merchant contact field yet.
    """

    action_type = RecoveryActionType.ESCALATE_TO_MERCHANT

    def __init__(
        self,
        notification_provider: NotificationProvider | None = None,
        merchant_contact_email: str | None = None,
    ):
        self.notification_provider = notification_provider or get_notification_provider()
        self.merchant_contact_email = merchant_contact_email or get_settings().merchant_escalation_email

    def execute(self, context: ExecutionContext) -> ExecutionOutcome:
        request = NotificationRequest(
            recipient_type="merchant",
            channel="email",
            recipient_email=self.merchant_contact_email,
            subject=f"[Action needed] Payment {context.gateway_payment_id} escalated",
            message=(
                f"Payment {context.gateway_payment_id} ({context.payment_amount} {context.currency}) "
                f"for merchant '{context.merchant_id}' was escalated by the policy engine.\n"
                f"Reason: {context.policy_reason}"
            ),
            reference=f"escalate-{context.recovery_attempt_id}",
        )
        try:
            result = self.notification_provider.send(request)
        except NotificationError as exc:
            return ExecutionOutcome(status=RecoveryAttemptStatus.FAILED, error=str(exc))

        if result.success:
            return ExecutionOutcome(
                status=RecoveryAttemptStatus.SUCCESS,
                result_message=result.message,
                provider_reference=result.provider_reference,
            )
        return ExecutionOutcome(
            status=RecoveryAttemptStatus.FAILED,
            result_message=result.message,
            error=result.message,
        )
