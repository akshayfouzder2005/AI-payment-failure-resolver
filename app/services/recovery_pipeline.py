"""
Auto-chains AI diagnosis -> policy evaluation -> recovery execution for a
newly-ingested failed payment, so the PRIMARY DEMO FLOW (webhook -> AI ->
policy -> action -> result -> dashboard) completes automatically instead
of requiring three separate manual API calls per payment. Added during
post-Phase-7 backend verification — this wiring was always the intended
end state (see the now-updated docstrings on ai_decisions.py/recovery.py
and WebhookService's "recovery_pipeline_queued" audit entry, which
predates this module) but was never actually built.

Runs as a FastAPI BackgroundTask (see app/api/routes/webhooks.py and
app/api/routes/simulate.py) — scheduled AFTER WebhookService.ingest() has
already committed the Payment/PaymentEvent rows and returned its 2xx, so
a slow or failing AI/policy/recovery step never delays or risks the
webhook acknowledgement Razorpay is waiting on. This is the load-bearing
requirement from Section 6 of the verification pass: the webhook endpoint
must not block on AI + policy + recovery.

Opens its own DB session via `session_factory` (defaults to the real
SessionLocal in production) rather than reusing the request's session —
see app.api.deps.get_background_session_factory's docstring for exactly
why, and how tests override it to stay within the same test transaction.

Safety: AIDecisionService and RecoveryExecutionService already contain
their own defensive fallback/error handling for every expected failure
mode (LLM unavailable, malformed output, low confidence, unsupported
action, executor failure — Sections 9-12). This function does NOT
reimplement any of that; it only guards against something entirely
unexpected escaping into FastAPI's BackgroundTasks machinery (which can't
usefully do anything with it) and makes sure that rare case still leaves
an audit trail, since otherwise a truly-broken pipeline run would
silently vanish from the timeline instead of showing up as
PROCESSING_STOPPED.

Idempotency: relies entirely on invariants that already exist rather than
adding new ones. AIDecision is deliberately append-only (a second
diagnosis is a new row, not an error), and RecoveryExecutionService.
execute_recovery is idempotent per ai_decision_id (a SUCCESS replay
short-circuits instead of re-executing). Both apply exactly the same way
whether triggered by this pipeline, a manual diagnose/execute call, or
both for the same payment — no separate "has the pipeline already run
for this payment" check is needed or added.
"""
import logging
from typing import Callable
from uuid import UUID

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.enums import AuditAction
from app.models.audit_log import AuditLog
from app.repositories.audit_log_repository import AuditLogRepository
from app.services.ai_decision_service import AIDecisionService
from app.services.recovery_execution_service import RecoveryExecutionService

logger = logging.getLogger(__name__)


def run_recovery_pipeline(
    payment_id: UUID,
    merchant_id: str,
    session_factory: Callable[[], Session] = SessionLocal,
) -> None:
    """
    Diagnose, then execute recovery for, one payment. Called with
    background_tasks.add_task(run_recovery_pipeline, ...) — never awaited,
    never allowed to raise back into the route that scheduled it.
    """
    db = session_factory()
    try:
        decision = AIDecisionService(db).diagnose_payment(payment_id, merchant_id=merchant_id)
        RecoveryExecutionService(db).execute_recovery(
            payment_id, ai_decision_id=decision.id, merchant_id=merchant_id
        )
    except Exception:
        logger.exception(
            "recovery_pipeline_failed",
            extra={"payment_id": str(payment_id), "merchant_id": merchant_id},
        )
        _audit_processing_stopped(db, payment_id)
    finally:
        db.close()


def _audit_processing_stopped(db: Session, payment_id: UUID) -> None:
    """
    Best-effort — if even this fails (e.g. the DB itself is unreachable,
    which is presumably why the pipeline failed in the first place), there
    is nothing further this function can safely do; the exception that
    triggered this is already logged by the caller.
    """
    try:
        db.rollback()
        AuditLogRepository(db).add(
            AuditLog(
                entity_type="Payment",
                entity_id=payment_id,
                action=AuditAction.PROCESSING_STOPPED.value,
                actor="system",
                details={
                    "message": (
                        "Automatic recovery pipeline stopped unexpectedly after "
                        "ingestion. Diagnose/execute can still be triggered "
                        "manually for this payment."
                    )
                },
            )
        )
        db.commit()
    except Exception:
        logger.exception(
            "recovery_pipeline_failure_audit_write_failed",
            extra={"payment_id": str(payment_id)},
        )

