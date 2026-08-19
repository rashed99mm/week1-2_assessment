"""Application configuration.

Uses pydantic-settings rather than bare os.getenv so that a missing or
malformed value fails at start-up with a clear message, instead of surfacing
later as an authentication that silently never happens.
"""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central settings holder for the gateway."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "Ticket Payment Gateway"
    DATABASE_URL: str = "sqlite:///./payment_gateway.db"
    APP_HOST: str = "127.0.0.1"
    APP_PORT: int = 8001

    # Shared secret the caller must present as X-Gateway-Key.
    #
    # Empty disables the check, which is the default so a bare local checkout
    # and the test suite keep working. Any deployment must set it: this service
    # creates payment records, so reaching it should take more than being on
    # the same network. The Docker Compose file sets it and does not publish
    # the port.
    GATEWAY_API_KEY: str = Field(default="")

    # The mock approval rule. A charge is approved when the amount is at or
    # below this and the card token starts with the test prefix.
    APPROVAL_LIMIT: float = 1000.0
    APPROVED_CARD_PREFIX: str = "4242"

    @property
    def auth_required(self) -> bool:
        """Whether inbound requests must carry a valid gateway key."""
        return bool(self.GATEWAY_API_KEY)


settings = Settings()
