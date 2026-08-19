"""Business logic for the mock payment gateway."""

import uuid
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.payment import Payment
from app.schemas.payment import ChargeRequest


class PaymentGatewayError(Exception):
    """Raised for invalid gateway operations (e.g. refunding a failed payment)."""


class PaymentService:
    """Mock payment gateway business logic.

    Approval rule (Stripe-like test behaviour):
    - approved when amount <= the configured limit AND card_token starts with
      the configured prefix
    - declined otherwise
    """

    @property
    def max_approved_amount(self) -> Decimal:
        """The largest amount this mock will approve."""
        return Decimal(str(settings.APPROVAL_LIMIT))

    @property
    def approved_card_prefix(self) -> str:
        """The card-token prefix this mock treats as a good card."""
        return settings.APPROVED_CARD_PREFIX

    def __init__(self, db: Session) -> None:
        """Initialize the service with a database session."""
        self.db = db

    def _generate_reference(self) -> str:
        """Generate a unique gateway reference for a payment."""
        return f"TXN-{uuid.uuid4().hex[:16].upper()}"

    def charge(self, payload: ChargeRequest) -> Payment:
        """Process a charge, persist it and return the resulting payment.

        Args:
            payload: The validated charge request.

        Returns:
            The stored payment with status success or failed.
        """
        approved = payload.amount <= self.max_approved_amount and payload.card_token.startswith(
            self.approved_card_prefix
        )

        payment = Payment(
            order_id=payload.order_id,
            amount=payload.amount,
            currency=payload.currency,
            status="success" if approved else "failed",
            gateway_reference=self._generate_reference(),
        )
        self.db.add(payment)
        self.db.commit()
        self.db.refresh(payment)

        return payment

    def get(self, payment_id: int) -> Optional[Payment]:
        """Fetch a payment by id, returning None if it does not exist."""
        return self.db.get(Payment, payment_id)

    def refund(self, payment_id: int, reason: str = "") -> Payment:
        """Refund an already-successful payment.

        Args:
            payment_id: The id of the payment to refund.
            reason: Optional refund reason.

        Returns:
            The payment with its status updated to refunded.

        Raises:
            PaymentGatewayError: If the payment does not exist or was not successful.
        """
        payment = self.db.get(Payment, payment_id)
        if payment is None:
            raise PaymentGatewayError("Payment not found.")

        if payment.status != "success":
            raise PaymentGatewayError("Only successful payments can be refunded.")

        payment.status = "refunded"
        self.db.commit()
        self.db.refresh(payment)

        return payment
