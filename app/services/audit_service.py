"""
Cross-entity audit timeline reconstruction — Phase 6.

AuditLog is stored polymorphically (entity_type + entity_id, see its
model docstring), which is exactly right for writing — one table, no
join table per entity. Reading "everything that happened to payment X"
back out means gathering rows across four different entity_types
(Payment itself, plus every PaymentEvent / AIDecision / RecoveryAttempt
that references it), which is what this service exists to do: a thin
orchestration over five repositories, no SQL of its own (see
AuditLogRepository.list_for_entities, which does the actual query).
"""
from uuid import UUID

from sqlalchemy.orm import Session

from app.exceptions import PaymentNotFoundError
from app.models.audit_log import AuditLog
from app.repositories.ai_decision_repository import AIDecisionRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.payment_event_repository import PaymentEventRepository
from app.repositories.payment_repository import PaymentRepository
from app.repositories.recovery_attempt_repository import RecoveryAttemptRepository


class AuditService:
    def __init__(self, db: Session):
        self.db = db
        self.payment_repo = PaymentRepository(db)
        self.event_repo = PaymentEventRepository(db)
        self.ai_decision_repo = AIDecisionRepository(db)
        self.recovery_attempt_repo = RecoveryAttemptRepository(db)
        self.audit_repo = AuditLogRepository(db)

    def get_payment_timeline(self, payment_id: UUID) -> list[AuditLog]:
        """
        Every audit row touching this payment's full entity graph, one
        chronological list — the "reconstruct what happened" endpoint's
        backing query. Raises PaymentNotFoundError for a bad payment_id
        rather than silently returning an empty timeline, matching how
        AIDecisionService/RecoveryExecutionService treat the same case.
        """
        payment = self.payment_repo.get_by_id(payment_id)
        if payment is None:
            raise PaymentNotFoundError(f"No payment found with id {payment_id}")

        entity_ids_by_type = {
            "Payment": [payment_id],
            "PaymentEvent": [e.id for e in self.event_repo.list_for_payment(payment_id)],
            "AIDecision": [d.id for d in self.ai_decision_repo.list_for_payment(payment_id)],
            "RecoveryAttempt": [a.id for a in self.recovery_attempt_repo.list_for_payment(payment_id)],
        }
        return self.audit_repo.list_for_entities(entity_ids_by_type)
