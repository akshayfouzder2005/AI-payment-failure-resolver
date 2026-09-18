"""
Groq LLM provider — Phase 3 (second real provider, alongside Anthropic).

Reaches Groq's OpenAI-compatible Chat Completions API
(https://api.groq.com/openai/v1) via the official `groq` SDK — same
reasoning as anthropic_provider.py using the `anthropic` SDK rather than
hand-rolled HTTP calls.

Model: `openai/gpt-oss-20b`, one of only three models Groq currently
supports `strict: true` (constrained-decoding) Structured Outputs on
— verified against console.groq.com/docs/structured-outputs, not
assumed. Strict mode guarantees the response is valid JSON matching
`_DECISION_SCHEMA` byte-for-byte. `AIDecisionOutput.model_validate()`
still runs one layer up in AIDecisionService regardless — same
reasoning as anthropic_provider.py: numeric `ge=0.0`/`le=1.0` bounds on
`recovery_probability`/`confidence` are NOT part of the JSON Schema
subset structured-decoding constrains on (only type/enum/required/
additionalProperties are), so Pydantic validation is still doing real
enforcement work, not just documenting intent. "Never trust LLM output
without schema validation" holds identically regardless of which
provider produced the output.

Bounded retries for TRANSIENT failures (timeouts, connection errors,
429 rate limits, 5xx) are handled by the `groq` SDK's own built-in
retry logic (`max_retries=`, wired from GROQ_MAX_RETRIES) rather than a
hand-rolled loop here. Critically, the SDK does NOT retry 400 responses
— which is exactly the error strict mode returns on the rare occasion
a schema-validation failure slips through (Groq's own community forum
has reports of this happening ~10% of the time under adversarial
prompts even in strict mode) — so "don't retry validation failures
indefinitely" holds without extra code: a 400 surfaces immediately as
an LLMProviderError and AIDecisionService's existing fallback path
(ESCALATE_TO_MERCHANT, confidence=0.0, audited) takes over, same as any
other provider failure.

`openai/gpt-oss-20b` is a *reasoning* model: by default it spends part
of its output budget on an internal chain-of-thought before the final
answer (`reasoning_effort` defaults to "medium"), and with no
`reasoning_format` set that chain-of-thought is emitted straight into
`message.content` — for GPT-OSS specifically, concatenated with no
separator at all (not even `<think>` tags) — which would break the
`json.loads()` below outright. Groq's docs say `json_schema` mode
switches away from the incompatible `raw` default automatically, but
this sets `reasoning_format="hidden"` explicitly rather than relying on
that: correctness of the JSON parse shouldn't depend on inferring an
auto-behavior that isn't pinned down in a versioned contract.
`reasoning_effort="low"` is set because this task is a bounded
classification+lookup, not multi-step problem-solving — it cuts
latency and the token budget "hidden" reasoning still silently consumes
even when suppressed from the response.
"""
import json
from typing import Any

import groq

from app.exceptions import LLMProviderError
from app.integrations.llm_provider.base import LLMDecisionResult, LLMProvider, PaymentContext
from app.schemas.ai_decision import AIDecisionOutput

_SYSTEM_PROMPT = """\
You are a payment-recovery diagnosis assistant for a merchant's revenue \
recovery system.

You analyze ONE failed payment and its context, then produce a single \
structured diagnosis and recovery recommendation. You NEVER execute \
anything yourself, call any payment gateway, or move money. A separate \
deterministic policy engine is authoritative: it decides whether your \
recommendation is actually carried out, and may reject or modify it \
according to its own rules regardless of what you recommend. Be honest \
about uncertainty (via a lower `confidence`) rather than defaulting to \
the most aggressive action.

Guidance on `recommended_action` (choose exactly one of the five \
supported values — never invent a new one):
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
round numbers. List concrete `risk_factors` as short snake_case tags. \
Never invent payment details, customer details, or capabilities beyond \
what's given to you in the context below."""


def _build_strict_schema() -> dict[str, Any]:
    """
    Groq strict-mode Structured Outputs requires `additionalProperties:
    false` on every object in the schema. AIDecisionOutput already has
    no optional fields (Pydantic's model_json_schema() puts every
    property in `required`), and $defs/$ref for the two enum fields
    (FailureCategory, RecoveryActionType) are supported as-is per
    Groq's "Reusable subschemas" docs — so the only thing missing from
    Pydantic's default output is this one flag on the single top-level
    object. No Anthropic-style transform_schema() equivalent exists for
    Groq; this is the whole transform needed.
    """
    schema = AIDecisionOutput.model_json_schema()
    schema["additionalProperties"] = False
    return schema


_DECISION_SCHEMA = _build_strict_schema()


class GroqLLMProvider(LLMProvider):
    def __init__(
        self,
        api_key: str,
        model_name: str,
        timeout_seconds: float = 20.0,
        max_retries: int = 2,
    ):
        if not api_key:
            raise LLMProviderError("GROQ_API_KEY is not configured")
        self._client = groq.Groq(api_key=api_key, timeout=timeout_seconds, max_retries=max_retries)
        self._model_name = model_name

    def generate_decision(self, context: PaymentContext) -> LLMDecisionResult:
        user_prompt = self._build_user_prompt(context)

        try:
            response = self._client.chat.completions.create(
                model=self._model_name,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "ai_decision",
                        "strict": True,
                        "schema": _DECISION_SCHEMA,
                    },
                },
                reasoning_effort="low",
                reasoning_format="hidden",
                max_completion_tokens=1024,
            )
        # groq.APIError is the common base for every SDK-raised failure:
        # AuthenticationError, RateLimitError, APITimeoutError,
        # APIConnectionError, BadRequestError (incl. the rare strict-mode
        # json_validate_failed), InternalServerError. Catching the base
        # once here mirrors anthropic_provider.py's `except anthropic.
        # APIError` rather than enumerating every subclass.
        except groq.APIError as exc:
            raise LLMProviderError(f"Groq API error: {exc}") from exc
        except Exception as exc:  # anything else the SDK/transport raises
            raise LLMProviderError(f"Groq request failed: {exc}") from exc

        choice = response.choices[0]
        if choice.finish_reason == "length":
            raise LLMProviderError("Groq response was truncated (max tokens reached)")

        content = choice.message.content
        if not content:
            raise LLMProviderError("Groq response contained no content")

        try:
            raw_output: dict[str, Any] = json.loads(content)
        except json.JSONDecodeError as exc:
            raise LLMProviderError(f"Groq response was not valid JSON: {exc}") from exc

        return LLMDecisionResult(model_name=self._model_name, raw_output=raw_output)

    @staticmethod
    def _build_user_prompt(context: PaymentContext) -> str:
        return (
            "Analyze this failed payment and produce a diagnosis and recovery recommendation.\n\n"
            f"{json.dumps(context.to_prompt_dict(), indent=2)}"
        )
