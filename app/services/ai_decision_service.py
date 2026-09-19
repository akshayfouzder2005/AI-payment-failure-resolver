"""
AI decision service — Phase 3.

Orchestrates the full diagnosis pipeline:

    payment_id
        -> ContextBuilder.build()            (Payment + Customer history + MerchantSettings)
        -> LLMProvider.generate_decision()    (raw, untrusted JSON)
        -> AIDecisionOutput.model_validate()  (the ONLY point unvalidated LLM output is trusted)
        -> AIDecision persisted + audited

`diagnose_payment()` is the single entry point both the future `/simulate`
demo flow and a real webhook-triggered pipeline (wired up in a later
phase) will call — same reasoning as WebhookService.ingest() in Phase 2:
one code path, so the demo is provably representative.

Deterministic fallback decision. Per the project brief, a fallback is
used whenever the LLM can't be trusted to have produced something usable:
  1. Payment has no failure_code/failure_message at all — nothing to
     diagnose, so the LLM isn't even called.
  2. LLMProvider raises LLMProviderError — network/auth/refusal/etc.
  3. The LLM's JSON doesn't validate against AIDecisionOutput.
  4. The LLM's own reported confidence is below AI_MIN_CONFIDENCE_THRESHOLD.

In every case, the fallback recommends ESCALATE_TO_MERCHANT with
confidence=0.0 — routing an uncertain case to a human rather than letting
an unreliable signal drive automated recovery. This is itself only a
*recommendation*: the policy engine (Phase 4) still has final say, same
as it does for a normal AI decision.

IMPORTANT: AIDecision is append-only (see its model docstring). Calling
diagnose_payment() twice for the same payment creates two rows on
purpose — every AI call, including ones a later phase's policy engine
might reject, stays in the audit trail. The policy engine reads the
LATEST one (AIDecisionRepository.get_latest_for_payment).
"""
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.enums import AuditAction, FailureCategory, RecoveryActionType
from app.exceptions import LLMProviderError
from app.integrations.llm_provider.base import LLMProvider
from app.integrations.llm_provider.factory import get_llm_provider
from app.models.ai_decision import AIDecision
from app.models.audit_log import AuditLog
from app.repositories.ai_decision_repository import AIDecisionRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.schemas.ai_decision import AIDecisionOutput
from app.services.context_builder import ContextBuilder

FALLBACK_MODEL_NAME = "fallback-deterministic"


class AIDecisionService:
    def __init__(self, db: Session, llm_provider: LLMProvider | None = None):
        self.db = db
        self.ai_decision_repo = AIDecisionRepository(db)
        self.audit_repo = AuditLogRepository(db)
        self.context_builder = ContextBuilder(db)
        # Injectable for tests; defaults to whatever AI_PROVIDER configures.
        self.llm_provider = llm_provider or get_llm_provider()

    def diagnose_payment(self, payment_id: UUID, merchant_id: str | None = None) -> AIDecision:
        # Raises PaymentNotFoundError if the payment truly doesn't exist,
        # or (Phase 7) belongs to a different merchant than merchant_id —
        # left to propagate either way. There's no valid Payment row to
        # attach even a fallback AIDecision to, so this isn't a case the
        # fallback path can paper over (see PaymentNotFoundError's
        # docstring).
        context = self.context_builder.build(payment_id, merchant_id=merchant_id)

        # Phase 6: fired once we know the payment genuinely exists (a
        # PaymentNotFoundError above means there's nothing to attach this
        # to), before the LLM call or the fallback short-circuit below —
        # so "analysis started" is true even for a run that ends up using
        # the deterministic fallback rather than calling the model.
        self.audit_repo.add(
            AuditLog(
                entity_type="Payment",
                entity_id=payment_id,
                action=AuditAction.AI_ANALYSIS_STARTED.value,
                actor="ai_engine",
                details={
                    "has_failure_context": context.payment.failure_code is not None
                    or context.payment.failure_message is not None,
                },
            )
        )

        if context.payment.failure_code is None and context.payment.failure_message is None:
            return self._persist_fallback(
                payment_id,
                model_name=FALLBACK_MODEL_NAME,
                reason="Insufficient context: payment has no failure_code or failure_message to diagnose.",
            )

        try:
            result = self.llm_provider.generate_decision(context)
        except LLMProviderError as exc:
            return self._persist_fallback(
                payment_id, model_name=FALLBACK_MODEL_NAME, reason=f"LLM provider error: {exc}"
            )

        try:
            validated = AIDecisionOutput.model_validate(result.raw_output)
        except ValidationError as exc:
            return self._persist_fallback(
                payment_id,
                model_name=result.model_name,
                reason=f"LLM output failed schema validation: {_summarize(exc)}",
                raw_response=result.raw_output,
            )

        min_confidence = get_settings().ai_min_confidence_threshold
        if validated.confidence < min_confidence:
            return self._persist_fallback(
                payment_id,
                model_name=result.model_name,
                reason=(
                    f"LLM confidence {validated.confidence:.2f} is below the minimum "
                    f"threshold {min_confidence:.2f}."
                ),
                raw_response=result.raw_output,
            )

        decision = self.ai_decision_repo.add(
            AIDecision(
                payment_id=payment_id,
                model_name=result.model_name,
                failure_category=validated.failure_category.value,
                root_cause=validated.root_cause,
                recovery_probability=validated.recovery_probability,
                recommended_action=validated.recommended_action.value,
                confidence=validated.confidence,
                reason=validated.reason,
                risk_factors=validated.risk_factors,
                raw_response=result.raw_output,
            )
        )
        self.audit_repo.add(
            AuditLog(
                entity_type="AIDecision",
                entity_id=decision.id,
                action="ai_decision_created",
                actor="ai_engine",
                details={
                    "model_name": decision.model_name,
                    "recommended_action": decision.recommended_action,
                    "confidence": str(decision.confidence),
                    "recovery_probability": str(decision.recovery_probability),
                },
            )
        )
        self.db.commit()
        return decision

    def _persist_fallback(
        self,
        payment_id: UUID,
        model_name: str,
        reason: str,
        raw_response: dict | None = None,
    ) -> AIDecision:
        decision = self.ai_decision_repo.add(
            AIDecision(
                payment_id=payment_id,
                model_name=model_name,
                failure_category=FailureCategory.UNKNOWN.value,
                root_cause="Automatic diagnosis unavailable for this payment; needs manual review.",
                recovery_probability=0.0,
                recommended_action=RecoveryActionType.ESCALATE_TO_MERCHANT.value,
                confidence=0.0,
                reason=reason,
                risk_factors=["fallback_decision_used"],
                raw_response=raw_response,
            )
        )
        self.audit_repo.add(
            AuditLog(
                entity_type="AIDecision",
                entity_id=decision.id,
                action="ai_decision_fallback_used",
                actor="system",
                details={"reason": reason},
            )
        )
        self.db.commit()
        return decision


def _summarize(exc: ValidationError, max_errors: int = 3) -> str:
    """Short, human-readable summary of a Pydantic ValidationError for audit/reason text."""
    parts = []
    for err in exc.errors()[:max_errors]:
        loc = ".".join(str(p) for p in err["loc"])
        parts.append(f"{loc}: {err['msg']}")
    return "; ".join(parts)
