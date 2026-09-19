"""
Authentication endpoints — Phase 7.

POST /auth/register creates a new Merchant + User pair and returns a
token immediately (register-then-authenticated, rather than a separate
required login call — one less round trip for the same demo). POST
/auth/login authenticates an existing user. GET /auth/me returns the
authenticated user's own safe profile fields, proving the
"Authorization: Bearer <token> -> current user/merchant" chain works
end-to-end for whatever calls it next (a future frontend, curl, tests).

No `/api` prefix, matching every other router in this app (webhooks,
metrics, audit, ...) — this codebase has never namespaced routes under
/api, so /auth/* stays consistent with that rather than introducing a
one-off exception.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.exceptions import EmailAlreadyRegisteredError, InvalidCredentialsError
from app.models.user import User
from app.repositories.merchant_repository import MerchantRepository
from app.schemas.auth import LoginRequest, MeResponse, RegisterRequest, TokenResponse, UserRead
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> JSONResponse:
    service = AuthService(db)
    try:
        user, _merchant, token = service.register(
            name=payload.name,
            email=payload.email,
            password=payload.password,
            merchant_name=payload.merchant_name,
        )
    except EmailAlreadyRegisteredError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    body = TokenResponse(access_token=token, user=UserRead.model_validate(user))
    return JSONResponse(status_code=201, content=body.model_dump(mode="json"))


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> JSONResponse:
    service = AuthService(db)
    try:
        user, token = service.login(email=payload.email, password=payload.password)
    except InvalidCredentialsError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    body = TokenResponse(access_token=token, user=UserRead.model_validate(user))
    return JSONResponse(status_code=200, content=body.model_dump(mode="json"))


@router.get("/me")
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> JSONResponse:
    merchant = MerchantRepository(db).get_by_id(current_user.merchant_id)
    body = MeResponse(
        user_id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        merchant_id=current_user.merchant_id,
        merchant_name=merchant.name if merchant else current_user.merchant_id,
    )
    return JSONResponse(status_code=200, content=body.model_dump(mode="json"))
