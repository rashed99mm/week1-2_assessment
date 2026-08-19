"""Shared FastAPI dependencies."""

import hmac

from fastapi import Header, HTTPException, status

from app.core.config import settings


def verify_api_key(x_gateway_key: str | None = Header(default=None)) -> None:
    """Reject callers that do not present the shared gateway key.

    Applied to the payments router only. /health stays open so the container
    healthcheck does not need a credential.

    The comparison uses hmac.compare_digest rather than ``==``. A plain string
    comparison in CPython returns as soon as it finds a differing byte, so the
    time it takes reveals how many leading characters were correct, and a key
    can be recovered a byte at a time. compare_digest takes the same time
    regardless.

    Raises:
        HTTPException: 401 when the key is missing or wrong.
    """
    if not settings.auth_required:
        return

    if x_gateway_key is None or not hmac.compare_digest(x_gateway_key, settings.GATEWAY_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing gateway key.",
        )
