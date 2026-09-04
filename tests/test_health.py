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
    assert response.json() == {"status": "ok"}


def test_readiness_reaches_real_database() -> None:
    """
    Deliberately does NOT mock the DB — this endpoint's entire purpose is
    to prove real connectivity, so it should use the real (dev) database
    configured via DATABASE_URL, exactly as the running app would.
    """
    response = client.get("/health/db")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "reachable"}
