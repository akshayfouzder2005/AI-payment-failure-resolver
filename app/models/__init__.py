"""
Import every model module here so that `Base.metadata` is fully populated
as soon as `app.models` is imported. Alembic's env.py imports this package
for autogenerate support — if a model isn't imported here, Alembic won't
know it exists.
"""
from app.models.ai_decision import AIDecision
from app.models.audit_log import AuditLog
from app.models.customer import Customer
from app.models.merchant import Merchant
from app.models.merchant_settings import MerchantSettings
from app.models.payment import Payment
from app.models.payment_event import PaymentEvent
from app.models.recovery_attempt import RecoveryAttempt
from app.models.user import User

__all__ = [
    "AIDecision",
    "AuditLog",
    "Customer",
    "Merchant",
    "MerchantSettings",
    "Payment",
    "PaymentEvent",
    "RecoveryAttempt",
    "User",
]
