"""
One-off, manual verification that BrevoEmailProvider / TwilioSmsProvider
(Phase 8) work against the REAL Brevo / Twilio APIs. Deliberately not
part of the pytest suite — pytest never needs real network access or
real credentials (test_notification_provider.py monkeypatches httpx.post
instead), and this script does the opposite on purpose: it makes real
HTTP calls, using the exact provider classes Phase 8 ships, to confirm
the request/response shape verified against each vendor's docs actually
holds against the live APIs. Mirrors verify_razorpay_live.py.

Usage:

    cd backend
    # in .env: NOTIFICATION_PROVIDER=live, plus BREVO_*/TWILIO_* below
    python scripts/verify_notifications_live.py --email you@example.com
    python scripts/verify_notifications_live.py --phone +91XXXXXXXXXX
    python scripts/verify_notifications_live.py --email you@example.com --phone +91XXXXXXXXXX

Pass whichever channel(s) you want to test — a real recipient address/
number of your own, since neither vendor has a safe "test" destination
the way Razorpay has test-mode payment methods. Never commit real
credentials — they belong in backend/.env only (already gitignored),
never in this file or in chat.
"""
import argparse
import sys
import uuid
from pathlib import Path

# scripts/verify_notifications_live.py lives one level below backend/ —
# add backend/ itself to sys.path so `from app...` resolves regardless
# of where this is invoked from.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.integrations.notification_provider.base import NotificationRequest
from app.integrations.notification_provider.brevo_provider import BrevoEmailProvider
from app.integrations.notification_provider.twilio_provider import TwilioSmsProvider


def verify_email(recipient: str) -> None:
    settings = get_settings()
    if not settings.brevo_api_key or not settings.brevo_sender_email:
        raise SystemExit(
            "BREVO_API_KEY / BREVO_SENDER_EMAIL are not set in your .env — "
            "set both before running --email."
        )

    provider = BrevoEmailProvider(
        api_key=settings.brevo_api_key,
        sender_email=settings.brevo_sender_email,
        sender_name=settings.brevo_sender_name,
        timeout_seconds=settings.brevo_api_timeout_seconds,
    )
    request = NotificationRequest(
        recipient_type="customer",
        channel="email",
        recipient_email=recipient,
        subject="Revenue Recovery Agent — live verification",
        message="This is a live verification send from Phase 8. Safe to ignore.",
        reference=f"verify-email-{uuid.uuid4().hex[:8]}",
    )

    print(f"Calling the real Brevo API (sending to {recipient})...")
    result = provider.send(request)
    print()
    print("success:            ", result.success)
    print("provider_reference: ", result.provider_reference)
    print("message:            ", result.message)


def verify_sms(recipient: str) -> None:
    settings = get_settings()
    if not settings.twilio_account_sid or not settings.twilio_from_number:
        raise SystemExit(
            "TWILIO_ACCOUNT_SID / TWILIO_FROM_NUMBER are not set in your .env — "
            "set both before running --phone."
        )

    provider = TwilioSmsProvider(
        account_sid=settings.twilio_account_sid,
        from_number=settings.twilio_from_number,
        auth_token=settings.twilio_auth_token,
        api_key_sid=settings.twilio_api_key_sid,
        api_key_secret=settings.twilio_api_key_secret,
        timeout_seconds=settings.twilio_api_timeout_seconds,
    )
    request = NotificationRequest(
        recipient_type="customer",
        channel="sms",
        recipient_phone=recipient,
        subject="",
        message="Revenue Recovery Agent — live verification. Safe to ignore.",
        reference=f"verify-sms-{uuid.uuid4().hex[:8]}",
    )

    print(f"Calling the real Twilio API (sending to {recipient})...")
    result = provider.send(request)
    print()
    print("success:            ", result.success)
    print("provider_reference: ", result.provider_reference)
    print("message:            ", result.message)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", help="Real recipient email address to test Brevo with.")
    parser.add_argument("--phone", help="Real recipient phone number (E.164) to test Twilio with.")
    args = parser.parse_args()

    if not args.email and not args.phone:
        parser.error("Pass --email, --phone, or both.")

    if args.email:
        verify_email(args.email)
    if args.phone:
        print()
        verify_sms(args.phone)


if __name__ == "__main__":
    main()
