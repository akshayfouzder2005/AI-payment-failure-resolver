"""
Payment list/detail endpoints. Added post-Phase-7 during backend
verification: every other payment_id-keyed route (ai-decisions,
recovery, audit) assumes the caller already has a payment_id in hand.
These two routes are what let a frontend get one in the first place —
GET /payments backs the Payments screen's table, GET /payments/{id}
backs the Payment Details screen's header/context section (amount,
failure reason, customer). The AI diagnosis, policy decision, recovery
result, and audit timeline underneath it are separate calls to the
routes that already exist (ai-decisions, recovery, audit).

Merchant-scoped the same way every other Phase 7 route is: ownership
comes from current_merchant_id (the bearer token), never a client-
supplied value. A cross-merchant payment_id returns 404
(PaymentRepository.get_by_id_for_merchant already makes "doesn't exist"
and "exists but isn't yours" indistinguishable). A cross-merchant list
request isn't something to guard against separately — merchant_id is
baked into list_for_merchant's WHERE clause, not filtered client-side.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_merchant_id, get_db
from app.repositories.payment_repository import PaymentRepository
from app.schemas.payment import PaymentRead

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("")
def list_payments(
    status: str | None = Query(default=None, description="Filter by payment status, e.g. 'failed'."),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_merchant_id: str = Depends(get_current_merchant_id),
    db: Session = Depends(get_db),
) -> JSONResponse:
    payments = PaymentRepository(db).list_for_merchant(
        current_merchant_id, status=status, limit=limit, offset=offset
    )
    return JSONResponse(
        status_code=200,
        content=[PaymentRead.model_validate(p).model_dump(mode="json") for p in payments],
    )


@router.get("/{payment_id}")
def get_payment(
    payment_id: uuid.UUID,
    current_merchant_id: str = Depends(get_current_merchant_id),
    db: Session = Depends(get_db),
) -> JSONResponse:
    payment = PaymentRepository(db).get_by_id_for_merchant(payment_id, current_merchant_id)
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment not found")

    return JSONResponse(
        status_code=200, content=PaymentRead.model_validate(payment).model_dump(mode="json")
    )

