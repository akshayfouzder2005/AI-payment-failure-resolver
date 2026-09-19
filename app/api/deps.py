"""
Shared FastAPI dependencies: the DB session (Phase 1) and JWT
authentication (Phase 7).

get_current_user / get_current_merchant_id are the reusable
"Authorization: Bearer <token> -> JWT validation -> current User ->
current Merchant" chain every protected route depends on, so token
parsing happens in exactly one place rather than being duplicated per
route. Both raise HTTPException directly rather than a DomainError a
route would translate — these are infrastructure (same category as
get_db), not business logic, and FastAPI's own idiom for an auth
dependency is exactly this: raise the 401 at the point the token is
rejected.
"""
import uuid

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.security import TokenError, decode_access_token

_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = decode_access_token(credentials.credentials)
    except TokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    raw_user_id = payload.get("sub")
    if raw_user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    try:
        user_id = uuid.UUID(raw_user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = UserRepository(db).get_by_id(user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return user


def get_current_merchant_id(current_user: User = Depends(get_current_user)) -> str:
    """
    The authorization boundary every merchant-scoped route depends on
    instead of get_current_user directly — derived from the validated
    token's user, NEVER from anything a client supplies in a query param
    or request body (a client-supplied merchant_id must never be trusted
    to determine ownership).
    """
    return current_user.merchant_id


__all__ = ["get_db", "get_current_user", "get_current_merchant_id"]
