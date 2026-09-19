"""
Password hashing and JWT issuance/validation — Phase 7 (auth).

Kept flat (not nested under a sub-package) to match config.py /
database.py / exceptions.py / enums.py — cross-cutting concerns live as
top-level modules in this codebase, not under a generic "core" package.

Argon2 (via `argon2-cffi`, not passlib) for password hashing — the
current OWASP-recommended default and the Password Hashing Competition
winner. `argon2.PasswordHasher()` already picks sane default parameters
(time_cost, memory_cost, parallelism); there's nothing to tune for a
hackathon MVP, and nothing hand-rolled — no custom KDF/salt logic lives
here, only calls into a maintained library.

PyJWT for token issuance/validation — a small, actively maintained,
dependency-light library that does exactly the HS256 encode/decode this
needs. `decode_access_token` raises this module's own `TokenError` for
every failure mode (bad signature, expired, malformed) rather than
letting `jwt.PyJWTError` subclasses leak into callers — the auth
dependency (app/api/deps.py) only needs to know "valid or not", not
which of PyJWT's several exception types fired.
"""
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.config import get_settings

_hasher = PasswordHasher()


class TokenError(Exception):
    """A bearer token is missing, malformed, expired, or fails signature verification."""


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:
        # Malformed/unrecognized hash (e.g. legacy format from a future
        # algorithm change) — treat as "doesn't match" rather than
        # propagating an argon2-specific exception into callers that
        # only care about true/false.
        return False


def create_access_token(user_id: str, merchant_id: str, expires_minutes: int | None = None) -> str:
    settings = get_settings()
    minutes = (
        expires_minutes if expires_minutes is not None else settings.jwt_access_token_expire_minutes
    )
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": user_id,
        "merchant_id": merchant_id,
        "iat": now,
        "exp": now + timedelta(minutes=minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc
