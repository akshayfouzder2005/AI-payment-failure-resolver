"""
Metrics endpoints — Phase 6. Merchant-scoped since Phase 7 (auth).

GET /metrics/summary is the single dashboard-ready endpoint: every rate
and total a later frontend phase's Overview Dashboard needs, computed
fresh from Payment/RecoveryAttempt rows on every call (no cache, no
materialized view) — correct-by-construction over premature optimization
for a hackathon MVP's data volume (architectural principles #14/#15).
Revisit if a real dashboard ever polls this often enough for that to
matter.

Phase 7 (auth) BEHAVIOR CHANGE: `merchant_id` was previously an optional
client-supplied query parameter (omit it to aggregate across every
merchant). That is exactly the kind of client-supplied ownership value
the auth requirements rule out — a caller must never be able to ask for
another merchant's numbers, and "all merchants" is itself cross-tenant
data no single authenticated caller should see in a multi-tenant system.
merchant_id is now always derived from the bearer token; the query
param is gone.
"""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_merchant_id, get_db
from app.schemas.metrics import MetricsSummary
from app.services.metrics_service import MetricsService

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/summary")
def get_metrics_summary(
    current_merchant_id: str = Depends(get_current_merchant_id),
    db: Session = Depends(get_db),
) -> JSONResponse:
    summary = MetricsService(db).get_summary(merchant_id=current_merchant_id)
    return JSONResponse(status_code=200, content=summary.model_dump(mode="json"))
