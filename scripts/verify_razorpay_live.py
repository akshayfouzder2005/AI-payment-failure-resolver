"""
One-off, manual verification that RazorpayGatewayClient (Phase 5) works
against the REAL Razorpay test-mode API. Deliberately not part of the
pytest suite — pytest never needs real network access or real
credentials (test_payment_gateway_client.py monkeypatches httpx.post
instead), and this script does the opposite on purpose: it makes one
real HTTP call, using the exact client class Phase 5 ships, to confirm
the request/response shape I verified against Razorpay's docs actually
holds against the live API.

Save this file to backend/scripts/verify_razorpay_live.py, then:

    cd backend
    # in .env: RECOVERY_GATEWAY_PROVIDER=razorpay
    #          RAZORPAY_KEY_ID=rzp_test_...
    #          RAZORPAY_KEY_SECRET=...
    python scripts/verify_razorpay_live.py

Never commit real credentials — they belong in backend/.env only (which
is already gitignored), never in this file or in chat.
"""
import sys
from decimal import Decimal
from pathlib import Path

# scripts/verify_razorpay_live.py lives one level below backend/ — add
# backend/ itself to sys.path so `from app...` resolves regardless of
# where this is invoked from (python scripts/verify_razorpay_live.py
# only puts scripts/ on the path by default, not its parent).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.integrations.payment_gateway_client.base import PaymentLinkRequest
from app.integrations.payment_gateway_client.factory import get_payment_gateway_client


def main() -> None:
    settings = get_settings()

    if settings.recovery_gateway_provider != "razorpay":
        raise SystemExit(
            "RECOVERY_GATEWAY_PROVIDER is not 'razorpay' in your .env — "
            "set it, along with RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET, before running this."
        )

    if not settings.razorpay_key_id.startswith("rzp_test_"):
        raise SystemExit(
            f"RAZORPAY_KEY_ID={settings.razorpay_key_id!r} doesn't start with "
            "'rzp_test_' — refusing to run against what might be a live key. "
            "Generate a Test Mode key from the Razorpay Dashboard instead."
        )

    client = get_payment_gateway_client()
    request = PaymentLinkRequest(
        amount=Decimal("1.00"),
        currency="INR",
        description="Phase 5 live verification run — safe to ignore, will expire unpaid",
        customer_name="Verification Run",
        customer_email="verify@example.com",
        reference="phase5-live-verify",
    )

    print("Calling the real Razorpay test-mode API...")
    result = client.create_payment_link(request)

    print()
    print("success:            ", result.success)
    print("provider_reference: ", result.provider_reference)
    print("message:            ", result.message)
    print("raw_response:       ", result.raw_response)


if __name__ == "__main__":
    main()