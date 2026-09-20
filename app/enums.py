"""
Shared domain enums, kept flat here (not nested under a sub-package) to
match exceptions.py / config.py / database.py — cross-cutting concerns that
more than one layer needs live as top-level modules in this codebase.

Both of these enums are used by:
- The AI decision schema (app/schemas/ai_decision.py) — constrains what the
  LLM is allowed to say.
- The policy engine (Phase 4) — reasons about the same recommended_action
  values when approving/modifying/rejecting.
- The recovery executor (Phase 5) — dispatches on the same action type
  once the policy engine has approved it.

Defining them once here (rather than separately per phase) means there is
exactly one source of truth for "what actions exist" as the system grows.
"""
from enum import Enum


class RecoveryActionType(str, Enum):
    """
    The five recovery actions this MVP supports. Deliberately closed —
    an unrecognized value from the LLM fails Pydantic validation rather
    than silently becoming a new, ungoverned action type (see the
    architectural rule: the LLM recommends, it never invents new
    capabilities for itself).
    """

    RETRY_PAYMENT = "RETRY_PAYMENT"
    SEND_PAYMENT_LINK = "SEND_PAYMENT_LINK"
    SEND_NOTIFICATION = "SEND_NOTIFICATION"
    ESCALATE_TO_MERCHANT = "ESCALATE_TO_MERCHANT"
    NO_ACTION = "NO_ACTION"


class FailureCategory(str, Enum):
    """
    Coarse classification of *why* a payment failed. Kept small and
    merchant-meaningful rather than mirroring every gateway-specific error
    code — the AI maps whatever Razorpay (or another gateway) reported
    into one of these buckets. UNKNOWN is the deliberate escape hatch: an
    incomplete enum forces the model to guess or refuse, so there's always
    a safe bucket for "doesn't clearly match the others."
    """

    INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS"
    CARD_DECLINED = "CARD_DECLINED"
    EXPIRED_CARD = "EXPIRED_CARD"
    BANK_OR_ISSUER_ERROR = "BANK_OR_ISSUER_ERROR"
    NETWORK_OR_GATEWAY_ERROR = "NETWORK_OR_GATEWAY_ERROR"
    FRAUD_SUSPECTED = "FRAUD_SUSPECTED"
    CUSTOMER_ABANDONED = "CUSTOMER_ABANDONED"
    UNKNOWN = "UNKNOWN"


class RecoveryAttemptStatus(str, Enum):
    """
    Execution-outcome states for a RecoveryAttempt row (Phase 5).

    Deliberately separate from PolicyDecisionType (app/schemas/policy.py):
    - policy_decision records the engine's VERDICT (approve/modify/reject/
      escalate) about the AI's recommendation.
    - status (this enum) records what actually happened when the resulting
      final_action was handed to an executor.
    A REJECT verdict and a SUCCESS status can coexist on the same row (e.g.
    the engine rejects RETRY_PAYMENT and substitutes ESCALATE_TO_MERCHANT,
    which then executes successfully) — the two fields answer different
    questions and neither is derivable from the other.
    """

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"


class AuditAction(str, Enum):
    """
    Canonical audit_logs.action values — Phase 6.

    AuditLog.action stays a plain String column (see app/models/base.py's
    docstring on why domain values aren't native Postgres enums here); this
    enum is an application-layer contract, not a DB constraint, so a typo'd
    action string fails at usage time rather than becoming a silent new
    event type no dashboard filter or test knows about.

    This is deliberately NOT a full inventory of every action string this
    codebase writes. Several of the eleven state transitions the Phase 6
    brief calls out were already unambiguously covered by an earlier
    phase's audit call and are listed here only in comment form so the
    mapping is visible in one place:

        payment failed        -> "payment_failed_recorded"      (Phase 2)
        AI analysis completed  -> "ai_decision_created" /
                                   "ai_decision_fallback_used"   (Phase 3)
        policy evaluated        -> "policy_decision_recorded"    (Phase 5)

    Duplicating those under a second name would double-write a row for the
    exact same instant for no reconstruction benefit. The members below are
    the ones that did NOT already exist as an unambiguous, independently
    filterable action name, added alongside (never replacing) the
    pre-existing calls so every earlier phase's tests keep passing unmodified.
    """

    WEBHOOK_RECEIVED = "webhook_received"
    AI_ANALYSIS_STARTED = "ai_analysis_started"
    ACTION_APPROVED = "action_approved"
    ACTION_REJECTED = "action_rejected"
    ACTION_EXECUTED = "action_executed"
    ACTION_FAILED = "action_failed"
    PAYMENT_RECOVERED = "payment_recovered"
    ESCALATION_CREATED = "escalation_created"

    # --- Post-Phase-7 backend verification: automatic pipeline chaining ---
    # Fired only when the auto-chain (app/services/recovery_pipeline.py)
    # itself blows up in a way AIDecisionService/RecoveryExecutionService's
    # own defensive fallback handling didn't already absorb — every
    # expected failure mode (LLM unavailable, malformed output, low
    # confidence, executor failure...) already has its own audit event
    # from those services and never reaches this one. This is the
    # doc-requested "processing stopped" event, scoped narrowly to
    # "the background pipeline stopped without completing" rather than
    # reused for every REJECT/ESCALATE verdict, which already has its own
    # more specific event.
    PROCESSING_STOPPED = "processing_stopped"

    # --- Phase 7: authentication ---
    USER_REGISTERED = "user_registered"
    USER_LOGIN = "user_login"
    AUTHENTICATION_FAILED = "authentication_failed"

