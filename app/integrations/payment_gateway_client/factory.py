"""
Payment gateway client factory — Phase 5. Mirrors
app/integrations/llm_provider/factory.py: one place that turns
RECOVERY_GATEWAY_PROVIDER into a concrete PaymentGatewayClient, so
executors (and tests) never construct one directly.
"""
from app.config import get_settings
from app.integrations.payment_gateway_client.base import PaymentGatewayClient
from app.integrations.payment_gateway_client.mock_client import MockPaymentGatewayClient
from app.integrations.payment_gateway_client.razorpay_client import RazorpayGatewayClient


def get_payment_gateway_client() -> PaymentGatewayClient:
    settings = get_settings()
    if settings.recovery_gateway_provider == "razorpay":
        return RazorpayGatewayClient(
            key_id=settings.razorpay_key_id,
            key_secret=settings.razorpay_key_secret,
            timeout_seconds=settings.razorpay_api_timeout_seconds,
        )
    return MockPaymentGatewayClient()
