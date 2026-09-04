"""
Real Razorpay webhook endpoint — Phase 2.

Reads the body as raw bytes via `Request` (not a Pydantic model param) so
signature validation runs over the exact bytes Razorpay sent, before any
JSON parsing — see RazorpayAdapter and its docs citation for why this
matters.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.config import get_settings
from app.exceptions import InvalidPayloadError, InvalidSignatureError
from app.integrations.payment_provider.razorpay_adapter import RazorpayAdapter
from app.services.webhook_service import WebhookService

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/razorpay")
async def razorpay_webhook(request: Request, db: Session = Depends(get_db)) -> JSONResponse:
    raw_body = await request.body()
    adapter = RazorpayAdapter(webhook_secret=get_settings().razorpay_webhook_secret)
    service = WebhookService(db)

    try:
        result = service.ingest(raw_body, request.headers, adapter)
    except InvalidSignatureError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    except InvalidPayloadError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Razorpay retries any non-2xx delivery with backoff for 24h. The event
    # is durably stored by this point in every branch below, so we always
    # acknowledge with a 2xx — "processing_failed" gets 202 specifically to
    # signal "captured, not fully handled" without inviting a pointless
    # identical retry.
    status_code = 202 if result.status == "processing_failed" else 200
    return JSONResponse(status_code=status_code, content=result.model_dump(mode="json"))
