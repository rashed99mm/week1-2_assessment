"""Generic response envelope used by every gateway endpoint."""

from typing import Generic, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    """Generic Response<T> envelope used by every gateway endpoint.

    Attributes:
        success: Whether the operation succeeded.
        message: Human readable result message.
        status_code: HTTP-like status carried in the body.
        data: The typed payload of the response.
        errors: Optional list of error details.
    """

    success: bool
    message: str
    status_code: int
    data: Optional[T] = None
    errors: Optional[list] = None
