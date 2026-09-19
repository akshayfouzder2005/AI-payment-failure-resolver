"""
Request/response schemas for POST /auth/register, POST /auth/login, and
GET /auth/me — Phase 7.

Email validation is a lightweight regex (`_EMAIL_RE`), not
`pydantic.EmailStr`, to avoid pulling in the `email-validator` package
for a hackathon MVP — "reasonable input validation", not RFC 5322
completeness (see RegisterRequest/LoginRequest's `_normalize_email`).
Real deliverability is proven at login time (the account either works or
it doesn't), not by how strict this regex is.
"""
import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _normalize_email(value: str) -> str:
    normalized = value.strip().lower()
    if not _EMAIL_RE.match(normalized):
        raise ValueError("must be a valid email address")
    return normalized


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: str
    password: str = Field(min_length=8, max_length=255)
    merchant_name: str = Field(min_length=1, max_length=255)

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str) -> str:
        return _normalize_email(value)

    @field_validator("name", "merchant_name")
    @classmethod
    def _strip(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped


class LoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=1)

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str) -> str:
        return _normalize_email(value)


class UserRead(BaseModel):
    id: UUID
    name: str
    email: str
    merchant_id: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class MeResponse(BaseModel):
    user_id: UUID
    name: str
    email: str
    merchant_id: str
    merchant_name: str
