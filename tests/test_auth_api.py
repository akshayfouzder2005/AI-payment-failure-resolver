"""
API tests for /auth/register, /auth/login, /auth/me — Phase 7.

Cross-merchant data isolation (auth's actual payoff — a token from one
merchant can't see another merchant's payments/audit/metrics) lives in
test_merchant_isolation.py, not here; this file is about the
authentication mechanism itself.
"""
import time
import uuid

import jwt as pyjwt

from app.config import get_settings
from app.security import create_access_token, hash_password, verify_password


def _register(client, **overrides) -> dict:
    payload = {
        "name": "Asha Rao",
        "email": f"asha_{uuid.uuid4().hex[:10]}@example.com",
        "password": "correct-horse-1",
        "merchant_name": "Asha's Store",
    }
    payload.update(overrides)
    return client.post("/auth/register", json=payload)


# --- register ---


def test_register_valid_returns_token_and_safe_user(client) -> None:
    response = _register(client)

    assert response.status_code == 201
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["email"]
    assert "password_hash" not in body["user"]
    assert "password" not in body["user"]


def test_register_creates_a_merchant_and_scopes_user_to_it(client, db_session) -> None:
    from app.repositories.merchant_repository import MerchantRepository
    from app.repositories.user_repository import UserRepository

    response = _register(client, email=f"merchant_owner_{uuid.uuid4().hex[:8]}@example.com")
    body = response.json()

    user = UserRepository(db_session).get_by_id(uuid.UUID(body["user"]["id"]))
    merchant = MerchantRepository(db_session).get_by_id(user.merchant_id)
    assert merchant is not None
    assert user.merchant_id == body["user"]["merchant_id"]


def test_register_duplicate_email_returns_409(client) -> None:
    email = f"dupe_{uuid.uuid4().hex[:10]}@example.com"
    first = _register(client, email=email)
    assert first.status_code == 201

    second = _register(client, email=email, merchant_name="A Different Store")
    assert second.status_code == 409


def test_register_duplicate_email_does_not_create_a_second_merchant(client, db_session) -> None:
    from sqlalchemy import select

    from app.models.merchant import Merchant
    from app.models.user import User

    email = f"dupe_no_orphan_{uuid.uuid4().hex[:10]}@example.com"
    _register(client, email=email, merchant_name="Original Store")
    second = _register(client, email=email, merchant_name="A Different Store")
    assert second.status_code == 409

    users = db_session.scalars(select(User).where(User.email == email.strip().lower())).all()
    assert len(users) == 1

    orphaned = db_session.scalars(select(Merchant).where(Merchant.name == "A Different Store")).all()
    assert orphaned == []


def test_register_rejects_short_password(client) -> None:
    response = _register(client, password="short")
    assert response.status_code == 422


def test_register_rejects_invalid_email(client) -> None:
    response = _register(client, email="not-an-email")
    assert response.status_code == 422


def test_register_rejects_blank_name(client) -> None:
    response = _register(client, name="   ")
    assert response.status_code == 422


def test_register_normalizes_email_case(client, db_session) -> None:
    from app.repositories.user_repository import UserRepository

    mixed_case = f"MixedCase_{uuid.uuid4().hex[:8]}@Example.COM"
    response = _register(client, email=mixed_case)
    assert response.status_code == 201

    stored = UserRepository(db_session).get_by_email(mixed_case.strip().lower())
    assert stored is not None


def test_register_password_is_hashed_not_stored_plaintext(client, db_session) -> None:
    from app.repositories.user_repository import UserRepository

    email = f"hash_check_{uuid.uuid4().hex[:8]}@example.com"
    password = "correct-horse-1"
    _register(client, email=email, password=password)

    user = UserRepository(db_session).get_by_email(email)
    assert user.password_hash != password
    assert verify_password(password, user.password_hash) is True
    assert verify_password("wrong-password", user.password_hash) is False


# --- login ---


def test_login_with_valid_credentials_returns_token(client) -> None:
    email = f"login_ok_{uuid.uuid4().hex[:8]}@example.com"
    password = "correct-horse-1"
    _register(client, email=email, password=password)

    response = client.post("/auth/login", json={"email": email, "password": password})

    assert response.status_code == 200
    assert response.json()["access_token"]


def test_login_wrong_password_returns_401(client) -> None:
    email = f"login_wrong_pw_{uuid.uuid4().hex[:8]}@example.com"
    _register(client, email=email, password="correct-horse-1")

    response = client.post("/auth/login", json={"email": email, "password": "not-the-password"})

    assert response.status_code == 401


def test_login_unknown_email_returns_401(client) -> None:
    response = client.post(
        "/auth/login", json={"email": "nobody-here@example.com", "password": "whatever123"}
    )
    assert response.status_code == 401


def test_login_inactive_user_returns_401(client, db_session, make_user) -> None:
    from app.security import hash_password as _hash

    password = "correct-horse-1"
    user = make_user(password_hash=_hash(password), is_active=False)
    db_session.commit()

    response = client.post("/auth/login", json={"email": user.email, "password": password})

    assert response.status_code == 401


def test_login_unknown_and_wrong_password_return_identical_error_body(client) -> None:
    """
    Deliberate: distinguishing "no such account" from "wrong password" in
    the response would let a caller enumerate valid emails.
    """
    email = f"enum_check_{uuid.uuid4().hex[:8]}@example.com"
    _register(client, email=email, password="correct-horse-1")

    unknown = client.post("/auth/login", json={"email": "nobody-here@example.com", "password": "x"})
    wrong_pw = client.post("/auth/login", json={"email": email, "password": "wrong-one"})

    assert unknown.status_code == wrong_pw.status_code == 401
    assert unknown.json()["detail"] == wrong_pw.json()["detail"]


# --- token / authorization ---


def test_me_missing_token_returns_401(client) -> None:
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_me_malformed_token_returns_401(client) -> None:
    response = client.get("/auth/me", headers={"Authorization": "Bearer not-a-real-jwt"})
    assert response.status_code == 401


def test_me_expired_token_returns_401(client, make_user) -> None:
    user = make_user()
    token = create_access_token(user_id=str(user.id), merchant_id=user.merchant_id, expires_minutes=-1)

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


def test_me_token_signed_with_wrong_secret_returns_401(client, make_user) -> None:
    user = make_user()
    settings = get_settings()
    bad_token = pyjwt.encode(
        {"sub": str(user.id), "merchant_id": user.merchant_id},
        "a-completely-different-secret",
        algorithm=settings.jwt_algorithm,
    )

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {bad_token}"})

    assert response.status_code == 401


def test_me_valid_token_returns_safe_profile(client, make_user) -> None:
    user = make_user(name="Priya Nair")
    token = create_access_token(user_id=str(user.id), merchant_id=user.merchant_id)

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    body = response.json()
    assert body["user_id"] == str(user.id)
    assert body["name"] == "Priya Nair"
    assert body["merchant_id"] == user.merchant_id
    assert "password_hash" not in body


def test_me_for_deactivated_user_returns_401(client, make_user, db_session) -> None:
    user = make_user()
    token = create_access_token(user_id=str(user.id), merchant_id=user.merchant_id)

    user.is_active = False
    db_session.commit()

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


def test_password_hashes_are_unique_per_call_even_for_same_password() -> None:
    """Argon2 salts each hash — two hashes of the same password must differ."""
    first = hash_password("same-password-1")
    second = hash_password("same-password-1")
    assert first != second
    assert verify_password("same-password-1", first)
    assert verify_password("same-password-1", second)
