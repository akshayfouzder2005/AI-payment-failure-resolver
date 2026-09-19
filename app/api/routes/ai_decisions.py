"""
AI decision endpoints — Phase 3. Merchant-scoped since Phase 7 (auth).

`POST /ai-decisions/diagnose/{payment_id}` is what lets Phase 3 be
demoed end-to-end without a frontend: run /simulate/failed-payment
(Phase 2) to get a payment_id, then POST it here to see the exact
structured JSON the AI decision layer produced and persisted.

Not auto-triggered from webhook ingestion yet — WebhookService just logs
"Flagged for AI-driven recovery analysis" (see its Phase 2 audit entry).
Wiring ingestion straight into diagnosis is a Phase 4/5 concern once the
policy engine exists to gate what happens with the result; calling it
synchronously from Phase 3 today would mean returning outdated 2xx
webhook acks to Razorpay while blocked on an LLM call.

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
