"""
Local simulation endpoint — Phase 2.

Lets the whole ingestion pipeline be exercised and demoed with zero
external dependencies: no Razorpay account, no webhook secret, no tunnel
into localhost. Runs through the exact same WebhookService.ingest() as the
real endpoint via MockAdapter, so this is a demo of the real pipeline, not
a separate mocked-up path.

Stays unauthenticated by design (see this route's Phase 7 docstring
notes elsewhere in the codebase) — but accepts an optional merchant_id
override in the request body so a demo/frontend that already knows its
own merchant_id (from GET /auth/me) can attribute simulated payments to
itself instead of always the single default merchant. Omit it to keep
the original zero-config behavior. The real Razorpay webhook route has
no equivalent — an inbound webhook payload carries no internal
merchant_id to read one from.

Post-Phase-7 backend verification: same background-task pipeline chaining
as the real webhook route (see that route's docstring for the exact
gating condition) — a call here is a full demo of the PRIMARY DEMO FLOW
end to end, not just the ingestion step.
"""
from typing import Callable

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_background_session_factory, get_db
from app.integrations.payment_provider.mock_adapter import MockAdapter
from app.schemas.webhook import SimulateFailedPaymentRequest
from app.services.recovery_pipeline import run_recovery_pipeline
from app.services.webhook_service import WebhookService

router = APIRouter(prefix="/simulate", tags=["simulate"])


@router.post("/failed-payment")
def simulate_failed_payment(
    background_tasks: BackgroundTasks,
    overrides: SimulateFailedPaymentRequest | None = None,
    db: Session = Depends(get_db),
    session_factory: Callable[[], Session] = Depends(get_background_session_factory),
) -> JSONResponse:
    overrides = overrides or SimulateFailedPaymentRequest()
    payload_fields = overrides.model_dump(exclude_none=True)
    merchant_id = payload_fields.pop("merchant_id", None)  # routing info, not part of the synthetic event payload

    adapter = MockAdapter()
    raw_body = adapter.build_failed_payment_event(payload_fields)

    service = WebhookService(db)
    result = service.ingest(raw_body, headers={}, adapter=adapter, merchant_id=merchant_id)

    if result.status == "processed" and result.payment_id is not None:
        background_tasks.add_task(
            run_recovery_pipeline, result.payment_id, result.merchant_id, session_factory
        )

    status_code = 202 if result.status == "processing_failed" else 200
    return JSONResponse(status_code=status_code, content=result.model_dump(mode="json"))

