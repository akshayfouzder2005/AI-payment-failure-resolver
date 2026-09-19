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

Provider isolation (Phase 6 hardening): the payment gateway / notification
/ AI providers are forced to "mock" here, in process environment, before
anything under app/ is ever imported. Without this, whatever backend/.env
has configured locally (e.g. RECOVERY_GATEWAY_PROVIDER=razorpay for manual
live testing via scripts/verify_razorpay_live.py) leaks straight into the
test suite: RecoveryExecutionService tests that don't inject a fake
executor_factory would then make REAL calls to Razorpay's API with
synthetic fixture data (fake emails/phones), which the real API can
legitimately reject — producing exactly the "status=failed instead of
success" failures this looks like from the outside. Per this project's
own convention, live-provider verification belongs in a standalone script
outside pytest (see scripts/verify_razorpay_live.py's docstring), never in
the automated suite, so this override is not optional/overridable per-test.
Must happen before the first `from app...` import below: app.database
constructs (and lru_cache's) Settings the moment it is first imported, so
setting these after that point would already be too late.
"""
import os

os.environ["RECOVERY_GATEWAY_PROVIDER"] = "mock"
os.environ["NOTIFICATION_PROVIDER"] = "mock"
os.environ["AI_PROVIDER"] = "mock"

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
def make_merchant(db_session):
    """
    Returns a factory that get-or-creates a MerchantSettings row.
    Phase 3 tests need one to exist before a Payment can reference it
    (Payment.merchant_id is a real FK) — mirrors what
    PaymentService.ensure_default_merchant() does at ingestion time,
    but explicit here so tests can control policy values (e.g. a low
    high_risk_amount_threshold) directly.

    Phase 7 (auth): MerchantSettings.merchant_id is now itself FK'd to
    merchants.merchant_id, so this also get-or-creates the Merchant row
    first — same lazy-provisioning pairing as the updated
    ensure_default_merchant(). Still returns the MerchantSettings object
    (unchanged return type/contract) so every existing caller of this
    fixture keeps working untouched.
    """
    from app.models.merchant import Merchant
    from app.models.merchant_settings import MerchantSettings
    from app.repositories.merchant_repository import MerchantRepository
    from app.repositories.merchant_settings_repository import MerchantSettingsRepository

    def _make(merchant_id: str = "test_merchant", **overrides) -> MerchantSettings:
        merchant_repo = MerchantRepository(db_session)
        if merchant_repo.get_by_id(merchant_id) is None:
            merchant_repo.add(Merchant(merchant_id=merchant_id, name=merchant_id))

        repo = MerchantSettingsRepository(db_session)
        existing = repo.get_by_merchant_id(merchant_id)
        if existing:
            return existing
        return repo.add(MerchantSettings(merchant_id=merchant_id, **overrides))

    return _make


@pytest.fixture
def make_user(db_session, make_merchant):
    """
    Returns a factory that creates a User row for a given (or freshly
    created) merchant — Phase 7 (auth). Always routes the merchant
    through make_merchant() first (get-or-create), so passing an
    already-existing merchant_id is safe and passing a brand-new one
    works without a separate setup call.
    """
    import uuid as _uuid

    from app.models.user import User
    from app.repositories.user_repository import UserRepository
    from app.security import hash_password

    def _make(**overrides) -> User:
        merchant_id = overrides.pop("merchant_id", None)
        merchant_id = make_merchant(merchant_id=merchant_id).merchant_id if merchant_id else make_merchant().merchant_id

        defaults = {
            "merchant_id": merchant_id,
            "name": "Test User",
            "email": f"user_{_uuid.uuid4().hex[:10]}@example.com",
            "password_hash": hash_password("Testpass123!"),
            "is_active": True,
        }
        defaults.update(overrides)
        return UserRepository(db_session).add(User(**defaults))

    return _make


@pytest.fixture
def auth_headers(make_user):
    """
    Returns a factory that produces {"Authorization": "Bearer <token>"}
    for a given (or freshly created) user — Phase 7 (auth). Issues the
    token directly via app.security.create_access_token rather than
    hitting POST /auth/login, the same "mirror production, but explicit
    here" pattern as make_merchant above — tests that specifically
    exercise the login endpoint's own behavior live in test_auth_api.py.
    """
    from app.security import create_access_token

    def _make(user=None, merchant_id: str | None = None):
        if user is None:
            kwargs = {"merchant_id": merchant_id} if merchant_id else {}
            user = make_user(**kwargs)
        token = create_access_token(user_id=str(user.id), merchant_id=user.merchant_id)
        return {"Authorization": f"Bearer {token}"}

    return _make


@pytest.fixture
def make_customer(db_session):
    """Returns a factory that creates a Customer row."""
    from app.models.customer import Customer
    from app.repositories.customer_repository import CustomerRepository

    def _make(**overrides) -> Customer:
        defaults = {"name": "Test Customer", "email": "test.customer@example.com"}
        defaults.update(overrides)
        return CustomerRepository(db_session).add(Customer(**defaults))

    return _make


@pytest.fixture
def make_payment(db_session, make_merchant):
    """
    Returns a factory that creates a Payment row, auto-provisioning its
    merchant if not given one. Defaults to a "failed" payment with a
    realistic failure_code/failure_message, since that's the state
    Phase 3's diagnosis pipeline is built around.
    """
    import uuid
    from decimal import Decimal

    from app.models.payment import Payment
    from app.repositories.payment_repository import PaymentRepository

    def _make(**overrides) -> Payment:
        merchant_id = overrides.pop("merchant_id", None)
        if merchant_id is None:
            merchant_id = make_merchant().merchant_id

        defaults = {
            "merchant_id": merchant_id,
            "gateway": "mock",
            "gateway_payment_id": f"pay_test_{uuid.uuid4().hex[:12]}",
            "amount": Decimal("999.00"),
            "currency": "INR",
            "status": "failed",
            "failure_code": "BAD_REQUEST_ERROR",
            "failure_message": "Insufficient funds in the customer's account",
        }
        defaults.update(overrides)
        return PaymentRepository(db_session).add(Payment(**defaults))

    return _make


@pytest.fixture
def make_ai_decision(db_session):
    """
    Returns a factory that creates an AIDecision row directly (bypassing
    AIDecisionService/the LLM entirely), for Phase 5 tests that need a
    decision to exist without exercising Phase 3's diagnosis pipeline.
    Defaults to a RETRY_PAYMENT recommendation with confidence high
    enough to clear AI_MIN_CONFIDENCE_THRESHOLD.
    """
    from app.models.ai_decision import AIDecision
    from app.repositories.ai_decision_repository import AIDecisionRepository

    def _make(payment_id, **overrides) -> AIDecision:
        defaults = {
            "payment_id": payment_id,
            "model_name": "test-fixture",
            "failure_category": "INSUFFICIENT_FUNDS",
            "root_cause": "Card had insufficient funds at the time of the charge.",
            "recovery_probability": 0.7,
            "recommended_action": "RETRY_PAYMENT",
            "confidence": 0.9,
            "reason": "Insufficient funds failures often succeed on a later retry.",
            "risk_factors": [],
        }
        defaults.update(overrides)
        return AIDecisionRepository(db_session).add(AIDecision(**defaults))

    return _make


@pytest.fixture
def make_recovery_attempt(db_session):
    """
    Returns a factory that creates a RecoveryAttempt row directly
    (bypassing RecoveryExecutionService/executors entirely), for Phase 6
    metrics/audit tests that need attempts with specific status/
    action_type/timing combinations without exercising the full
    execution pipeline. Defaults to a successful RETRY_PAYMENT attempt.
    """
    from app.models.recovery_attempt import RecoveryAttempt
    from app.repositories.recovery_attempt_repository import RecoveryAttemptRepository

    def _make(payment_id, **overrides) -> RecoveryAttempt:
        defaults = {
            "payment_id": payment_id,
            "action_type": "RETRY_PAYMENT",
            "attempt_number": 1,
            "status": "success",
            "policy_decision": "APPROVE",
            "policy_reason": "Test fixture default.",
        }
        defaults.update(overrides)
        return RecoveryAttemptRepository(db_session).add(RecoveryAttempt(**defaults))

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
