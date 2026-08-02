"""Tests for the PaymentService mock gateway business logic."""

import pytest

from app.schemas.payment import ChargeRequest
from app.services.payment_service import PaymentGatewayError, PaymentService


def _charge(db, amount=100.0, card_token="4242424242424242", order_id=1) -> "PaymentService":
    """Build a service and run one charge for convenience."""
    service = PaymentService(db)
    service.charge(ChargeRequest(order_id=order_id, amount=amount, card_token=card_token))
    return service


def test_charge_approves_eligible_card(db):
    """An amount within limits with an eligible card token must be approved."""
    service = PaymentService(db)
    payment = service.charge(
        ChargeRequest(order_id=1, amount=100.0, currency="USD", card_token="4242424242424242")
    )

    assert payment.status == "success"
    assert payment.gateway_reference.startswith("TXN-")


def test_charge_declines_ineligible_card(db):
    """A card token that does not start with 4242 must be declined."""
    service = PaymentService(db)
    payment = service.charge(
        ChargeRequest(order_id=1, amount=100.0, currency="USD", card_token="4000000000000002")
    )

    assert payment.status == "failed"


def test_charge_declines_amount_over_limit(db):
    """An amount above the approval limit must be declined even with a valid card."""
    service = PaymentService(db)
    payment = service.charge(
        ChargeRequest(order_id=1, amount=2000.0, currency="USD", card_token="4242424242424242")
    )

    assert payment.status == "failed"


def test_get_returns_none_for_missing_payment(db):
    """Looking up an unknown payment id must return None."""
    service = PaymentService(db)

    assert service.get(999) is None


def test_get_returns_stored_payment(db):
    """A charged payment must be retrievable by id."""
    service = PaymentService(db)
    created = service.charge(
        ChargeRequest(order_id=1, amount=50.0, currency="USD", card_token="4242424242424242")
    )

    fetched = service.get(created.id)

    assert fetched is not None
    assert fetched.id == created.id
    assert fetched.status == "success"


def test_refund_successful_payment(db):
    """A successful payment must be refundable."""
    service = PaymentService(db)
    created = service.charge(
        ChargeRequest(order_id=1, amount=50.0, currency="USD", card_token="4242424242424242")
    )

    refunded = service.refund(created.id, "customer changed mind")

    assert refunded.status == "refunded"


def test_refund_failed_payment_raises(db):
    """Refunding a failed payment must raise PaymentGatewayError."""
    service = PaymentService(db)
    created = service.charge(
        ChargeRequest(order_id=1, amount=50.0, currency="USD", card_token="4000000000000002")
    )

    with pytest.raises(PaymentGatewayError):
        service.refund(created.id)


def test_refund_missing_payment_raises(db):
    """Refunding an unknown payment must raise PaymentGatewayError."""
    service = PaymentService(db)

    with pytest.raises(PaymentGatewayError):
        service.refund(999)
