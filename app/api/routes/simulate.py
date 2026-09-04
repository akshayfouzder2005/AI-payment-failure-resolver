"""
Local simulation endpoint — Phase 2.

Lets the whole ingestion pipeline be exercised and demoed with zero
external dependencies: no Razorpay account, no webhook secret, no tunnel
into localhost. Runs through the exact same WebhookService.ingest() as the
real endpoint via MockAdapter, so this is a demo of the real pipeline, not
a separate mocked-up path.
"""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.integrations.payment_provider.mock_adapter import MockAdapter
from app.schemas.webhook import SimulateFailedPaymentRequest
from app.services.webhook_service import WebhookService

router = APIRouter(prefix="/simulate", tags=["simulate"])


@router.post("/failed-payment")
def simulate_failed_payment(
    overrides: SimulateFailedPaymentRequest | None = None,
    db: Session = Depends(get_db),
) -> JSONResponse:
    overrides = overrides or SimulateFailedPaymentRequest()
    adapter = MockAdapter()
    raw_body = adapter.build_failed_payment_event(overrides.model_dump(exclude_none=True))

    service = WebhookService(db)
    result = service.ingest(raw_body, headers={}, adapter=adapter)

    status_code = 202 if result.status == "processing_failed" else 200
    return JSONResponse(status_code=status_code, content=result.model_dump(mode="json"))
