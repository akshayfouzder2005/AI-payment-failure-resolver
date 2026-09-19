"""
Audit-trail endpoints — Phase 6. Merchant-scoped since Phase 7 (auth).

GET /audit/payment/{payment_id} is what backs a later frontend phase's
"Recovery / Audit Timeline" screen: every audit row touching this
payment across its full entity graph (webhook events, AI decisions,
recovery attempts), merged and sorted into one chronological list — see
AuditService.get_payment_timeline's docstring for why that isn't a
single-table query.

Phase 7: requires a valid bearer token; AuditService raises
PaymentNotFoundError for a payment_id that either doesn't exist or
belongs to a different merchant than current_merchant_id, which this
route already turned into a 404 before auth existed — no new branch
needed here.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_merchant_id, get_db
from app.exceptions import PaymentNotFoundError
from app.schemas.audit import AuditLogRead
from app.services.audit_service import AuditService

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/payment/{payment_id}")
def get_payment_audit_timeline(
    payment_id: uuid.UUID,
    current_merchant_id: str = Depends(get_current_merchant_id),
    db: Session = Depends(get_db),
) -> JSONResponse:
    service = AuditService(db)
    try:
        logs = service.get_payment_timeline(payment_id, merchant_id=current_merchant_id)
    except PaymentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return JSONResponse(
        status_code=200,
        content=[AuditLogRead.model_validate(log).model_dump(mode="json") for log in logs],
    )
