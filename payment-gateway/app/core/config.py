"""Application configuration loaded from environment variables."""

import os


class Settings:
    """Central settings holder for the gateway.

    Values fall back to sensible defaults when the corresponding
    environment variable is not defined.
    """

    APP_NAME: str = os.getenv("APP_NAME", "Ticket Payment Gateway")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./payment_gateway.db")
    APP_HOST: str = os.getenv("APP_HOST", "127.0.0.1")
    APP_PORT: int = int(os.getenv("APP_PORT", "8001"))


settings = Settings()
