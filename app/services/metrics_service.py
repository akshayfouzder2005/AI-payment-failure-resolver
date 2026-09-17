"""
Deterministic revenue-recovery metrics — Phase 6.

Every metric here has one precise, fixed formula (documented on
MetricsSummary and repeated in short form below), not an approximation a
chart library infers — "make metric calculations deterministic and
testable" (Phase 6 brief) means there is exactly one correct answer for a
given set of rows, always. MetricsRepository does all the SQL
(aggregate-only: COUNT/SUM, no row-by-row business logic); this class
only combines already-aggregated numbers into rates. That split is what
makes get_summary() straightforward to test end-to-end against real
fixture rows — no mocking, just "insert these rows, assert this number."

Status vocabulary this module relies on (see the Payment / RecoveryAttempt
model docstrings for the full picture):
    Payment.status:          failed | retry_scheduled | recovered | escalated | abandoned
    RecoveryAttempt.status:  pending | in_progress | success | failed | skipped
"""
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.enums import RecoveryActionType
from app.repositories.metrics_repository import MetricsRepository
from app.schemas.metrics import MetricsSummary

# Payments in these statuses still represent money not yet collected —
# "revenue at risk". "recovered" (money back) and "abandoned" (written
# off, unused by any code yet but a valid terminal Payment.status per its
# model docstring) are the two states no longer "at risk".
_AT_RISK_STATUSES = ["failed", "retry_scheduled", "escalated"]
_RECOVERED_STATUS = "recovered"
_ESCALATED_STATUS = "escalated"

# The only action type that transitions a Payment straight to "recovered"
# with no further customer/merchant step (see RecoveryExecutionService's
# _SUCCESS_STATUS_TRANSITIONS) — a successful SEND_PAYMENT_LINK only
# reaches "retry_scheduled", pending the customer actually paying via the
# link, so it does not count as an *automatic* recovery.
_AUTOMATIC_RECOVERY_ACTION_TYPES = [RecoveryActionType.RETRY_PAYMENT.value]


class MetricsService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = MetricsRepository(db)

    def get_summary(self, merchant_id: str | None = None) -> MetricsSummary:
        payments_analyzed = self.repo.count_payments(merchant_id)

        revenue_at_risk = self.repo.sum_amount_by_statuses(_AT_RISK_STATUSES, merchant_id)
        revenue_recovered = self.repo.sum_amount_by_statuses([_RECOVERED_STATUS], merchant_id)

        recovered_count = self.repo.count_payments_by_statuses([_RECOVERED_STATUS], merchant_id)
        escalated_count = self.repo.count_payments_by_statuses([_ESCALATED_STATUS], merchant_id)
        automatically_recovered_count = self.repo.count_distinct_payments_with_successful_action(
            RecoveryActionType.RETRY_PAYMENT.value, merchant_id
        )

        attempt_success_count = self.repo.count_recovery_attempts_by_status(["success"], merchant_id)
        attempt_failed_count = self.repo.count_recovery_attempts_by_status(["failed"], merchant_id)
        attempt_skipped_count = self.repo.count_recovery_attempts_by_status(["skipped"], merchant_id)

        durations = self.repo.successful_recovery_durations(_AUTOMATIC_RECOVERY_ACTION_TYPES, merchant_id)

        return MetricsSummary(
            merchant_id=merchant_id,
            payments_analyzed=payments_analyzed,
            revenue_at_risk=revenue_at_risk,
            revenue_recovered=revenue_recovered,
            recovered_count=recovered_count,
            escalated_count=escalated_count,
            automatically_recovered_count=automatically_recovered_count,
            recovery_rate=_rate(recovered_count, payments_analyzed),
            automatic_recovery_rate=_rate(automatically_recovered_count, payments_analyzed),
            escalation_rate=_rate(escalated_count, payments_analyzed),
            recovery_attempt_success_rate=_rate(
                attempt_success_count, attempt_success_count + attempt_failed_count
            ),
            average_recovery_time_seconds=_average_seconds(durations),
            failed_or_blocked_intervention_count=attempt_failed_count + attempt_skipped_count,
            generated_at=datetime.now(timezone.utc),
        )


def _rate(numerator: int, denominator: int) -> float:
    """
    0.0 (never NaN, never a ZeroDivisionError) when nothing has happened
    yet — a fresh/empty database is a valid state to ask this of, not an
    error condition, so callers (a dashboard, a test) never have to
    special-case None.
    """
    if denominator == 0:
        return 0.0
    return round(numerator / denominator, 4)


def _average_seconds(pairs: list[tuple[datetime, datetime]]) -> float | None:
    if not pairs:
        return None
    total = sum((completed_at - created_at).total_seconds() for created_at, completed_at in pairs)
    return round(total / len(pairs), 2)
