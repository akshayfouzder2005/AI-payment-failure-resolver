"""
AI decision endpoints — Phase 3. Merchant-scoped since Phase 7 (auth).

`POST /ai-decisions/diagnose/{payment_id}` lets a payment be re-diagnosed
on demand — every "processed" webhook/simulate ingest already triggers
this automatically via app/services/recovery_pipeline.py's background
task, so most of the time a caller never needs to call this directly.
It stays a first-class endpoint for re-running diagnosis (e.g. after
merchant settings changed, or to demo Phase 3 in isolation) without
re-ingesting a new event.

Phase 7: both routes require a valid bearer token and are scoped to the
caller's own merchant (current_merchant_id, derived from the token —
never from anything the client supplies). `diagnose_payment` and
`get_payment_timeline`-style lookups use AIDecisionService/ContextBuilder's
merchant_id check and surface a cross-merchant payment_id as an ordinary
404. The list route has no such exception to translate — it checks
ownership itself via PaymentRepository.get_by_id_for_merchant and simply
returns an empty list for a payment_id that isn't this merchant's,
identical to how it already behaved for a payment with no decisions yet.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_merchant_id, get_db
from app.exceptions import PaymentNotFoundError
from app.repositories.ai_decision_repository import AIDecisionRepository
from app.repositories.payment_repository import PaymentRepository
from app.schemas.ai_decision import AIDecisionRead
from app.services.ai_decision_service import AIDecisionService

router = APIRouter(prefix="/ai-decisions", tags=["ai-decisions"])


@router.post("/diagnose/{payment_id}")
def diagnose_payment(
    payment_id: uuid.UUID,
    current_merchant_id: str = Depends(get_current_merchant_id),
    db: Session = Depends(get_db),
) -> JSONResponse:
    service = AIDecisionService(db)
    try:
        decision = service.diagnose_payment(payment_id, merchant_id=current_merchant_id)
    except PaymentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return JSONResponse(
        status_code=200,
        content=AIDecisionRead.model_validate(decision).model_dump(mode="json"),
    )


@router.get("/payment/{payment_id}")
def list_decisions_for_payment(
    payment_id: uuid.UUID,
    current_merchant_id: str = Depends(get_current_merchant_id),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Full AI decision history for a payment, oldest first (append-only log — see AIDecision docstring)."""
    payment = PaymentRepository(db).get_by_id_for_merchant(payment_id, current_merchant_id)
    if payment is None:
        return JSONResponse(status_code=200, content=[])

    decisions = AIDecisionRepository(db).list_for_payment(payment_id)
    return JSONResponse(
        status_code=200,
        content=[AIDecisionRead.model_validate(d).model_dump(mode="json") for d in decisions],
    )

