"""
Schemas for the metrics layer — Phase 6.

`MetricsSummary` is the single dashboard-ready shape GET /metrics/summary
returns. MetricsService (app/services/metrics_service.py) is the only
place that computes its values — see that module's docstring for each
metric's exact, deterministic definition; the field descriptions below
are a short-form pointer back to it, not a second definition to keep in
sync by hand.
"""
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class MetricsSummary(BaseModel):
    merchant_id: str | None = Field(
        default=None, description="Filter used to compute this summary; None means every merchant."
    )

    payments_analyzed: int = Field(
        description="Total Payment rows ever created — one per distinct payment.failed event ever ingested."
    )

    revenue_at_risk: Decimal = Field(
        description="Sum of amount for payments not yet resolved (status in failed/retry_scheduled/escalated)."
    )
    revenue_recovered: Decimal = Field(description="Sum of amount for payments with status='recovered'.")

    recovered_count: int = Field(description="Payments with status='recovered'.")
    escalated_count: int = Field(description="Payments with status='escalated'.")
    automatically_recovered_count: int = Field(
        description=(
            "Distinct payments recovered via a successful RETRY_PAYMENT attempt — the only "
            "action type that resolves a payment to 'recovered' with no further customer or "
            "merchant step in between."
        )
    )

    recovery_rate: float = Field(description="recovered_count / payments_analyzed. 0.0 if no payments yet.")
    automatic_recovery_rate: float = Field(
        description="automatically_recovered_count / payments_analyzed. 0.0 if no payments yet."
    )
    escalation_rate: float = Field(description="escalated_count / payments_analyzed. 0.0 if no payments yet.")
    recovery_attempt_success_rate: float = Field(
        description=(
            "successful RecoveryAttempts / (successful + failed RecoveryAttempts). Skipped "
            "attempts (a policy-blocked NO_ACTION) are excluded from this denominator — they "
            "were never a real attempt at recovery. 0.0 if no attempts have a terminal status yet."
        )
    )

    average_recovery_time_seconds: float | None = Field(
        description=(
            "Mean seconds between Payment.created_at and the completed_at of the RETRY_PAYMENT "
            "attempt that recovered it. None if nothing has been automatically recovered yet."
        )
    )
    failed_or_blocked_intervention_count: int = Field(
        description=(
            "RecoveryAttempts with status='failed' (a provider-level failure) plus "
            "status='skipped' (the policy engine blocked the AI's recommendation into NO_ACTION)."
        )
    )

    generated_at: datetime = Field(description="When this summary was computed — always fresh, never cached.")
