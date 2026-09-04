"""
AnthropicLLMProvider tests — Phase 3.

No real network calls: `anthropic.Anthropic.messages.create` is
monkeypatched to return a hand-built fake response shaped like the real
SDK's Message object (only the attributes this provider actually reads:
`.stop_reason` and `.content[i].type`/`.text`). This tests our
request-building and response-handling logic, not Anthropic's API itself.
"""
import json
from types import SimpleNamespace

import anthropic
import pytest

from app.exceptions import LLMProviderError
from app.integrations.llm_provider.anthropic_provider import AnthropicLLMProvider
from tests.test_mock_llm_provider import build_context


def fake_response(stop_reason: str, content: list) -> SimpleNamespace:
    return SimpleNamespace(stop_reason=stop_reason, content=content)


def text_block(text: str) -> SimpleNamespace:
    return SimpleNamespace(type="text", text=text)


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


def test_missing_api_key_raises_at_construction() -> None:
    with pytest.raises(LLMProviderError):
        AnthropicLLMProvider(api_key="", model_name="claude-sonnet-5")


def test_successful_response_returns_parsed_raw_output(monkeypatch) -> None:
    provider = AnthropicLLMProvider(api_key="fake-key", model_name="claude-sonnet-5")
    monkeypatch.setattr(
        provider._client.messages,
        "create",
        lambda **kwargs: fake_response("end_turn", [text_block(VALID_JSON)]),
    )

    result = provider.generate_decision(build_context())

    assert result.model_name == "claude-sonnet-5"
    assert result.raw_output["recommended_action"] == "RETRY_PAYMENT"


def test_refusal_stop_reason_raises_llm_provider_error(monkeypatch) -> None:
    provider = AnthropicLLMProvider(api_key="fake-key", model_name="claude-sonnet-5")
    monkeypatch.setattr(
        provider._client.messages,
        "create",
        lambda **kwargs: fake_response("refusal", []),
    )

    with pytest.raises(LLMProviderError, match="refused"):
        provider.generate_decision(build_context())


def test_max_tokens_stop_reason_raises_llm_provider_error(monkeypatch) -> None:
    provider = AnthropicLLMProvider(api_key="fake-key", model_name="claude-sonnet-5")
    monkeypatch.setattr(
        provider._client.messages,
        "create",
        lambda **kwargs: fake_response("max_tokens", [text_block("{incomplete")]),
    )

    with pytest.raises(LLMProviderError, match="truncated"):
        provider.generate_decision(build_context())


def test_missing_text_block_raises_llm_provider_error(monkeypatch) -> None:
    provider = AnthropicLLMProvider(api_key="fake-key", model_name="claude-sonnet-5")
    monkeypatch.setattr(
        provider._client.messages,
        "create",
        lambda **kwargs: fake_response("end_turn", []),  # no content blocks at all
    )

    with pytest.raises(LLMProviderError, match="no text content"):
        provider.generate_decision(build_context())


def test_unparseable_json_raises_llm_provider_error(monkeypatch) -> None:
    provider = AnthropicLLMProvider(api_key="fake-key", model_name="claude-sonnet-5")
    monkeypatch.setattr(
        provider._client.messages,
        "create",
        lambda **kwargs: fake_response("end_turn", [text_block("not json at all {{{")]),
    )

    with pytest.raises(LLMProviderError, match="not valid JSON"):
        provider.generate_decision(build_context())


def test_api_error_is_wrapped_as_llm_provider_error(monkeypatch) -> None:
    provider = AnthropicLLMProvider(api_key="fake-key", model_name="claude-sonnet-5")

    def raise_api_error(**kwargs):
        raise anthropic.APITimeoutError(request=SimpleNamespace())

    monkeypatch.setattr(provider._client.messages, "create", raise_api_error)

    with pytest.raises(LLMProviderError, match="Anthropic API error"):
        provider.generate_decision(build_context())
