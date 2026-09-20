"""
Recovery execution endpoints — Phase 5. Merchant-scoped since Phase 7
(auth).

`POST /recovery/execute/{payment_id}` lets a recovery be re-run on demand
(e.g. against a specific historical ai_decision_id, or after re-diagnosis)
— every "processed" webhook/simulate ingest already triggers diagnosis
and execution automatically via app/services/recovery_pipeline.py's
background task. This stays a first-class endpoint for manual/targeted
re-execution, same reasoning as ai_decisions.py's diagnose route.

Phase 7: both routes require a valid bearer token and are scoped to the
caller's own merchant the same way ai_decisions.py's routes are — see
that file's docstring for the exact split between "service raises
PaymentNotFoundError -> 404" (execute) and "route checks ownership
itself -> empty list" (list).
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_merchant_id, get_db
from app.exceptions import AIDecisionNotFoundError, PaymentNotFoundError
from app.repositories.payment_repository import PaymentRepository
from app.repositories.recovery_attempt_repository import RecoveryAttemptRepository
from app.schemas.recovery import RecoveryAttemptRead, RecoveryExecutionResult
from app.services.recovery_execution_service import RecoveryExecutionService

router = APIRouter(prefix="/recovery", tags=["recovery"])


@router.post("/execute/{payment_id}")
def execute_recovery(
    payment_id: uuid.UUID,
    ai_decision_id: uuid.UUID | None = Query(
        default=None,
        description="Defaults to the payment's most recent AI decision if omitted.",
    ),
    current_merchant_id: str = Depends(get_current_merchant_id),
    db: Session = Depends(get_db),
) -> JSONResponse:
    service = RecoveryExecutionService(db)
    try:
        result = service.execute_recovery(
            payment_id, ai_decision_id=ai_decision_id, merchant_id=current_merchant_id
        )
    except PaymentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except AIDecisionNotFoundError as exc:
        # 409, not 404: the payment is real, there's just nothing to act
        # on yet — the caller needs to run diagnosis first, not treat
        # this like a bad payment_id.
        raise HTTPException(status_code=409, detail=str(exc))

    return JSONResponse(status_code=200, content=result.model_dump(mode="json"))


@router.get("/payment/{payment_id}")
def list_recovery_attempts(
    payment_id: uuid.UUID,
    current_merchant_id: str = Depends(get_current_merchant_id),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Full recovery-attempt history for a payment, oldest first."""
    payment = PaymentRepository(db).get_by_id_for_merchant(payment_id, current_merchant_id)
    if payment is None:
        return JSONResponse(status_code=200, content=[])

    attempts = RecoveryAttemptRepository(db).list_for_payment(payment_id)
    return JSONResponse(
        status_code=200,
        content=[RecoveryAttemptRead.model_validate(a).model_dump(mode="json") for a in attempts],
    )

