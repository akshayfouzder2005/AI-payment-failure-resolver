"""
Tests for app/services/recovery_pipeline.py — the auto-chain that turns
webhook/simulate ingestion into a fully automatic diagnosis -> policy ->
execution flow (Section 6 of the post-Phase-7 backend verification pass).

test_recovery_api.py::test_full_demo_flow_via_http already covers the
success path end-to-end over HTTP; this file covers the pipeline's own
edge-case requirements: it must not fire on a duplicate delivery or an
ignored event type, an unexpected failure inside it must not surface as
an HTTP error or crash the app, and it must be usable directly (not just
via BackgroundTasks) for lower-level testing.
"""
import json
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import select

from app.config import get_settings
from app.enums import AuditAction
from app.models.ai_decision import AIDecision
from app.models.audit_log import AuditLog
from app.models.recovery_attempt import RecoveryAttempt
from app.services.recovery_pipeline import run_recovery_pipeline


def test_pipeline_does_not_fire_on_duplicate_webhook_delivery(
    client, db_session, razorpay_failed_payment_payload, sign, event_id_header
) -> None:
    body = razorpay_failed_payment_payload(gateway_payment_id="pay_pipeline_dup")
    headers = {"x-razorpay-signature": sign(body), **event_id_header("evt_pipeline_dup")}

    client.post("/webhooks/razorpay", content=body, headers=headers)
    second = client.post("/webhooks/razorpay", content=body, headers=headers)

    assert second.json()["status"] == "duplicate"
    # Exactly one of each — a second pipeline run for the duplicate would
    # have produced a second AIDecision and a second RecoveryAttempt.
    assert len(db_session.scalars(select(AIDecision)).all()) == 1
    assert len(db_session.scalars(select(RecoveryAttempt)).all()) == 1


def test_pipeline_does_not_fire_for_ignored_event_type(
    client, db_session, razorpay_failed_payment_payload, sign, event_id_header
) -> None:
    body_dict = json.loads(razorpay_failed_payment_payload(gateway_payment_id="pay_pipeline_ignored"))
    body_dict["event"] = "payment.captured"
    body = json.dumps(body_dict).encode()

    response = client.post(
        "/webhooks/razorpay",
        content=body,
        headers={"x-razorpay-signature": sign(body), **event_id_header()},
    )

    assert response.json()["status"] == "ignored"
    assert db_session.scalars(select(AIDecision)).all() == []
    assert db_session.scalars(select(RecoveryAttempt)).all() == []


def test_pipeline_failure_does_not_surface_as_http_error(client, db_session) -> None:
    """
    An entirely unexpected exception inside the pipeline (not one of the
    already-handled fallback cases AIDecisionService/RecoveryExecutionService
    cover themselves) must not turn into a failed webhook acknowledgement —
    the event was already durably captured before the pipeline ever runs.
    """
    with patch(
        "app.services.ai_decision_service.AIDecisionService.diagnose_payment",
        side_effect=RuntimeError("simulated unexpected pipeline crash"),
    ):
        response = client.post("/simulate/failed-payment", json={"amount": "250.00"})

    assert response.status_code == 200
    assert response.json()["status"] == "processed"


def test_pipeline_failure_is_audited_as_processing_stopped(client, db_session) -> None:
    with patch(
        "app.services.ai_decision_service.AIDecisionService.diagnose_payment",
        side_effect=RuntimeError("simulated unexpected pipeline crash"),
    ):
        response = client.post("/simulate/failed-payment", json={"amount": "250.00"})

    payment_id = response.json()["payment_id"]
    logs = db_session.scalars(
        select(AuditLog).where(AuditLog.entity_type == "Payment", AuditLog.entity_id == payment_id)
    ).all()
    actions = {log.action for log in logs}
    assert AuditAction.PROCESSING_STOPPED.value in actions

    stopped_entry = next(log for log in logs if log.action == AuditAction.PROCESSING_STOPPED.value)
    assert stopped_entry.actor == "system"

    # And critically: no half-finished AIDecision/RecoveryAttempt from the
    # crashed run — diagnose_payment raised before persisting anything.
    assert db_session.scalars(select(AIDecision)).all() == []
    assert db_session.scalars(select(RecoveryAttempt)).all() == []


def test_pipeline_does_not_crash_the_process_for_an_unknown_payment_id(db_session) -> None:
    """
    Calling the pipeline function directly (as BackgroundTasks would, not
    via HTTP) for a payment_id that doesn't exist must be swallowed, not
    raised — proves run_recovery_pipeline itself is safe to schedule
    fire-and-forget, independent of the HTTP layer around it.
    """
    run_recovery_pipeline(
        uuid4(), get_settings().default_merchant_id, session_factory=lambda: db_session
    )  # must not raise

