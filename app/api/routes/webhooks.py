"""
Real Razorpay webhook endpoint — Phase 2.

Reads the body as raw bytes via `Request` (not a Pydantic model param) so
signature validation runs over the exact bytes Razorpay sent, before any
JSON parsing — see RazorpayAdapter and its docs citation for why this
matters.

Post-Phase-7 backend verification: on a successful "processed" ingest,
schedules the AI-diagnosis -> policy -> recovery-execution pipeline as a
BackgroundTask (see app/services/recovery_pipeline.py) so it runs AFTER
this response has already been sent — the webhook acknowledgement to
Razorpay never waits on an LLM call or a recovery action. Not scheduled
for "duplicate" (would create a second, unwanted AIDecision/recovery
attempt for an event already fully processed), "ignored" (no Payment to
diagnose), or "processing_failed" (ingestion itself didn't produce a
usable Payment row).
"""
from typing import Callable

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_background_session_factory, get_db
from app.config import get_settings
from app.exceptions import InvalidPayloadError, InvalidSignatureError
from app.integrations.payment_provider.razorpay_adapter import RazorpayAdapter
from app.services.recovery_pipeline import run_recovery_pipeline
from app.services.webhook_service import WebhookService

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/razorpay")
async def razorpay_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    session_factory: Callable[[], Session] = Depends(get_background_session_factory),
) -> JSONResponse:
    raw_body = await request.body()
    adapter = RazorpayAdapter(webhook_secret=get_settings().razorpay_webhook_secret)
    service = WebhookService(db)

    try:
        result = service.ingest(raw_body, request.headers, adapter)
    except InvalidSignatureError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    except InvalidPayloadError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if result.status == "processed" and result.payment_id is not None:
        background_tasks.add_task(
            run_recovery_pipeline, result.payment_id, result.merchant_id, session_factory
        )

    # Razorpay retries any non-2xx delivery with backoff for 24h. The event
    # is durably stored by this point in every branch below, so we always
    # acknowledge with a 2xx — "processing_failed" gets 202 specifically to
    # signal "captured, not fully handled" without inviting a pointless
    # identical retry.
    status_code = 202 if result.status == "processing_failed" else 200
    return JSONResponse(status_code=status_code, content=result.model_dump(mode="json"))

