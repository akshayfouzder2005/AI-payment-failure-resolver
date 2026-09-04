"""
Database wiring: engine, session factory, and the declarative Base that all
ORM models inherit from.

Design decision: synchronous SQLAlchemy (not asyncio). For a hackathon MVP
with modest webhook volume, async adds complexity (async drivers, async
session lifecycle, async repositories) without a demonstrated need. This can
be revisited if load testing ever shows it matters.
"""
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,  # avoids stale-connection errors after DB restarts/idle
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""
    pass


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields a request-scoped DB session and
    guarantees it is closed afterward, even on error.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
