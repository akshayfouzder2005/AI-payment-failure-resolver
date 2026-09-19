"""
Recovery execution endpoints — Phase 5. Merchant-scoped since Phase 7
(auth).

`POST /recovery/execute/{payment_id}` is what lets Phase 5 be demoed
end-to-end without a frontend: run /simulate/failed-payment (Phase 2),
POST /ai-decisions/diagnose/{payment_id} (Phase 3), then POST here to
see the policy engine's verdict and the resulting RecoveryAttempt in one
response.

Not auto-triggered from AI diagnosis yet, for the same reason diagnosis
isn't auto-triggered from webhook ingestion (see ai_decisions.py's
docstring): each phase's endpoint stays independently callable so it can
be demoed and tested in isolation before a later phase wires the whole
pipeline together end-to-end automatically.

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
