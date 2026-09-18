"""
LLM provider factory — Phase 3.

One place that turns `AI_PROVIDER` into a concrete `LLMProvider`
instance, so `AIDecisionService` (and tests) never construct a provider
directly. Mirrors how `webhook_service`'s callers pick a
`PaymentProviderAdapter` per-request, except this one is driven by config
rather than which route was hit — there's only one AI provider active at
a time for the whole app.
"""
from app.config import get_settings
from app.integrations.llm_provider.anthropic_provider import AnthropicLLMProvider
from app.integrations.llm_provider.base import LLMProvider
from app.integrations.llm_provider.groq_provider import GroqLLMProvider
from app.integrations.llm_provider.mock_provider import MockLLMProvider


def get_llm_provider() -> LLMProvider:
    settings = get_settings()
    if settings.ai_provider == "anthropic":
        return AnthropicLLMProvider(
            api_key=settings.anthropic_api_key,
            model_name=settings.ai_model_name,
            timeout_seconds=settings.ai_request_timeout_seconds,
        )
    if settings.ai_provider == "groq":
        return GroqLLMProvider(
            api_key=settings.groq_api_key,
            model_name=settings.groq_model_name,
            timeout_seconds=settings.ai_request_timeout_seconds,
            max_retries=settings.groq_max_retries,
        )
    return MockLLMProvider()
