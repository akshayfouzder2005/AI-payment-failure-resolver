import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models.payment_event import PaymentEvent
from app.repositories.base import BaseRepository


class PaymentEventRepository(BaseRepository[PaymentEvent]):
    model = PaymentEvent

    def get_by_provider_event_id(self, provider: str, event_id: str) -> PaymentEvent | None:
        stmt = select(PaymentEvent).where(
            PaymentEvent.provider == provider,
            PaymentEvent.event_id == event_id,
        )
        return self.db.scalars(stmt).first()

    def list_for_payment(self, payment_id: uuid.UUID) -> list[PaymentEvent]:
        """
        Phase 6: AuditService uses this to gather every PaymentEvent
        linked to a payment so a full cross-entity audit timeline can be
        assembled. Oldest first, matching every other list_for_payment's
        convention across the repository layer.
        """
        stmt = (
            select(PaymentEvent)
            .where(PaymentEvent.payment_id == payment_id)
            .order_by(PaymentEvent.created_at.asc())
        )
        return list(self.db.scalars(stmt).all())

    def add_idempotent(self, event: PaymentEvent) -> tuple[PaymentEvent, bool]:
        """
        Insert a new event unless one with the same (provider, event_id)
        already exists, in which case return the existing row instead.

        This is the idempotency mechanism the webhook service (Phase 2)
        will use: gateways redeliver webhooks on timeout, so the same
        event can arrive more than once and must not be double-processed.

        Uses a SAVEPOINT (`begin_nested`) around the insert so that on
        conflict, only this insert is rolled back — not the caller's
        entire outer transaction/session. Without this, a plain
        `db.add()` + `db.flush()` that hits the unique constraint leaves
        the whole session unusable until a full rollback, which would
        also discard any other unrelated work already done in the same
        request.

        Returns (event, created) — `created` is False when the event was
        already present (i.e. this was a duplicate delivery).
        """
        savepoint = self.db.begin_nested()
        try:
            self.db.add(event)
            self.db.flush()
            savepoint.commit()
            return event, True
        except IntegrityError:
            savepoint.rollback()
            existing = self.get_by_provider_event_id(event.provider, event.event_id)
            if existing is None:
                # Should not happen: the unique constraint fired for some
                # other reason. Re-raise so it isn't silently swallowed.
                raise
            return existing, False

