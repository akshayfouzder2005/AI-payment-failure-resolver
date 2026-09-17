"""
Seed a realistic synthetic dataset — Phase 6.

    python -m scripts.seed_demo_data
    python -m scripts.seed_demo_data --payments 200 --customers 60
    python -m scripts.seed_demo_data --no-reset   # append instead of resetting first

Generates customers, failed payments spread over the last ~30 days, an
AIDecision per payment, and a RecoveryAttempt per payment — run through
the REAL PolicyEngine (imported, not reimplemented) so seeded data is
exactly as policy-consistent as the live system would produce. Every
step also writes the same AuditLog rows the real pipeline writes, so
GET /audit/payment/{id} and GET /metrics/summary both have something
real to show immediately after running this, before a single live
webhook ever arrives.

Two things here are deliberately NOT calls into the real services:

1. Execution outcomes (success/fail per action, and how long each step
   takes) are drawn from a hand-picked random distribution rather than
   invoked through the real executors. The real mock executors
   (MockPaymentGatewayClient etc.) always succeed — calling them would
   produce a suspiciously perfect 100% success rate, which is useless
   for demonstrating "recovery attempt success rate" or "failed
   interventions" as anything other than zero.

2. Timing between steps uses realistic-but-invented offsets (a retry
   "waiting" 5-180 minutes before firing, matching the idea behind
   MerchantSettings.retry_delay_minutes) rather than the near-instant
   timing the actual synchronous pipeline produces today. This is a
   deliberate modeling choice for a demo-meaningful
   average_recovery_time_seconds (minutes, not milliseconds) — it is
   NOT a claim about how fast the real system responds to a webhook.

Idempotent: every seeded row is tagged (Payment.gateway_payment_id and
Customer.external_id both start with "seed_"), and re-running this
script deletes every previously-seeded row first (unless --no-reset),
so repeated runs during a hackathon demo don't pile up duplicates.
"""
import argparse
import random
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.enums import AuditAction, FailureCategory, RecoveryActionType, RecoveryAttemptStatus
from app.models.ai_decision import AIDecision
from app.models.audit_log import AuditLog
from app.models.customer import Customer
from app.models.payment import Payment
from app.models.payment_event import PaymentEvent
from app.models.recovery_attempt import RecoveryAttempt
from app.policy_engine import PolicyEngine
from app.schemas.policy import MerchantPolicyLimits, PolicyDecisionType, PolicyEvaluationInput, RetryHistory
from app.services.metrics_service import MetricsService
from app.services.payment_service import PaymentService
from app.services.recovery_execution_service import _SUCCESS_STATUS_TRANSITIONS

SEED_PAYMENT_PREFIX = "pay_seed_"
SEED_CUSTOMER_PREFIX = "cust_seed_"

_FIRST_NAMES = [
    "Aarav", "Vivaan", "Ishaan", "Ananya", "Diya", "Sai", "Kabir", "Rohan",
    "Priya", "Neha", "Arjun", "Meera", "Rahul", "Sanya", "Karan", "Pooja",
]
_LAST_NAMES = [
    "Sharma", "Verma", "Iyer", "Gupta", "Reddy", "Nair", "Das", "Bose",
    "Chatterjee", "Mehta", "Rao", "Kapoor", "Joshi", "Menon",
]

# (category, code, message, weight) — weight is relative, not a percentage.
_FAILURE_PROFILES: list[tuple[FailureCategory, str, str, int]] = [
    (FailureCategory.INSUFFICIENT_FUNDS, "BAD_REQUEST_ERROR", "Insufficient funds in the customer's account", 30),
    (FailureCategory.CARD_DECLINED, "GATEWAY_ERROR", "Card declined by issuing bank", 20),
    (FailureCategory.EXPIRED_CARD, "BAD_REQUEST_ERROR", "Card has expired", 10),
    (FailureCategory.BANK_OR_ISSUER_ERROR, "SERVER_ERROR", "Issuing bank server error", 15),
    (FailureCategory.NETWORK_OR_GATEWAY_ERROR, "GATEWAY_ERROR", "Gateway timeout while processing payment", 10),
    (FailureCategory.FRAUD_SUSPECTED, "BAD_REQUEST_ERROR", "Transaction flagged for suspected fraud", 5),
    (FailureCategory.CUSTOMER_ABANDONED, "BAD_REQUEST_ERROR", "Payment authorization abandoned by customer", 5),
    (FailureCategory.UNKNOWN, "SERVER_ERROR", "Unknown processing error", 5),
]

# category -> (action, confidence range, recovery_probability range). A
# rough stand-in for "what a real LLM diagnosis would plausibly say",
# not a claim about MockLLMProvider/AnthropicProvider's actual output.
_RECOMMENDATION_PROFILES: dict[FailureCategory, tuple[RecoveryActionType, tuple, tuple]] = {
    FailureCategory.INSUFFICIENT_FUNDS: (RecoveryActionType.RETRY_PAYMENT, (0.75, 0.95), (0.60, 0.85)),
    FailureCategory.CARD_DECLINED: (RecoveryActionType.SEND_PAYMENT_LINK, (0.60, 0.85), (0.40, 0.65)),
    FailureCategory.EXPIRED_CARD: (RecoveryActionType.SEND_PAYMENT_LINK, (0.70, 0.90), (0.50, 0.70)),
    FailureCategory.BANK_OR_ISSUER_ERROR: (RecoveryActionType.RETRY_PAYMENT, (0.60, 0.80), (0.50, 0.75)),
    FailureCategory.NETWORK_OR_GATEWAY_ERROR: (RecoveryActionType.RETRY_PAYMENT, (0.80, 0.95), (0.70, 0.90)),
    FailureCategory.FRAUD_SUSPECTED: (RecoveryActionType.ESCALATE_TO_MERCHANT, (0.50, 0.70), (0.10, 0.30)),
    FailureCategory.CUSTOMER_ABANDONED: (RecoveryActionType.SEND_NOTIFICATION, (0.50, 0.70), (0.20, 0.40)),
    FailureCategory.UNKNOWN: (RecoveryActionType.NO_ACTION, (0.30, 0.50), (0.20, 0.40)),
}

# action_type -> probability the executor "succeeds" — hand-picked for a
# demo-realistic mix, not derived from any real provider (see module
# docstring point 1).
_SUCCESS_PROBABILITY: dict[RecoveryActionType, float] = {
    RecoveryActionType.RETRY_PAYMENT: 0.65,
    RecoveryActionType.SEND_PAYMENT_LINK: 0.85,
    RecoveryActionType.SEND_NOTIFICATION: 0.92,
    RecoveryActionType.ESCALATE_TO_MERCHANT: 0.90,
}

_AMOUNT_BANDS = [
    (Decimal("149.00"), Decimal("999.00"), 40),
    (Decimal("1000.00"), Decimal("4999.00"), 35),
    (Decimal("5000.00"), Decimal("14999.00"), 20),
    (Decimal("15000.00"), Decimal("60000.00"), 5),
]


def _weighted_choice(items_with_weights):
    """Each item is a tuple ending in an integer weight; returns one full
    item (weight included) chosen with that relative weight."""
    weights = [item[-1] for item in items_with_weights]
    return random.choices(items_with_weights, weights=weights, k=1)[0]


def _pick_amount() -> Decimal:
    low, high, _weight = _weighted_choice(_AMOUNT_BANDS)
    cents = random.randint(int(low * 100), int(high * 100))
    return (Decimal(cents) / 100).quantize(Decimal("0.01"))


def _pick_failure() -> tuple[FailureCategory, str, str]:
    category, code, message, _weight = _weighted_choice(_FAILURE_PROFILES)
    return category, code, message


def _audit(db: Session, entity_type: str, entity_id, action: str, actor: str, message: str, **extra) -> None:
    db.add(
        AuditLog(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            actor=actor,
            details={"message": message, **extra},
        )
    )


def reset_seeded_data(db: Session) -> None:
    """Delete every previously-seeded row (and its audit trail), oldest
    dependency last, so re-running this script is idempotent."""
    payment_ids = list(db.scalars(select(Payment.id).where(Payment.gateway_payment_id.like(f"{SEED_PAYMENT_PREFIX}%"))))
    if not payment_ids:
        return

    attempt_ids = list(db.scalars(select(RecoveryAttempt.id).where(RecoveryAttempt.payment_id.in_(payment_ids))))
    decision_ids = list(db.scalars(select(AIDecision.id).where(AIDecision.payment_id.in_(payment_ids))))
    event_ids = list(db.scalars(select(PaymentEvent.id).where(PaymentEvent.payment_id.in_(payment_ids))))

    for entity_type, ids in [
        ("Payment", payment_ids),
        ("RecoveryAttempt", attempt_ids),
        ("AIDecision", decision_ids),
        ("PaymentEvent", event_ids),
    ]:
        if ids:
            db.execute(delete(AuditLog).where(AuditLog.entity_type == entity_type, AuditLog.entity_id.in_(ids)))

    db.execute(delete(RecoveryAttempt).where(RecoveryAttempt.payment_id.in_(payment_ids)))
    db.execute(delete(AIDecision).where(AIDecision.payment_id.in_(payment_ids)))
    db.execute(delete(PaymentEvent).where(PaymentEvent.payment_id.in_(payment_ids)))
    db.execute(delete(Payment).where(Payment.id.in_(payment_ids)))
    db.execute(delete(Customer).where(Customer.external_id.like(f"{SEED_CUSTOMER_PREFIX}%")))
    db.commit()
    print(f"Reset: removed {len(payment_ids)} previously-seeded payments and everything linked to them.")


def seed_customers(db: Session, count: int) -> list[Customer]:
    customers = []
    for i in range(count):
        first = random.choice(_FIRST_NAMES)
        last = random.choice(_LAST_NAMES)
        customer = Customer(
            external_id=f"{SEED_CUSTOMER_PREFIX}{uuid.uuid4().hex[:10]}",
            name=f"{first} {last}",
            email=f"{first.lower()}.{last.lower()}{i}@example.com",
            phone=f"+9198{random.randint(10000000, 99999999)}",
        )
        db.add(customer)
        customers.append(customer)
    db.flush()
    return customers


def _random_past_timestamp(days_back: int) -> datetime:
    now = datetime.now(timezone.utc)
    offset = timedelta(
        days=random.uniform(0, days_back),
        hours=random.uniform(0, 24),
        minutes=random.uniform(0, 60),
    )
    return now - offset


def seed_one_payment(db: Session, merchant, customer: Customer) -> None:
    category, failure_code, failure_message = _pick_failure()
    amount = _pick_amount()
    payment_created_at = _random_past_timestamp(days_back=30)

    payment = Payment(
        customer_id=customer.id,
        merchant_id=merchant.merchant_id,
        gateway="razorpay",
        gateway_payment_id=f"{SEED_PAYMENT_PREFIX}{uuid.uuid4().hex[:16]}",
        amount=amount,
        currency="INR",
        status="failed",
        failure_code=failure_code,
        failure_message=failure_message,
        created_at=payment_created_at,
    )
    db.add(payment)
    db.flush()

    event = PaymentEvent(
        payment_id=payment.id,
        provider="razorpay",
        event_id=f"evt_seed_{uuid.uuid4().hex}",
        event_type="payment.failed",
        payload={"seed": True, "gateway_payment_id": payment.gateway_payment_id},
        processing_status="processed",
        processed_at=payment_created_at,
        created_at=payment_created_at,
    )
    db.add(event)
    db.flush()

    _audit(
        db, "PaymentEvent", event.id, AuditAction.WEBHOOK_RECEIVED.value, "system",
        f"Received razorpay:{event.event_id} (payment.failed)",
    )
    _audit(
        db, "Payment", payment.id, "payment_failed_recorded", "system",
        f"Recorded failed payment {payment.gateway_payment_id}: {failure_message}",
    )
    _audit(
        db, "Payment", payment.id, AuditAction.AI_ANALYSIS_STARTED.value, "ai_engine",
        "Diagnosis started.", has_failure_context=True,
    )

    # ~15% of payments already had one failed RETRY_PAYMENT attempt before
    # this diagnosis — enough volume to demonstrate the policy engine's
    # repeated-failures escalation rule in the seeded data.
    had_prior_failure = random.random() < 0.15
    prior_attempt_time = None
    if had_prior_failure:
        prior_attempt_time = payment_created_at + timedelta(minutes=random.uniform(5, 60))
        prior_attempt = RecoveryAttempt(
            payment_id=payment.id,
            ai_decision_id=None,
            action_type=RecoveryActionType.RETRY_PAYMENT.value,
            attempt_number=1,
            status=RecoveryAttemptStatus.FAILED.value,
            policy_decision=PolicyDecisionType.APPROVE.value,
            policy_reason="Seeded prior attempt.",
            started_at=prior_attempt_time,
            completed_at=prior_attempt_time + timedelta(seconds=random.uniform(2, 20)),
            error_message="Simulated: retry gateway declined again.",
            created_at=prior_attempt_time,
        )
        db.add(prior_attempt)
        db.flush()

    action, confidence_range, probability_range = _RECOMMENDATION_PROFILES[category]
    confidence = round(random.uniform(*confidence_range), 3)
    recovery_probability = round(random.uniform(*probability_range), 3)
    ai_decision_time = payment_created_at + timedelta(seconds=random.uniform(2, 15))

    decision = AIDecision(
        payment_id=payment.id,
        model_name="mock-llm-v1",
        failure_category=category.value,
        root_cause=f"Seeded diagnosis based on failure_code={failure_code}.",
        recovery_probability=Decimal(str(recovery_probability)),
        recommended_action=action.value,
        confidence=Decimal(str(confidence)),
        reason=f"Seeded recommendation for {category.value} failures.",
        risk_factors=[category.value.lower()],
        raw_response={"seed": True},
        created_at=ai_decision_time,
    )
    db.add(decision)
    db.flush()
    _audit(
        db, "AIDecision", decision.id, "ai_decision_created", "ai_engine",
        f"AI recommended {action.value} (confidence={confidence}).",
    )

    merchant_policy = MerchantPolicyLimits(
        merchant_id=merchant.merchant_id,
        max_retry_count=merchant.max_retry_count,
        retry_delay_minutes=merchant.retry_delay_minutes,
        high_risk_amount_threshold=merchant.high_risk_amount_threshold,
        escalation_failure_threshold=merchant.escalation_failure_threshold,
        auto_recovery_enabled=merchant.auto_recovery_enabled,
    )
    policy_input = PolicyEvaluationInput(
        payment_id=payment.id,
        payment_amount=amount,
        currency="INR",
        failure_category=category.value,
        recommended_action=action.value,
        ai_confidence=confidence,
        ai_recovery_probability=recovery_probability,
        retry_history=RetryHistory(
            retry_attempt_count=1 if had_prior_failure else 0,
            failed_attempt_count=1 if had_prior_failure else 0,
            last_retry_attempted_at=prior_attempt_time,
        ),
        merchant_policy=merchant_policy,
        evaluated_at=ai_decision_time,
    )
    decision_result = PolicyEngine().evaluate(policy_input)

    attempt_started_at = ai_decision_time + timedelta(seconds=random.uniform(1, 5))
    final_action = decision_result.final_action

    if final_action == RecoveryActionType.NO_ACTION:
        status = RecoveryAttemptStatus.SKIPPED
        completed_at = attempt_started_at
        error_message = None
        external_reference = None
    else:
        succeeded = random.random() < _SUCCESS_PROBABILITY[final_action]
        status = RecoveryAttemptStatus.SUCCESS if succeeded else RecoveryAttemptStatus.FAILED
        # Deliberately invented pacing, not the real (near-instant)
        # pipeline's timing — see module docstring point 2.
        if final_action == RecoveryActionType.RETRY_PAYMENT:
            completed_at = attempt_started_at + timedelta(minutes=random.uniform(5, 180))
        else:
            completed_at = attempt_started_at + timedelta(seconds=random.uniform(2, 30))
        error_message = None if succeeded else _simulated_error(final_action)
        external_reference = f"{final_action.value.lower()}_seed_{uuid.uuid4().hex[:10]}" if succeeded else None

    attempt = RecoveryAttempt(
        payment_id=payment.id,
        ai_decision_id=decision.id,
        action_type=final_action.value,
        attempt_number=2 if had_prior_failure else 1,
        status=status.value,
        policy_decision=decision_result.decision.value,
        policy_reason=decision_result.reason,
        started_at=attempt_started_at,
        completed_at=completed_at,
        error_message=error_message,
        external_reference=external_reference,
        created_at=attempt_started_at,
    )
    db.add(attempt)
    db.flush()

    _audit(
        db, "RecoveryAttempt", attempt.id, "policy_decision_recorded", "system",
        f"Policy engine {decision_result.decision.value} the AI's {action.value} recommendation; "
        f"final_action={final_action.value}.",
        violated_rules=decision_result.violated_rules,
    )
    _audit(
        db, "RecoveryAttempt", attempt.id,
        AuditAction.ACTION_APPROVED.value if decision_result.decision == PolicyDecisionType.APPROVE
        else AuditAction.ACTION_REJECTED.value,
        "policy_engine",
        f"Policy verdict {decision_result.decision.value} -> final_action={final_action.value}.",
    )

    if status != RecoveryAttemptStatus.SKIPPED:
        _audit(
            db, "RecoveryAttempt", attempt.id, "recovery_action_executed", "system",
            f"{final_action.value} finished with status={status.value}.",
        )
        _audit(
            db, "RecoveryAttempt", attempt.id,
            AuditAction.ACTION_EXECUTED.value if status == RecoveryAttemptStatus.SUCCESS
            else AuditAction.ACTION_FAILED.value,
            "executor",
            f"{final_action.value} {'executed successfully' if status == RecoveryAttemptStatus.SUCCESS else 'failed'}.",
        )

    if status == RecoveryAttemptStatus.SUCCESS:
        new_status = _SUCCESS_STATUS_TRANSITIONS.get(final_action)
        if new_status:
            payment.status = new_status
            _audit(
                db, "Payment", payment.id, "payment_status_updated", "system",
                f"Payment status changed from 'failed' to '{new_status}' following a successful {final_action.value}.",
            )
            if new_status == "recovered":
                _audit(db, "Payment", payment.id, AuditAction.PAYMENT_RECOVERED.value, "system",
                       f"Payment recovered via {final_action.value}.")
            elif new_status == "escalated":
                _audit(db, "Payment", payment.id, AuditAction.ESCALATION_CREATED.value, "system",
                       f"Payment escalated to merchant via {final_action.value}.")


def _simulated_error(action_type: RecoveryActionType) -> str:
    messages = {
        RecoveryActionType.RETRY_PAYMENT: "Simulated: gateway declined retry (insufficient funds persists).",
        RecoveryActionType.SEND_PAYMENT_LINK: "Simulated: payment link provider timeout.",
        RecoveryActionType.SEND_NOTIFICATION: "Simulated: notification provider rejected the request.",
        RecoveryActionType.ESCALATE_TO_MERCHANT: "Simulated: escalation notification delivery failed.",
    }
    return messages.get(action_type, "Simulated: executor error.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--payments", type=int, default=120, help="Number of synthetic payments to create.")
    parser.add_argument("--customers", type=int, default=40, help="Number of synthetic customers to create.")
    parser.add_argument("--seed", type=int, default=42, help="random.seed() value, for reproducible runs.")
    parser.add_argument("--no-reset", action="store_true", help="Append instead of clearing prior seeded data first.")
    args = parser.parse_args()

    random.seed(args.seed)
    db = SessionLocal()
    try:
        if not args.no_reset:
            reset_seeded_data(db)

        merchant = PaymentService(db).ensure_default_merchant()
        db.commit()

        customers = seed_customers(db, args.customers)
        db.commit()

        for _ in range(args.payments):
            seed_one_payment(db, merchant, random.choice(customers))
        db.commit()

        print(f"Seeded {args.customers} customers and {args.payments} payments for merchant '{merchant.merchant_id}'.")

        summary = MetricsService(db).get_summary(merchant_id=merchant.merchant_id)
        print("\n--- metrics/summary preview ---")
        for field, value in summary.model_dump().items():
            print(f"  {field}: {value}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
