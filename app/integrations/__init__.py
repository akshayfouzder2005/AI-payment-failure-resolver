"""
External integrations (payment gateway, AI provider, notifications) live
here behind small interfaces.

payment_provider/ — Phase 2, INBOUND: parses/validates webhooks from
Razorpay. llm_provider/ — Phase 3: the AI diagnosis/recommendation call.
payment_gateway_client/ — Phase 5, OUTBOUND: retry/payment-link calls a
RecoveryActionExecutor makes to a gateway. notification_provider/ —
Phase 5: customer/merchant messaging for SEND_NOTIFICATION and
ESCALATE_TO_MERCHANT.
"""
