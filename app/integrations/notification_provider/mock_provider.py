"""
Zero-credential stand-in for a real notification channel (Phase 5).
Logs what would have been sent and returns success — enough to
demonstrate SEND_NOTIFICATION / ESCALATE_TO_MERCHANT end-to-end without
a real email/SMS vendor account. Mirrors MockPaymentGatewayClient.
"""
import logging
import uuid

from app.integrations.notification_provider.base import (
    NotificationProvider,
    NotificationRequest,
    NotificationResult,
)

logger = logging.getLogger(__name__)


class MockNotificationProvider(NotificationProvider):
    def __init__(self, always_fail: bool = False):
        self.always_fail = always_fail

    def send(self, request: NotificationRequest) -> NotificationResult:
        recipient = request.recipient_email or request.recipient_phone
        if not recipient:
            return NotificationResult(
                success=False,
                message=f"No {request.channel} address/number available for {request.recipient_type} recipient.",
            )

        if self.always_fail:
            return NotificationResult(
                success=False,
                message="Mock notification provider simulated a delivery failure (always_fail=True).",
            )

        reference = f"mock_notify_{uuid.uuid4().hex[:12]}"
        logger.info(
            "Mock %s notification to %s (%s): subject=%r reference=%s",
            request.channel,
            request.recipient_type,
            recipient,
            request.subject,
            reference,
        )
        return NotificationResult(
            success=True,
            provider_reference=reference,
            message=f"Mock {request.channel} notification sent to {request.recipient_type} ({recipient}).",
        )
