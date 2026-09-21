"""Environment-variable settings loaded via pydantic-settings."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="TW_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    api_base: str = "https://ocds-api.etenders.gov.za"
    config_path: str = "./config/tender-watch.json"
    cache_ttl_seconds: int = 60
    allowed_origins: str = "http://localhost:5173"
    log_level: str = "INFO"
    # Postgres connection for the nightly n8n-synced tender data. Empty (the
    # default, e.g. local dev without Postgres) keeps the live eTenders
    # fetch as the data source. Set (e.g. in production) to read from the
    # `tenders`/`sync_runs` tables instead — see routes/matches.py.
    database_url: str = ""
    # Claude API key for generating short match headings (services/heading.py).
    # Empty disables the feature — Match.heading stays "".
    anthropic_api_key: str = ""

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
