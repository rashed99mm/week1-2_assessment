"""Pydantic schemas used for request validation and response serialization."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ChargeRequest(BaseModel):
    """Request payload for charging an order.

    Attributes:
        order_id: The ticket order id to charge.
        amount: Amount to charge, must be greater than zero.
        currency: Three-letter ISO currency code.
        card_token: Mock card token used by the approval rule.
    """

    order_id: int = Field(..., gt=0, description="The ticket order id to charge")
    amount: float = Field(..., gt=0, description="Amount to charge")
    currency: str = Field("USD", pattern="^[A-Z]{3}$", description="3-letter currency code")
    card_token: str = Field(..., min_length=4, description="Mock card token")


class RefundRequest(BaseModel):
    """Request payload for refunding a payment."""

    reason: str = Field("", max_length=255)


class PaymentOut(BaseModel):
    """Serialized representation of a stored payment returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    amount: float
    currency: str
    status: str
    gateway_reference: Optional[str] = None
    created_at: datetime
    updated_at: datetime
