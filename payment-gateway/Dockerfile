# syntax=docker/dockerfile:1

FROM python:3.12-slim AS base

# PYTHONUNBUFFERED so logs reach the container output immediately rather than
# sitting in a buffer until the process exits — which is the difference between
# being able to debug a crash loop and not.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# curl is used by the compose healthcheck.
RUN apt-get update \
    && apt-get install --no-install-recommends -y curl \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first, as their own layer: application code changes on every
# commit, the pinned requirements almost never do.
COPY requirements.txt ./
RUN pip install --requirement requirements.txt

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

# Non-root. This service holds a shared secret and writes payment records;
# there is no reason for it to run with more privilege than reading its own
# code needs.
RUN useradd --create-home --uid 10001 gateway \
    && chown -R gateway:gateway /app
USER gateway

EXPOSE 8001

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
    CMD curl --fail --silent http://127.0.0.1:8001/health || exit 1

# Migrations run as a separate compose step, not here: several replicas
# starting together would race the version table.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
