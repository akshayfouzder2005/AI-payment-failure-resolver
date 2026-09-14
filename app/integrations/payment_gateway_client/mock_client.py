"""
Zero-credential stand-in for a real payment gateway (Phase 5). Default
provider (see RECOVERY_GATEWAY_PROVIDER in config.py) so the full
recovery-execution flow is demoable without a Razorpay account, mirroring
MockLLMProvider (Phase 3) and MockAdapter (Phase 2).
"""
import uuid

from app.integrations.payment_gateway_client.base import (
    GatewayActionResult,
    PaymentGatewayClient,
    PaymentLinkRequest,
    RetryPaymentRequest,
)


class MockPaymentGatewayClient(PaymentGatewayClient):
    """
    Succeeds deterministically by default. `always_fail` exists purely so
    tests (and a demo walking through the "graceful failure" path) can
    force the failure branch without depending on real gateway behavior —
    see test_executors.py.
    """

    def __init__(self, always_fail: bool = False):
        self.always_fail = always_fail

    def retry_payment(self, request: RetryPaymentRequest) -> GatewayActionResult:
        if self.always_fail:
            return GatewayActionResult(
                success=False,
                message="Mock gateway simulated a retry failure (always_fail=True).",
            )
        reference = f"mock_retry_{uuid.uuid4().hex[:12]}"
        return GatewayActionResult(
            success=True,
            provider_reference=reference,
            message=(
                f"Mock gateway simulated a successful retry of "
                f"{request.gateway_payment_id} for {request.amount} {request.currency}."
            ),
        )

    def create_payment_link(self, request: PaymentLinkRequest) -> GatewayActionResult:
        if self.always_fail:
            return GatewayActionResult(
                success=False,
                message="Mock gateway simulated a payment-link creation failure (always_fail=True).",
            )
        reference = f"mock_plink_{uuid.uuid4().hex[:12]}"
        return GatewayActionResult(
            success=True,
            provider_reference=reference,
            message=(
                f"Mock gateway created a simulated payment link for "
                f"{request.amount} {request.currency}: https://mock.razorpay.link/{reference}"
            ),
        )
