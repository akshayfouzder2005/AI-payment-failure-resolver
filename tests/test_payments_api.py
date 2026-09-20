"""
API tests for /payments — added post-Phase-7 during backend
verification (there was previously no way for a caller to discover a
payment_id without already having one).
"""
import uuid


def test_list_payments_returns_only_current_merchant_payments(
    client, make_merchant, make_payment, auth_headers
) -> None:
    merchant_a = make_merchant(merchant_id="merchant-a")
    make_merchant(merchant_id="merchant-b")
    mine = make_payment(merchant_id=merchant_a.merchant_id)
    make_payment(merchant_id="merchant-b")  # someone else's — must never appear

    response = client.get("/payments", headers=auth_headers(merchant_id="merchant-a"))

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == str(mine.id)
    assert body[0]["merchant_id"] == "merchant-a"


def test_list_payments_empty_for_merchant_with_no_payments(client, auth_headers) -> None:
    response = client.get("/payments", headers=auth_headers(merchant_id="brand-new-merchant"))
    assert response.status_code == 200
    assert response.json() == []


def test_list_payments_status_filter(client, make_merchant, make_payment, auth_headers) -> None:
    make_merchant(merchant_id="merchant-a")
    make_payment(merchant_id="merchant-a", status="failed")
    recovered = make_payment(merchant_id="merchant-a", status="recovered")
    headers = auth_headers(merchant_id="merchant-a")

    response = client.get("/payments?status=recovered", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == str(recovered.id)


def test_list_payments_newest_first(client, make_merchant, make_payment, auth_headers) -> None:
    make_merchant(merchant_id="merchant-a")
    first = make_payment(merchant_id="merchant-a", gateway_payment_id="pay_first")
    second = make_payment(merchant_id="merchant-a", gateway_payment_id="pay_second")
    headers = auth_headers(merchant_id="merchant-a")

    response = client.get("/payments", headers=headers)

    ids = [row["id"] for row in response.json()]
    assert ids == [str(second.id), str(first.id)]


def test_list_payments_respects_limit(client, make_merchant, make_payment, auth_headers) -> None:
    make_merchant(merchant_id="merchant-a")
    for i in range(5):
        make_payment(merchant_id="merchant-a", gateway_payment_id=f"pay_{i}")
    headers = auth_headers(merchant_id="merchant-a")

    response = client.get("/payments?limit=2", headers=headers)

    assert response.status_code == 200
    assert len(response.json()) == 2


def test_list_payments_without_token_returns_401(client) -> None:
    response = client.get("/payments")
    assert response.status_code == 401


def test_get_payment_detail(client, make_merchant, make_payment, auth_headers) -> None:
    make_merchant(merchant_id="merchant-a")
    payment = make_payment(merchant_id="merchant-a", failure_code="INSUFFICIENT_FUNDS")
    headers = auth_headers(merchant_id="merchant-a")

    response = client.get(f"/payments/{payment.id}", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(payment.id)
    assert body["failure_code"] == "INSUFFICIENT_FUNDS"
    assert body["customer"] is None


def test_get_payment_detail_includes_customer(
    client, make_merchant, make_payment, make_customer, auth_headers
) -> None:
    make_merchant(merchant_id="merchant-a")
    customer = make_customer(name="Priya Sharma", email="priya@example.com")
    payment = make_payment(merchant_id="merchant-a", customer_id=customer.id)
    headers = auth_headers(merchant_id="merchant-a")

    response = client.get(f"/payments/{payment.id}", headers=headers)

    assert response.status_code == 200
    assert response.json()["customer"]["email"] == "priya@example.com"


def test_get_payment_detail_unknown_id_returns_404(client, auth_headers) -> None:
    response = client.get(f"/payments/{uuid.uuid4()}", headers=auth_headers())
    assert response.status_code == 404


def test_get_payment_detail_cross_merchant_returns_404(
    client, make_merchant, make_payment, auth_headers
) -> None:
    make_merchant(merchant_id="merchant-a")
    payment = make_payment(merchant_id="merchant-a")
    headers = auth_headers(merchant_id="merchant-b")

    response = client.get(f"/payments/{payment.id}", headers=headers)

    assert response.status_code == 404


def test_get_payment_detail_without_token_returns_401(client, make_payment) -> None:
    payment = make_payment()
    response = client.get(f"/payments/{payment.id}")
    assert response.status_code == 401

