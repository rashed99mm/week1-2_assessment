"""Tests for Pydantic request schema validation."""

import pytest
from pydantic import ValidationError

from app.schemas.payment import ChargeRequest


def test_charge_request_accepts_valid_payload():
    """A well-formed charge request should validate without error."""
    request = ChargeRequest(
        order_id=1,
        amount=100.0,
        currency="USD",
        card_token="4242424242424242",
    )

    assert request.order_id == 1
    assert request.currency == "USD"


def test_charge_request_rejects_non_positive_amount():
    """Amounts of zero or below must be rejected."""
    with pytest.raises(ValidationError):
        ChargeRequest(order_id=1, amount=-5, currency="USD", card_token="4242")


def test_charge_request_rejects_invalid_currency():
    """A currency code that is not three uppercase letters must be rejected."""
    with pytest.raises(ValidationError):
        ChargeRequest(order_id=1, amount=5, currency="usd", card_token="4242")


def test_charge_request_rejects_short_card_token():
    """A card token shorter than four characters must be rejected."""
    with pytest.raises(ValidationError):
        ChargeRequest(order_id=1, amount=5, currency="USD", card_token="42")


def test_charge_request_defaults_currency_to_usd():
    """The currency field should default to USD when omitted."""
    request = ChargeRequest(order_id=1, amount=5, card_token="4242")

    assert request.currency == "USD"
