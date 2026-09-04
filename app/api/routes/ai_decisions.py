"""
AI decision endpoints — Phase 3.

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
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.exceptions import PaymentNotFoundError
from app.repositories.ai_decision_repository import AIDecisionRepository
from app.schemas.ai_decision import AIDecisionRead
from app.services.ai_decision_service import AIDecisionService

router = APIRouter(prefix="/ai-decisions", tags=["ai-decisions"])


@router.post("/diagnose/{payment_id}")
def diagnose_payment(payment_id: uuid.UUID, db: Session = Depends(get_db)) -> JSONResponse:
    service = AIDecisionService(db)
    try:
        decision = service.diagnose_payment(payment_id)
    except PaymentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return JSONResponse(
        status_code=200,
        content=AIDecisionRead.model_validate(decision).model_dump(mode="json"),
    )


@router.get("/payment/{payment_id}")
def list_decisions_for_payment(payment_id: uuid.UUID, db: Session = Depends(get_db)) -> JSONResponse:
    """Full AI decision history for a payment, oldest first (append-only log — see AIDecision docstring)."""
    decisions = AIDecisionRepository(db).list_for_payment(payment_id)
    return JSONResponse(
        status_code=200,
        content=[AIDecisionRead.model_validate(d).model_dump(mode="json") for d in decisions],
    )
