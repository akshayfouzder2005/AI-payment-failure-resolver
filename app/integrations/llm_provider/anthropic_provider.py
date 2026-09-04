"""
Anthropic (Claude) LLM provider — Phase 3.

Uses Claude's Structured Outputs feature (`output_config.format`), which
is GA on Claude Sonnet 5 (and Opus/Haiku 4.5+) as of this writing —
verified against platform.claude.com/docs/en/build-with-claude/
structured-outputs rather than assumed. This constrains Claude's response
to valid JSON matching AIDecisionOutput's shape via a compiled grammar,
which is strictly stronger than prompting-and-hoping: the response is
guaranteed to be parseable JSON with the right field types and enum
membership.

Two things that constrained decoding does NOT guarantee, both confirmed
against the same docs, are why AIDecisionService still runs its own
Pydantic validation on the result rather than trusting it outright:
1. Numeric range constraints (our `confidence`/`recovery_probability`
   ge=0/le=1) are stripped from the compiled grammar — "unsupported
   constraints" per Anthropic's schema-transform rules.
2. `stop_reason` can be "refusal" (Claude declined for safety reasons) or
   "max_tokens" (truncated) — in both cases the content may not match the
   schema at all despite the feature being enabled. This provider treats
   both as LLMProviderError so they flow into the same fallback path as
   any other failure.

Uses `anthropic.transform_schema()` (SDK >= 1.0) to turn AIDecisionOutput's
Pydantic-generated JSON schema into the shape Structured Outputs expects
(adds `additionalProperties: false`, strips unsupported keywords) rather
than hand-writing the schema twice.
"""
import json
from typing import Any

import anthropic
from anthropic import transform_schema

from app.exceptions import LLMProviderError
from app.integrations.llm_provider.base import LLMDecisionResult, LLMProvider, PaymentContext
from app.schemas.ai_decision import AIDecisionOutput

_SYSTEM_PROMPT = """\
You are a payment-recovery diagnosis assistant for a merchant's revenue \
recovery system.

You analyze ONE failed payment and its context, then produce a single \
structured diagnosis and recovery recommendation. You NEVER execute \
anything yourself — a separate deterministic policy engine decides \
whether your recommendation is actually carried out, so be honest about \
uncertainty (via a lower `confidence`) rather than defaulting to the most \
aggressive action.

Guidance on `recommended_action` (choose exactly one):
- RETRY_PAYMENT: the failure looks transient/recoverable by simply \
retrying the same charge (e.g. temporary insufficient funds, a gateway \
blip).
- SEND_PAYMENT_LINK: the customer likely needs to take an action (new \
card, updated details) so blindly retrying the same instrument won't work.
- SEND_NOTIFICATION: a soft reminder is appropriate; no strong signal for \
a stronger action.
- ESCALATE_TO_MERCHANT: needs human judgement — repeated failures, a \
high-value transaction, or a suspicious/high-risk pattern.
- NO_ACTION: recovery is very unlikely to succeed or isn't worth pursuing \
(e.g. clear customer abandonment, trivial amount).

Base `recovery_probability` and `confidence` on the actual context given \
(failure reason, customer history, merchant policy) — do not default to \
round numbers. List concrete `risk_factors` as short snake_case tags."""

_DECISION_SCHEMA = transform_schema(AIDecisionOutput)


class AnthropicLLMProvider(LLMProvider):
    def __init__(self, api_key: str, model_name: str, timeout_seconds: float = 20.0):
        if not api_key:
            raise LLMProviderError("ANTHROPIC_API_KEY is not configured")
        self._client = anthropic.Anthropic(api_key=api_key, timeout=timeout_seconds)
        self._model_name = model_name

    def generate_decision(self, context: PaymentContext) -> LLMDecisionResult:
        user_prompt = self._build_user_prompt(context)

        try:
            response = self._client.messages.create(
                model=self._model_name,
                max_tokens=1024,
                system=_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
                output_config={"format": {"type": "json_schema", "schema": _DECISION_SCHEMA}},
            )
        except anthropic.APIError as exc:
            raise LLMProviderError(f"Anthropic API error: {exc}") from exc
        except Exception as exc:  # network/timeout/anything the SDK itself raises
            raise LLMProviderError(f"Anthropic request failed: {exc}") from exc

        if response.stop_reason == "refusal":
            raise LLMProviderError("Anthropic refused to produce a decision for this payment")
        if response.stop_reason == "max_tokens":
            raise LLMProviderError("Anthropic response was truncated (max_tokens reached)")

        text_block = next((b for b in response.content if b.type == "text"), None)
        if text_block is None:
            raise LLMProviderError("Anthropic response contained no text content block")

        try:
            raw_output: dict[str, Any] = json.loads(text_block.text)
        except json.JSONDecodeError as exc:
            raise LLMProviderError(f"Anthropic response was not valid JSON: {exc}") from exc

        return LLMDecisionResult(model_name=self._model_name, raw_output=raw_output)

    @staticmethod
    def _build_user_prompt(context: PaymentContext) -> str:
        return (
            "Analyze this failed payment and produce a diagnosis and recovery recommendation.\n\n"
            f"{json.dumps(context.to_prompt_dict(), indent=2)}"
        )
