"""
GroqLLMProvider tests — Phase 3.

No real network calls: `groq.Groq.chat.completions.create` is
monkeypatched to return a hand-built fake response shaped like the real
SDK's ChatCompletion object (only the attributes this provider actually
reads: `.choices[0].finish_reason` / `.message.content`). This tests our
request-building and response-handling logic, not Groq's API itself —
same approach as test_anthropic_provider.py.
"""
import json
from types import SimpleNamespace

import groq
import httpx
import pytest

from app.exceptions import LLMProviderError
from app.integrations.llm_provider.groq_provider import GroqLLMProvider
from tests.test_mock_llm_provider import build_context

VALID_JSON = json.dumps(
    {
        "failure_category": "INSUFFICIENT_FUNDS",
        "root_cause": "Likely insufficient balance.",
        "recovery_probability": 0.6,
        "recommended_action": "RETRY_PAYMENT",
        "confidence": 0.8,
        "reason": "Transient failure.",
        "risk_factors": [],
    }
)


def fake_response(finish_reason: str, content: str | None) -> SimpleNamespace:
    message = SimpleNamespace(content=content)
    choice = SimpleNamespace(finish_reason=finish_reason, message=message)
    return SimpleNamespace(choices=[choice])


def test_missing_api_key_raises_at_construction() -> None:
    with pytest.raises(LLMProviderError):
        GroqLLMProvider(api_key="", model_name="openai/gpt-oss-20b")


def test_successful_response_returns_parsed_raw_output(monkeypatch) -> None:
    provider = GroqLLMProvider(api_key="fake-key", model_name="openai/gpt-oss-20b")
    monkeypatch.setattr(
        provider._client.chat.completions,
        "create",
        lambda **kwargs: fake_response("stop", VALID_JSON),
    )

    result = provider.generate_decision(build_context())

    assert result.model_name == "openai/gpt-oss-20b"
    assert result.raw_output["recommended_action"] == "RETRY_PAYMENT"


def test_reasoning_is_suppressed_and_bounded(monkeypatch) -> None:
    """
    gpt-oss-20b is a reasoning model; with no reasoning_format set, its
    default ("raw") concatenates chain-of-thought directly into
    `content` with no separator, which would break json.loads() below.
    reasoning_format="hidden" plus a bounded max_completion_tokens are
    load-bearing, not just latency tuning — this pins that they're
    actually sent, so a future refactor can't silently drop them.
    """
    provider = GroqLLMProvider(api_key="fake-key", model_name="openai/gpt-oss-20b")
    captured_kwargs: dict = {}

    def capture(**kwargs):
        captured_kwargs.update(kwargs)
        return fake_response("stop", VALID_JSON)

    monkeypatch.setattr(provider._client.chat.completions, "create", capture)

    provider.generate_decision(build_context())

    assert captured_kwargs["reasoning_format"] == "hidden"
    assert captured_kwargs["reasoning_effort"] == "low"
    assert captured_kwargs["max_completion_tokens"] > 0


def test_length_finish_reason_raises_llm_provider_error(monkeypatch) -> None:
    provider = GroqLLMProvider(api_key="fake-key", model_name="openai/gpt-oss-20b")
    monkeypatch.setattr(
        provider._client.chat.completions,
        "create",
        lambda **kwargs: fake_response("length", "{incomplete"),
    )

    with pytest.raises(LLMProviderError, match="truncated"):
        provider.generate_decision(build_context())


def test_empty_content_raises_llm_provider_error(monkeypatch) -> None:
    provider = GroqLLMProvider(api_key="fake-key", model_name="openai/gpt-oss-20b")
    monkeypatch.setattr(
        provider._client.chat.completions,
        "create",
        lambda **kwargs: fake_response("stop", None),
    )

    with pytest.raises(LLMProviderError, match="no content"):
        provider.generate_decision(build_context())


def test_unparseable_json_raises_llm_provider_error(monkeypatch) -> None:
    provider = GroqLLMProvider(api_key="fake-key", model_name="openai/gpt-oss-20b")
    monkeypatch.setattr(
        provider._client.chat.completions,
        "create",
        lambda **kwargs: fake_response("stop", "not json at all {{{"),
    )

    with pytest.raises(LLMProviderError, match="not valid JSON"):
        provider.generate_decision(build_context())


def test_api_error_is_wrapped_as_llm_provider_error(monkeypatch) -> None:
    provider = GroqLLMProvider(api_key="fake-key", model_name="openai/gpt-oss-20b")

    def raise_api_error(**kwargs):
        raise groq.APITimeoutError(request=httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions"))

    monkeypatch.setattr(provider._client.chat.completions, "create", raise_api_error)

    with pytest.raises(LLMProviderError, match="Groq API error"):
        provider.generate_decision(build_context())


def test_bad_request_error_is_wrapped_as_llm_provider_error(monkeypatch) -> None:
    """
    Covers the rare strict-mode json_validate_failed 400 (Groq's own
    community forum reports this happening under adversarial prompts
    even in strict mode) — must NOT be retried, must flow into the same
    fallback path as any other provider failure.
    """
    provider = GroqLLMProvider(api_key="fake-key", model_name="openai/gpt-oss-20b")
    fake_request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    fake_http_response = httpx.Response(400, request=fake_request)

    def raise_bad_request(**kwargs):
        raise groq.BadRequestError("json_validate_failed", response=fake_http_response, body=None)

    monkeypatch.setattr(provider._client.chat.completions, "create", raise_bad_request)

    with pytest.raises(LLMProviderError, match="Groq API error"):
        provider.generate_decision(build_context())


def test_schema_has_additional_properties_false() -> None:
    """Sanity check that the strict-mode schema transform actually ran."""
    from app.integrations.llm_provider.groq_provider import _DECISION_SCHEMA

    assert _DECISION_SCHEMA["additionalProperties"] is False
    assert set(_DECISION_SCHEMA["required"]) == set(_DECISION_SCHEMA["properties"].keys())
