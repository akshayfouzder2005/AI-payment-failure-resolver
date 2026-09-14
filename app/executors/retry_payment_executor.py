from app.enums import RecoveryActionType, RecoveryAttemptStatus
from app.exceptions import PaymentGatewayError
from app.executors.base import ExecutionContext, ExecutionOutcome, RecoveryActionExecutor
from app.integrations.payment_gateway_client.base import PaymentGatewayClient, RetryPaymentRequest
from app.integrations.payment_gateway_client.factory import get_payment_gateway_client


class RetryPaymentExecutor(RecoveryActionExecutor):
    """
    Dispatched when the policy engine's final_action is RETRY_PAYMENT.
    See app/integrations/payment_gateway_client/base.py's module
    docstring for what "retry" honestly means against a real gateway.
    """

    action_type = RecoveryActionType.RETRY_PAYMENT

    def __init__(self, gateway_client: PaymentGatewayClient | None = None):
        self.gateway_client = gateway_client or get_payment_gateway_client()

    def execute(self, context: ExecutionContext) -> ExecutionOutcome:
        request = RetryPaymentRequest(
            gateway_payment_id=context.gateway_payment_id,
            amount=context.payment_amount,
            currency=context.currency,
            customer_name=context.customer_name,
            customer_email=context.customer_email,
            customer_phone=context.customer_phone,
            reference=f"retry-{context.recovery_attempt_id}",
        )
        try:
            result = self.gateway_client.retry_payment(request)
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
