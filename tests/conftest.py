"""
Test fixtures.

Design decision: tests run against a REAL PostgreSQL database (from
TEST_DATABASE_URL), not SQLite-in-memory. The schema already uses
Postgres-specific types (native UUID) and the whole point of Phase 1 is to
prove the actual production database setup works — a SQLite substitute
would test a different (and weaker) set of guarantees.

Safety guard: refuses to run if TEST_DATABASE_URL doesn't look like a
throwaway database (must contain "test"), so a misconfigured .env can't
accidentally wipe a dev/prod database.

Isolation: each test runs inside a transaction that is rolled back at the
end, so tests never see each other's data and never need manual cleanup.
This is the standard SQLAlchemy "join an external transaction" pattern.
"""
import hashlib
import hmac
import json
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.config import get_settings
from app.database import Base
from app.main import app

# Import models so Base.metadata is fully populated before create_all.
# (`from app import models`, not `import app.models` — the latter rebinds
# the name `app` to the top-level package, clobbering the FastAPI `app`
# instance imported above.)
from app import models  # noqa: F401


@pytest.fixture(scope="session")
def test_db_url() -> str:
    settings = get_settings()
    url = settings.test_database_url
    if not url:
        pytest.fail(
            "TEST_DATABASE_URL is not set. Copy backend/.env.example to "
            "backend/.env and point TEST_DATABASE_URL at a throwaway database."
        )
    if "test" not in url:
        pytest.fail(
            "TEST_DATABASE_URL does not look like a test database (must "
            "contain 'test' in its name) — refusing to run tests against it "
            "as a safety guard."
        )
    return url


@pytest.fixture(scope="session")
def engine(test_db_url):
    engine = create_engine(test_db_url, future=True)
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def db_session(engine) -> Session:
    """
    Yields a Session bound to a connection wrapped in an outer transaction.

    `join_transaction_mode="create_savepoint"` means that when the code
    under test (or the test itself) calls `session.rollback()` or
    `session.commit()`, SQLAlchemy operates on a SAVEPOINT rather than the
    outer transaction — so the outer transaction remains valid and gets
    cleanly rolled back here regardless of what the test did internally.
    Without this, a test that calls rollback() (e.g. simulating real
    error-handling code) would deassociate the outer transaction early.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db_session):
    """
    TestClient wired to the SAME db_session used by the test, via
    dependency override, so anything the request handler does (webhook
    ingestion, audit logging, ...) rolls back with the rest of the test's
    changes at teardown instead of leaking into other tests.
    """

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def sign():
    """Returns a helper that HMAC-signs a raw body the way Razorpay does."""

    def _sign(raw_body: bytes, secret: str | None = None) -> str:
        secret = secret if secret is not None else get_settings().razorpay_webhook_secret
        return hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    return _sign


@pytest.fixture
def razorpay_failed_payment_payload():
    """
    Returns a factory building a realistic Razorpay payment.failed webhook
    body (shape verified against razorpay.com/docs/webhooks/). Amount is in
    paise (50000 = ₹500.00), matching the real gateway's convention.
    """

    def _make(
        gateway_payment_id: str = "pay_TESTFAILED0001",
        order_id: str = "order_TEST0001",
        error_code: str = "BAD_REQUEST_ERROR",
        amount_paise: int = 50000,
        created_at: int = 1735689600,
        email: str = "test.customer@example.com",
    ) -> bytes:
        body = {
            "entity": "event",
            "account_id": "acc_test",
            "event": "payment.failed",
            "contains": ["payment"],
            "payload": {
                "payment": {
                    "entity": {
                        "id": gateway_payment_id,
                        "entity": "payment",
                        "amount": amount_paise,
                        "currency": "INR",
                        "status": "failed",
                        "order_id": order_id,
                        "method": "card",
                        "email": email,
                        "contact": "+919800000000",
                        "error_code": error_code,
                        "error_description": "Payment failed due to insufficient funds",
                        "error_source": "bank",
                        "created_at": created_at,
                    }
                }
            },
            "created_at": created_at,
        }
        return json.dumps(body).encode("utf-8")

    return _make


@pytest.fixture
def event_id_header():
    """
    Returns a helper that builds the x-razorpay-event-id header. A separate
    fixture (rather than baking a fixed id into the payload fixture) so
    idempotency tests can reuse one id across two calls while other tests
    get a fresh unique one each time.
    """

    def _make(explicit_id: str | None = None) -> dict:
        return {"x-razorpay-event-id": explicit_id or f"evt_{uuid.uuid4().hex}"}

    return _make
