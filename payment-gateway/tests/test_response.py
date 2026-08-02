"""Tests for the generic Response<T> envelope."""

from datetime import datetime

from app.schemas.payment import PaymentOut
from app.schemas.response import ApiResponse


def _payment_out() -> PaymentOut:
    """Build a sample serialized payment for response tests."""
    return PaymentOut(
        id=1,
        order_id=10,
        amount=100.0,
        currency="USD",
        status="success",
        gateway_reference="TXN-ABC",
        created_at=datetime(2026, 8, 2, 9, 0, 0),
        updated_at=datetime(2026, 8, 2, 9, 0, 0),
    )


def test_success_response_envelope_shape():
    """A success response must carry the standard envelope fields."""
    response = ApiResponse[PaymentOut](
        success=True,
        message="Payment approved.",
        status_code=200,
        data=_payment_out(),
    )

    payload = response.model_dump()

    assert payload["success"] is True
    assert payload["message"] == "Payment approved."
    assert payload["status_code"] == 200
    assert payload["data"]["status"] == "success"
    assert payload["errors"] is None


def test_error_response_envelope_shape():
    """An error response may carry error details and no data."""
    response = ApiResponse(
        success=False,
        message="Payment declined by the gateway.",
        status_code=400,
        errors=[{"code": "DECLINED"}],
    )

    payload = response.model_dump()

    assert payload["success"] is False
    assert payload["data"] is None
    assert payload["errors"] == [{"code": "DECLINED"}]
