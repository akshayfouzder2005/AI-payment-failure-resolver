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
