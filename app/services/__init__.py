"""
Business logic lives here. Populated so far:

- webhook_service, payment_service (Phase 2 — webhook ingestion)
- ai_decision_service, context_builder (Phase 3 — AI diagnosis)
- policy_input_builder, recovery_execution_service (Phase 5 — recovery
  action execution; the policy engine itself lives at app/policy_engine.py,
  added Phase 4)

Still to come: metrics_service (Phase 6).
"""
