"""
Health-check routes. Kept deliberately dumb — this is infrastructure, not
business logic, so it stays in the route file with no service layer.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.config import get_settings

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
def liveness() -> dict:
    """
    Process is up. Does not touch the database.

    Also echoes which mode each integration is running in (mock vs. a real
    provider) and the deployment environment name. These are plain config
    values already on Settings — never secrets — surfaced here so the
    frontend has one honest, real signal for its environment/provider
    status UI instead of guessing or hardcoding "All systems operational".
    """
    settings = get_settings()
    return {
        "status": "ok",
        "environment": settings.env,
        "providers": {
            "ai": settings.ai_provider,
            "recovery_gateway": settings.recovery_gateway_provider,
            "notifications": settings.notification_provider,
        },
    }


@router.get("/db")
def readiness(db: Session = Depends(get_db)) -> dict:
    """Process is up AND can talk to the database."""
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "reachable"}
