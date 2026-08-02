"""HTTP controllers exposing payment endpoints for the gateway."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.payment import ChargeRequest, PaymentOut, RefundRequest
from app.schemas.response import ApiResponse
from app.services.payment_service import PaymentGatewayError, PaymentService

router = APIRouter(prefix="/payments", tags=["payments"])


def service(db: Session = Depends(get_db)) -> PaymentService:
    """Build a PaymentService bound to the request-scoped database session."""
    return PaymentService(db)


@router.post("/charge", response_model=ApiResponse[PaymentOut])
def charge(payload: ChargeRequest, svc: PaymentService = Depends(service)):
    """Charge an order through the mock gateway.

    Returns:
        An ApiResponse whose data holds the stored payment. Successful
        charges return success=True; declined charges return success=False.
    """
    payment = svc.charge(payload)
    if payment.status == "success":
        return ApiResponse(
            success=True,
            message="Payment approved.",
            status_code=200,
            data=PaymentOut.model_validate(payment),
        )
    return ApiResponse(
        success=False,
        message="Payment declined by the gateway.",
        status_code=400,
        data=PaymentOut.model_validate(payment),
    )


@router.get("/{payment_id}", response_model=ApiResponse[PaymentOut])
def get_payment(payment_id: int, svc: PaymentService = Depends(service)):
    """Retrieve a single payment by id.

    Raises:
        HTTPException: 404 if the payment does not exist.
    """
    payment = svc.get(payment_id)
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment not found.")
    return ApiResponse(
        success=True,
        message="Payment fetched successfully.",
        status_code=200,
        data=PaymentOut.model_validate(payment),
    )


@router.post("/{payment_id}/refund", response_model=ApiResponse[PaymentOut])
def refund(payment_id: int, payload: RefundRequest, svc: PaymentService = Depends(service)):
    """Refund an already-successful payment.

    Raises:
        HTTPException: 400 if the payment is missing or not refundable.
    """
    try:
        payment = svc.refund(payment_id, payload.reason)
    except PaymentGatewayError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ApiResponse(
        success=True,
        message="Payment refunded successfully.",
        status_code=200,
        data=PaymentOut.model_validate(payment),
    )
