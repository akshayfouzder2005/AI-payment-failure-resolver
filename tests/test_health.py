from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root() -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "running"


def test_liveness() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["environment"] == "local"
    assert body["providers"] == {
        "ai": "mock",
        "recovery_gateway": "mock",
        "notifications": "mock",
    }


def test_liveness_reflects_configured_provider_modes(monkeypatch) -> None:
    """
    The providers block must actually reflect Settings, not be hardcoded —
    prove it by overriding the cached settings and checking the response
    changes with it.
    """
    from app.api.routes import health as health_module
    from app.config import Settings

    overridden = Settings(
        database_url="postgresql+psycopg2://x:x@localhost/x",
        jwt_secret_key="test-secret",
        env="production",
        ai_provider="groq",
        recovery_gateway_provider="razorpay",
        notification_provider="live",
    )
    monkeypatch.setattr(health_module, "get_settings", lambda: overridden)

    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["environment"] == "production"
    assert body["providers"] == {
        "ai": "groq",
        "recovery_gateway": "razorpay",
        "notifications": "live",
    }


def test_readiness_reaches_real_database() -> None:
    """
    Deliberately does NOT mock the DB — this endpoint's entire purpose is
    to prove real connectivity, so it should use the real (dev) database
    configured via DATABASE_URL, exactly as the running app would.
    """
    response = client.get("/health/db")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "reachable"}
