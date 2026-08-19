"""Application entrypoint for the ticket payment gateway."""

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.deps import verify_api_key
from app.api.routes.payments import router as payments_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Create database tables on startup and clean up on shutdown.

    Fine for SQLite in development. Deployments run Alembic migrations before
    the process starts: create_all only ever adds missing tables, and silently
    ignores a changed column type — which is exactly the shape of the
    Float-to-Numeric change money went through.
    """
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="Mock payment gateway powering the tickets-backend.",
    version="1.0.0",
    lifespan=lifespan,
)

# No CORS middleware, deliberately.
#
# It previously allowed every origin *with* credentials, which browsers reject
# as invalid anyway and which would be a real hole if they did not. Nothing in
# a browser should reach this service: it is called server-to-server by
# tickets-backend over the internal network, its port is not published, and it
# is not routed through nginx.

app.include_router(
    payments_router,
    prefix="/api/v1",
    dependencies=[Depends(verify_api_key)],
)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Render HTTP errors in the shared response envelope.

    Without this, FastAPI returns ``{"detail": "..."}`` and this service speaks
    a different error dialect from the rest of the system for exactly the
    responses a client is most likely to hit. See docs/contracts/api-response.md.
    """
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "message": exc.detail if isinstance(exc.detail, str) else "Request failed.",
            "status_code": exc.status_code,
            "data": None,
            "errors": None,
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Render validation failures in the shared envelope, keyed by field."""
    errors: dict[str, list[str]] = {}

    for error in exc.errors():
        # Drop the leading "body"/"query" segment so the key matches the field
        # name a client actually sent.
        location = [str(part) for part in error["loc"][1:]] or [str(part) for part in error["loc"]]
        errors.setdefault(".".join(location), []).append(error["msg"])

    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "message": "The given data was invalid.",
            "status_code": 422,
            "data": None,
            "errors": errors,
        },
    )


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """Return a simple health check response.

    Intentionally unauthenticated and outside the envelope: the container
    healthcheck runs before any credential is configured, and Docker only cares
    about the status code.
    """
    return {"status": "ok"}
