"""
Domain-level exceptions, kept flat here (not nested in a sub-package) to
match config.py / database.py — cross-cutting concerns live as top-level
modules in this codebase rather than under a generic "core" package.

Routes translate these into HTTP responses (see app/api/routes/webhooks.py);
nothing below the route layer should know about status codes.
"""


class DomainError(Exception):
    """Base class for errors raised by the service layer."""


class InvalidSignatureError(DomainError):
    """A webhook's signature could not be verified against its secret."""


class InvalidPayloadError(DomainError):
    """A webhook body doesn't match the shape its adapter expects."""


class PaymentNotFoundError(DomainError):
    """
    A payment_id doesn't correspond to any stored Payment.

    Raised by ContextBuilder (Phase 3) and treated as fatal by the caller
    (HTTP 404) rather than routed into the AI fallback-decision path —
    unlike other "couldn't diagnose well" situations, there is no valid
    Payment row to attach a fallback AIDecision to (the FK would fail).
    """


class LLMProviderError(DomainError):
    """
    The configured LLM provider failed to produce a usable response —
    network failure, auth/config error, rate limit, refusal, or a
    response that doesn't even parse as JSON.

    Deliberately does NOT cover "valid JSON that fails our Pydantic
    schema" — that's a normal, expected outcome handled by validating
    LLMProvider.generate_decision()'s raw_output separately (see
    AIDecisionService), not a provider failure.
    """


class AIDecisionNotFoundError(DomainError):
    """
    No AIDecision exists yet for a payment that recovery execution was
    requested for (Phase 5). Treated as a 409 by the route, not a 404:
    the payment itself is real, there's just nothing to act on until
    POST /ai-decisions/diagnose/{payment_id} runs first.
    """


class PaymentGatewayError(DomainError):
    """
    A PaymentGatewayClient implementation (Phase 5) failed to complete a
    retry-payment or create-payment-link call — network failure, auth/
    config error, or a non-2xx response from the gateway. Caught by the
    executor that called it and turned into a failed ExecutionOutcome
    rather than propagating, so one bad provider call never crashes the
    whole recovery-execution request.
    """


class NotificationError(DomainError):
    """
    A NotificationProvider implementation (Phase 5) failed to send a
    customer or merchant notification. Same handling as
    PaymentGatewayError: caught by the executor, turned into a failed
    ExecutionOutcome.
    """
