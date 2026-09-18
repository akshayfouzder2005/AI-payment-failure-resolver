from app.enums import RecoveryActionType, RecoveryAttemptStatus
from app.exceptions import PaymentGatewayError
from app.executors.base import ExecutionContext, ExecutionOutcome, RecoveryActionExecutor
from app.integrations.payment_gateway_client.base import PaymentGatewayClient, PaymentLinkRequest
from app.integrations.payment_gateway_client.factory import get_payment_gateway_client


class PaymentLinkExecutor(RecoveryActionExecutor):
    """Dispatched when the policy engine's final_action is SEND_PAYMENT_LINK."""

    action_type = RecoveryActionType.SEND_PAYMENT_LINK

    def __init__(self, gateway_client: PaymentGatewayClient | None = None):
        self.gateway_client = gateway_client or get_payment_gateway_client()

    def execute(self, context: ExecutionContext) -> ExecutionOutcome:
        request = PaymentLinkRequest(
            amount=context.payment_amount,
            currency=context.currency,
            description=f"Payment retry link for {context.gateway_payment_id}",
            customer_name=context.customer_name,
            customer_email=context.customer_email,
            customer_phone=context.customer_phone,
            # .hex, not str(uuid) — see retry_payment_executor.py's comment;
            # same Razorpay endpoint, same 40-char reference_id cap.
            reference=f"plink-{context.recovery_attempt_id.hex}",
        )
        try:
            result = self.gateway_client.create_payment_link(request)
        except PaymentGatewayError as exc:
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
