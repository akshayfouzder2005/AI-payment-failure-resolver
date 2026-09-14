from app.enums import RecoveryActionType, RecoveryAttemptStatus
from app.exceptions import NotificationError
from app.executors.base import ExecutionContext, ExecutionOutcome, RecoveryActionExecutor
from app.integrations.notification_provider.base import NotificationProvider, NotificationRequest
from app.integrations.notification_provider.factory import get_notification_provider


class NotificationExecutor(RecoveryActionExecutor):
    """
    Dispatched when the policy engine's final_action is SEND_NOTIFICATION
    — a customer-facing nudge, as opposed to EscalationExecutor which
    notifies the merchant.
    """

    action_type = RecoveryActionType.SEND_NOTIFICATION

    def __init__(self, notification_provider: NotificationProvider | None = None):
        self.notification_provider = notification_provider or get_notification_provider()

    def execute(self, context: ExecutionContext) -> ExecutionOutcome:
        if not context.customer_email and not context.customer_phone:
            return ExecutionOutcome(
                status=RecoveryAttemptStatus.FAILED,
                error="No customer email or phone on file to notify.",
            )

        channel = "email" if context.customer_email else "sms"
        request = NotificationRequest(
            recipient_type="customer",
            channel=channel,
            recipient_email=context.customer_email,
            recipient_phone=context.customer_phone,
            subject="We noticed an issue with your recent payment",
            message=(
                f"Hi, your payment of {context.payment_amount} {context.currency} "
                f"({context.gateway_payment_id}) needs attention. {context.policy_reason}"
            ),
            reference=f"notify-{context.recovery_attempt_id}",
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
