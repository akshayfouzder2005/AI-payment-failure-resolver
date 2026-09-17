"""
Metrics endpoints — Phase 6.

GET /metrics/summary is the single dashboard-ready endpoint: every rate
and total a later frontend phase's Overview Dashboard needs, computed
fresh from Payment/RecoveryAttempt rows on every call (no cache, no
materialized view) — correct-by-construction over premature optimization
for a hackathon MVP's data volume (architectural principles #14/#15).
Revisit if a real dashboard ever polls this often enough for that to
matter.
"""
from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.metrics import MetricsSummary
from app.services.metrics_service import MetricsService

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/summary")
def get_metrics_summary(
    merchant_id: str | None = Query(
        default=None, description="Omit to aggregate across every merchant."
    ),
    db: Session = Depends(get_db),
) -> JSONResponse:
    summary = MetricsService(db).get_summary(merchant_id=merchant_id)
    return JSONResponse(status_code=200, content=summary.model_dump(mode="json"))
