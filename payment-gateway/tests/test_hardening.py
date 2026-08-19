"""Tests for the deployment hardening: gateway auth, money precision, envelope.

None of this was covered before. The gateway had no authentication at all, it
stored money as a binary float, and its error responses used FastAPI's
``{"detail": ...}`` shape rather than the envelope every other service in the
system speaks.
"""

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


def _charge_payload(card_token="4242424242424242", amount="100.00") -> dict:
    return {
        "order_id": 1,
        "amount": amount,
        "currency": "USD",
        "card_token": card_token,
    }


# ---------------------------------------------------------------------------
# Gateway key
# ---------------------------------------------------------------------------


@pytest.fixture()
def secured_client(db, monkeypatch):
    """A client for a gateway that requires the shared key."""
    monkeypatch.setattr(settings, "GATEWAY_API_KEY", "s3cret-key")
    with TestClient(app) as client:
        yield client


def test_charge_without_a_key_is_rejected(secured_client):
    response = secured_client.post("/api/v1/payments/charge", json=_charge_payload())

    assert response.status_code == 401
    assert response.json()["success"] is False


def test_charge_with_a_wrong_key_is_rejected(secured_client):
    response = secured_client.post(
        "/api/v1/payments/charge",
        json=_charge_payload(),
        headers={"X-Gateway-Key": "not-the-key"},
    )

    assert response.status_code == 401


def test_charge_with_the_correct_key_succeeds(secured_client):
    response = secured_client.post(
        "/api/v1/payments/charge",
        json=_charge_payload(),
        headers={"X-Gateway-Key": "s3cret-key"},
    )

    assert response.status_code == 200
    assert response.json()["success"] is True


def test_health_stays_open(secured_client):
    """The container healthcheck runs before any credential is configured."""
    assert secured_client.get("/health").status_code == 200


def test_authentication_is_off_when_no_key_is_configured(client):
    """A bare local checkout and the test suite work without a credential."""
    assert settings.GATEWAY_API_KEY == ""

    response = client.post("/api/v1/payments/charge", json=_charge_payload())

    assert response.status_code == 200


# ---------------------------------------------------------------------------
# Money precision
# ---------------------------------------------------------------------------


def test_amount_is_returned_as_a_decimal_string(client):
    response = client.post("/api/v1/payments/charge", json=_charge_payload(amount="100.00"))

    amount = response.json()["data"]["amount"]

    # A JSON number would be re-parsed as a float by the caller, undoing the
    # exactness the Decimal column exists to provide.
    assert isinstance(amount, str)
    assert amount == "100.00"


def test_a_value_float_cannot_represent_survives_the_round_trip(client, db):
    """0.10 + 0.20 is 0.30000000000000004 in binary floating point.

    Stored as a float, an amount like 10.10 comes back as 10.099999999999999
    on some paths. This asserts it does not.
    """
    response = client.post("/api/v1/payments/charge", json=_charge_payload(amount="10.10"))

    payment_id = response.json()["data"]["id"]
    assert response.json()["data"]["amount"] == "10.10"

    fetched = client.get(f"/api/v1/payments/{payment_id}")
    assert fetched.json()["data"]["amount"] == "10.10"


def test_amount_is_stored_as_an_exact_decimal(client, db):
    from app.models.payment import Payment

    client.post("/api/v1/payments/charge", json=_charge_payload(amount="0.07"))

    payment = db.query(Payment).first()

    assert isinstance(payment.amount, Decimal)
    assert payment.amount == Decimal("0.07")


def test_the_approval_limit_still_applies_with_decimals(client):
    """The rule compares decimals now; the boundary must not have moved."""
    at_limit = client.post("/api/v1/payments/charge", json=_charge_payload(amount="1000.00"))
    assert at_limit.json()["data"]["status"] == "success"

    over_limit = client.post("/api/v1/payments/charge", json=_charge_payload(amount="1000.01"))
    assert over_limit.json()["data"]["status"] == "failed"


def test_more_than_two_decimal_places_is_rejected(client):
    response = client.post("/api/v1/payments/charge", json=_charge_payload(amount="10.999"))

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Response envelope
# ---------------------------------------------------------------------------


def test_a_not_found_error_uses_the_shared_envelope(client):
    response = client.get("/api/v1/payments/999999")
    body = response.json()

    assert response.status_code == 404
    # FastAPI's default {"detail": "..."} would be a second error dialect for
    # exactly the responses clients hit most.
    assert set(body) == {"success", "message", "status_code", "data", "errors"}
    assert body["success"] is False
    assert body["status_code"] == 404
    assert body["data"] is None


def test_a_validation_error_uses_the_shared_envelope_keyed_by_field(client):
    response = client.post("/api/v1/payments/charge", json={"order_id": 1})
    body = response.json()

    assert response.status_code == 422
    assert set(body) == {"success", "message", "status_code", "data", "errors"}
    assert "amount" in body["errors"]
    assert "card_token" in body["errors"]
    assert isinstance(body["errors"]["amount"], list)


def test_a_refund_failure_uses_the_shared_envelope(client):
    declined = client.post(
        "/api/v1/payments/charge", json=_charge_payload(card_token="1111222233334444")
    )
    payment_id = declined.json()["data"]["id"]

    response = client.post(f"/api/v1/payments/{payment_id}/refund", json={"reason": "nope"})
    body = response.json()

    assert response.status_code == 400
    assert body["success"] is False
    assert body["message"] == "Only successful payments can be refunded."


def test_a_string_amount_is_accepted(client):
    """tickets-backend sends money as a decimal string, per the contract.

    Guards the cross-service wire format: if this schema ever stopped accepting
    a string, every charge would 422 and the only symptom would be checkout
    failing in production.
    """
    response = client.post("/api/v1/payments/charge", json=_charge_payload(amount="1234.56"))

    assert response.status_code == 200
    assert response.json()["data"]["amount"] == "1234.56"


def test_a_numeric_amount_is_still_accepted(client):
    """Older callers that send a JSON number keep working."""
    response = client.post("/api/v1/payments/charge", json=_charge_payload(amount=99.99))

    assert response.status_code == 200
    assert response.json()["data"]["amount"] == "99.99"
