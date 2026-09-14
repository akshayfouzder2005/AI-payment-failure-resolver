"""
Recovery action executors — Phase 5.

Sits between RecoveryExecutionService (the orchestrating service) and the
outbound integration packages (payment_gateway_client/,
notification_provider/): one executor class per RecoveryActionType,
dispatched via factory.get_executor(). Kept as its own package rather
than folded into app/services/ because these are implementation details
of exactly one service, the same relationship llm_provider/ has to
AIDecisionService — a focused sub-concern, not a new architectural layer
routes are allowed to reach into directly.
"""
