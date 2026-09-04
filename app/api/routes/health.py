"""
Health-check routes. Kept deliberately dumb — this is infrastructure, not
business logic, so it stays in the route file with no service layer.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_db

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
def liveness() -> dict:
    """Process is up. Does not touch the database."""
    return {"status": "ok"}


@router.get("/db")
def readiness(db: Session = Depends(get_db)) -> dict:
    """Process is up AND can talk to the database."""
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "reachable"}
