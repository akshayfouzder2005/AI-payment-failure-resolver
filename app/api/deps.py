"""
Shared FastAPI dependencies. Currently just re-exports the DB session
dependency; grows as routes are added in later phases (e.g. current
merchant resolution, auth if ever added).
"""
from app.database import get_db

__all__ = ["get_db"]
