"""
Centralized application configuration.

All configuration is read from environment variables (optionally loaded from
a local .env file for development). Nothing here should ever be hardcoded
with real secrets. This module is imported everywhere config is needed so
there is a single source of truth for settings.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "ai-revenue-recovery-agent"
    env: str = "local"
    log_level: str = "INFO"

    database_url: str
    test_database_url: str | None = None

    cors_origins: str = "http://localhost:5173"

    # --- Phase 2: webhook ingestion ---
    # Empty by default so the app boots without it; RazorpayAdapter treats a
    # missing/empty secret as "cannot validate" and rejects every signature
    # rather than silently accepting unsigned requests. Real value comes
    # from the webhook's config in the Razorpay Dashboard.
    razorpay_webhook_secret: str = ""

    # The MVP is single-merchant (see MerchantSettings docstring). Webhooks
    # don't carry our internal merchant_id, so ingestion resolves every
    # payment to this one, auto-provisioning a MerchantSettings row with
    # default policy values on first use if it doesn't exist yet.
    default_merchant_id: str = "default_merchant"

    # --- Phase 3: AI decision service ---
    # "mock" needs zero credentials and runs the full pipeline with a
    # deterministic, rule-based stand-in — the default so the app is
    # demoable before an API key exists. Switch to "anthropic" once
    # ANTHROPIC_API_KEY is set.
    ai_provider: str = "mock"
    anthropic_api_key: str = ""
    # Any current Claude model that supports Structured Outputs
    # (output_config.format) works here; Sonnet is the balanced default
    # for a classification+reasoning task like this one.
    ai_model_name: str = "claude-sonnet-5"
    ai_request_timeout_seconds: float = 20.0
    # Below this, AIDecisionService discards the LLM's recommendation and
    # persists a deterministic fallback decision instead — see
    # ai_decision_service.py.
    ai_min_confidence_threshold: float = 0.4

    # --- Phase 5: recovery action execution ---
    # "mock" needs zero credentials and simulates every provider call
    # deterministically — the default so the full recovery flow is
    # demoable without a Razorpay account. Switch to "razorpay" once
    # RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are set.
    recovery_gateway_provider: str = "mock"
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    # Outbound retry-payment/create-payment-link calls use these — kept
    # separate from razorpay_webhook_secret (Phase 2), which is only ever
    # used to verify *inbound* webhook signatures and has no bearing on
    # outbound API auth.
    razorpay_api_timeout_seconds: float = 15.0

    # Only "mock" exists for Phase 5: it logs the notification and
    # returns success, which is enough to demonstrate SEND_NOTIFICATION /
    # ESCALATE_TO_MERCHANT end-to-end. Wiring a real channel (e.g. an
    # email or SMS provider) is a real integration with its own
    # documented API and is out of scope until one is actually needed.
    notification_provider: str = "mock"
    # Single-tenant MVP (see MerchantSettings docstring) — there is no
    # per-merchant contact column, so ESCALATE_TO_MERCHANT notifies this
    # one operational address rather than a speculative DB column no
    # other feature would use yet.
    merchant_escalation_email: str = "ops@merchant.example"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """
    Settings are cached so we parse the environment once per process.
    Tests that need different settings should override via environment
    variables before this is first called, or use dependency overrides.
    """
    return Settings()
