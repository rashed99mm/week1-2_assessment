"""End-to-end API tests for the payment gateway endpoints."""


def _charge_payload(card_token="4242424242424242", amount=100.0) -> dict:
    """Build a valid charge request payload."""
    return {
        "order_id": 1,
        "amount": amount,
        "currency": "USD",
        "card_token": card_token,
    }


def test_health_check(client):
    """The health endpoint must report ok."""
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_charge_approved(client):
    """An eligible charge must return an approved payment envelope."""
    response = client.post("/api/v1/payments/charge", json=_charge_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["status"] == "success"
    assert body["data"]["gateway_reference"].startswith("TXN-")


def test_charge_declined(client):
    """An ineligible charge must return a declined payment envelope."""
    response = client.post("/api/v1/payments/charge", json=_charge_payload("4000000000000002"))

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is False
    assert body["data"]["status"] == "failed"


def test_charge_validation_error(client):
    """An invalid charge payload must return 422."""
    payload = _charge_payload()
    payload["amount"] = -5

    response = client.post("/api/v1/payments/charge", json=payload)

    assert response.status_code == 422


def test_get_payment_returns_404_for_unknown(client):
    """Fetching an unknown payment must return 404."""
    response = client.get("/api/v1/payments/999")

    assert response.status_code == 404


def test_get_payment_returns_stored_payment(client):
    """A charged payment must be retrievable via its id."""
    created = client.post("/api/v1/payments/charge", json=_charge_payload()).json()
    payment_id = created["data"]["id"]

    response = client.get(f"/api/v1/payments/{payment_id}")

    assert response.status_code == 200
    assert response.json()["data"]["id"] == payment_id


def test_refund_successful_payment(client):
    """A successful payment must be refundable."""
    created = client.post("/api/v1/payments/charge", json=_charge_payload()).json()
    payment_id = created["data"]["id"]

    response = client.post(f"/api/v1/payments/{payment_id}/refund", json={"reason": "changed mind"})

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "refunded"


def test_refund_failed_payment_rejected(client):
    """Refunding a failed payment must return 400."""
    created = client.post("/api/v1/payments/charge", json=_charge_payload("4000000000000002")).json()
    payment_id = created["data"]["id"]

    response = client.post(f"/api/v1/payments/{payment_id}/refund", json={})

    assert response.status_code == 400
