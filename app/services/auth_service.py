"""
Authentication service — Phase 7.

Two operations: register() (creates a new Merchant + User pair, one new
tenant) and login() (verifies credentials, issues a JWT). Mirrors
WebhookService's shape (Phase 2): a plain class taking a Session, one
private `_audit` helper, explicit commit boundaries.

Email lookup/storage is always on the normalized (stripped, lowercased)
form — see `_normalize_email` — so "User@Example.com" and
"user@example.com" are treated as the same account both at register
(uniqueness check) and login time. RegisterRequest/LoginRequest already
normalize at the schema layer (app/schemas/auth.py); normalizing again
here means this service is correct even if called directly (e.g. from a
future seed/admin script), not only via the HTTP route.
"""
import re
import uuid

from sqlalchemy.orm import Session

from app.enums import AuditAction
from app.exceptions import EmailAlreadyRegisteredError, InvalidCredentialsError
from app.models.audit_log import AuditLog
from app.models.merchant import Merchant
from app.models.user import User
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.merchant_repository import MerchantRepository
from app.repositories.user_repository import UserRepository
from app.security import create_access_token, hash_password, verify_password

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _slugify_merchant_name(name: str) -> str:
    """
    Turns a merchant's display name into a short, identifier-safe
    merchant_id, then appends a random suffix to guarantee uniqueness
    even if two signups pick the same name (e.g. two demo accounts both
    called "Test Store"). Truncated well under merchant_id's
    String(100) column limit.
    """
    slug = _SLUG_RE.sub("-", name.strip().lower()).strip("-") or "merchant"
    return f"{slug[:70]}-{uuid.uuid4().hex[:8]}"


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.user_repo = UserRepository(db)
        self.merchant_repo = MerchantRepository(db)
        self.audit_repo = AuditLogRepository(db)

    def register(
        self, name: str, email: str, password: str, merchant_name: str
    ) -> tuple[User, Merchant, str]:
        """
        Creates exactly one new Merchant and one new User, or neither —
        the uniqueness check runs before either row is created, so a
        duplicate-email request never leaves an orphaned Merchant behind
        (the "do not create duplicate merchants if registration fails
        midway" requirement). Both inserts + the audit row + the commit
        happen in this one method, so there is no partial-registration
        state visible to any other request.
        """
        normalized_email = _normalize_email(email)
        if self.user_repo.get_by_email(normalized_email) is not None:
            raise EmailAlreadyRegisteredError(f"{normalized_email} is already registered")

        merchant = self.merchant_repo.add(
            Merchant(merchant_id=_slugify_merchant_name(merchant_name), name=merchant_name.strip())
        )
        user = self.user_repo.add(
            User(
                merchant_id=merchant.merchant_id,
                name=name.strip(),
                email=normalized_email,
                password_hash=hash_password(password),
            )
        )
        self._audit(
            "User",
            user.id,
            AuditAction.USER_REGISTERED.value,
            f"User {normalized_email} registered under new merchant '{merchant.merchant_id}'.",
        )
        self.db.commit()

        token = create_access_token(user_id=str(user.id), merchant_id=user.merchant_id)
        return user, merchant, token

    def login(self, email: str, password: str) -> tuple[User, str]:
        """
        Deliberately identical failure (InvalidCredentialsError, no
        further detail) for "no such user", "wrong password", and
        "inactive account" — distinguishing them in the response would
        let a caller enumerate which emails have accounts.
        """
        normalized_email = _normalize_email(email)
        user = self.user_repo.get_by_email(normalized_email)

        if user is not None and user.is_active and verify_password(password, user.password_hash):
            self._audit(
                "User", user.id, AuditAction.USER_LOGIN.value, f"User {normalized_email} logged in."
            )
            self.db.commit()
            token = create_access_token(user_id=str(user.id), merchant_id=user.merchant_id)
            return user, token

        if user is not None:
            # Nothing to audit against for a truly unknown email — there
            # is no real User row to attach the entry to, and AuditLog's
            # entity_id is a real reference to an entity that exists
            # (see its model docstring), not a free-text field.
            self._audit(
                "User",
                user.id,
                AuditAction.AUTHENTICATION_FAILED.value,
                f"Failed login attempt for {normalized_email}.",
            )
            self.db.commit()

        raise InvalidCredentialsError("Invalid email or password")

    def _audit(self, entity_type: str, entity_id: uuid.UUID, action: str, message: str) -> None:
        self.audit_repo.add(
            AuditLog(
                entity_type=entity_type,
                entity_id=entity_id,
                action=action,
                actor="user",
                details={"message": message},
            )
        )
