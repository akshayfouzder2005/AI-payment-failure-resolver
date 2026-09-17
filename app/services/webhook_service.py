"""
Webhook ingestion orchestration — Phase 2.

`ingest()` is the single entry point both the real Razorpay route and the
local /simulate route call, so they exercise identical logic — the demo is
provably representative of what the real integration does, not a separate
mocked-up path.

Flow: validate signature -> parse -> idempotent PaymentEvent insert ->
(skip if a true duplicate) -> upsert Payment (only for handled event
types) -> audit every transition -> commit. Never raises for problems in
*processing* an already-captured event — those are recorded on the event
row and returned as a result, not thrown, because losing the event was
the only failure worth surfacing as an error (see docstring on the
`except` branch below).
"""
import logging
from datetime import datetime, timezone
from typing import Mapping
from uuid import UUID

from sqlalchemy.orm import Session

from app.enums import AuditAction
from app.exceptions import InvalidPayloadError, InvalidSignatureError
from app.integrations.payment_provider.base import PaymentProviderAdapter
from app.models.audit_log import AuditLog
from app.models.payment_event import PaymentEvent
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.payment_event_repository import PaymentEventRepository
from app.schemas.webhook import WebhookIngestResult
from app.services.payment_service import PaymentService

logger = logging.getLogger(__name__)

# Payment.status tracks recovery-lifecycle state (failed -> retry_scheduled
# -> recovered/escalated/abandoned), not raw gateway status — so Phase 2
# only acts on the event that starts that lifecycle. Other event types are
# still durably logged (PaymentEvent's whole purpose is "raw log of every
# inbound event"), just marked "ignored" rather than turned into a Payment.
_HANDLED_EVENT_TYPES = {"payment.failed"}


class WebhookService:
    def __init__(self, db: Session):
        self.db = db
        self.event_repo = PaymentEventRepository(db)
        self.audit_repo = AuditLogRepository(db)
        self.payment_service = PaymentService(db)

    def ingest(
        self, raw_body: bytes, headers: Mapping[str, str], adapter: PaymentProviderAdapter
    ) -> WebhookIngestResult:
        if not adapter.validate_signature(raw_body, headers):
            raise InvalidSignatureError("Webhook signature validation failed")

        normalized = adapter.parse_event(raw_body, headers)  # raises InvalidPayloadError

        stored_event, created = self.event_repo.add_idempotent(
            PaymentEvent(
                provider=normalized.provider,
                event_id=normalized.event_id,
                event_type=normalized.event_type,
                payload=normalized.raw_payload,
                processing_status="received",
            )
        )
        # Commit as its own step: the event is now durably stored ("we saw
        # this") independent of whatever happens in processing below.
        self.db.commit()

        if created:
            # Phase 6: distinct from "payment_failed_recorded" below — this
            # fires for every genuinely new delivery regardless of event
            # type or how processing goes, so "we received a webhook" is
            # reconstructable even for event types Phase 2 doesn't act on.
            # Deliberately NOT fired on the `not created` (duplicate)
            # branch, which already gets its own "webhook_duplicate_ignored"
            # entry — see below.
            self._audit(
                "PaymentEvent",
                stored_event.id,
                AuditAction.WEBHOOK_RECEIVED.value,
                f"Received {stored_event.provider}:{stored_event.event_id} ({normalized.event_type})",
            )
            self.db.commit()

        if not created:
            if stored_event.processing_status in ("processed", "ignored"):
                self._audit(
                    "PaymentEvent",
                    stored_event.id,
                    "webhook_duplicate_ignored",
                    f"Duplicate delivery of {stored_event.provider}:{stored_event.event_id} ignored",
                )
                self.db.commit()
                return WebhookIngestResult(
                    status="duplicate",
                    payment_event_id=stored_event.id,
                    payment_id=stored_event.payment_id,
                )
            # Stored previously but never finished processing (stuck in
            # "received", or a prior attempt hit "failed") — fall through
            # and retry rather than leaving it stuck forever.

        if normalized.event_type not in _HANDLED_EVENT_TYPES:
            stored_event.processing_status = "ignored"
            self.event_repo.add(stored_event)
            self._audit(
                "PaymentEvent",
                stored_event.id,
                "webhook_event_type_ignored",
                f"Event type '{normalized.event_type}' is not acted on in Phase 2",
            )
            self.db.commit()
            return WebhookIngestResult(
                status="ignored",
                payment_event_id=stored_event.id,
                detail=f"Event type '{normalized.event_type}' is not handled yet",
            )

        try:
            payment = self.payment_service.upsert_from_event(normalized)

            stored_event.payment_id = payment.id
            stored_event.processing_status = "processed"
            stored_event.processed_at = datetime.now(timezone.utc)
            self.event_repo.add(stored_event)

            self._audit(
                "Payment",
                payment.id,
                "payment_failed_recorded",
                f"Payment {payment.gateway_payment_id} recorded as failed "
                f"({payment.failure_code or 'no failure code'})",
                payment_event_id=str(stored_event.id),
            )
            self._audit(
                "Payment",
                payment.id,
                "recovery_pipeline_queued",
                "Flagged for AI-driven recovery analysis (implemented starting Phase 3)",
            )
            self.db.commit()

            return WebhookIngestResult(
                status="processed",
                payment_event_id=stored_event.id,
                payment_id=payment.id,
                payment_status=payment.status,
                payment_summary={
                    "gateway_payment_id": payment.gateway_payment_id,
                    "amount": str(payment.amount),
                    "currency": payment.currency,
                    "status": payment.status,
                    "failure_code": payment.failure_code,
                    "failure_message": payment.failure_message,
                },
            )
        except Exception as exc:
            # The event itself is already safely committed above, so the
            # only thing to undo is this failed processing attempt.
            # Razorpay retries any non-2xx delivery for 24h — since we
            # HAVE durably captured the event, the route still returns a
            # 2xx for this case (see app/api/routes/webhooks.py) rather
            # than triggering pointless retries of an event we'll just
            # keep failing to process the same way.
            self.db.rollback()
            stored_event.processing_status = "failed"
            stored_event.error_message = str(exc)
            self.event_repo.add(stored_event)
            self._audit(
                "PaymentEvent",
                stored_event.id,
                "webhook_processing_failed",
                f"Processing failed: {exc}",
            )
            self.db.commit()
            logger.exception(
                "webhook_processing_failed", extra={"payment_event_id": str(stored_event.id)}
            )
            return WebhookIngestResult(
                status="processing_failed",
                payment_event_id=stored_event.id,
                detail="Event was captured but processing failed; see server logs.",
            )

    def _audit(
        self, entity_type: str, entity_id: UUID, action: str, message: str, **extra: str
    ) -> None:
        self.audit_repo.add(
            AuditLog(
                entity_type=entity_type,
                entity_id=entity_id,
                action=action,
                actor="system",
                details={"message": message, **extra},
            )
        )
