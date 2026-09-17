"""Pydantic models for the Tender Watch API. Single source of truth for response shapes."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


DEFAULT_KEYWORDS = [
    "software", "it services", "system integration",
    "consulting", "professional services", "managed services",
    "cloud", "cybersecurity", "data", "development",
    "support and maintenance",
]
DEFAULT_BUYER_ALLOWLIST = ["sita", "national treasury", "sars", "dcdt", "gcis"]


class Config(BaseModel):
    lookback_days: int = Field(default=7, ge=7, le=90)
    page_size: int = Field(default=100, ge=1, le=1000)
    high_value_threshold_zar: float = Field(default=5_000_000, ge=0)
    closing_soon_days: int = Field(default=7, ge=1, le=60)
    include_closed: bool = True
    keywords: list[str] = Field(default_factory=lambda: list(DEFAULT_KEYWORDS))
    buyer_allowlist: list[str] = Field(default_factory=lambda: list(DEFAULT_BUYER_ALLOWLIST))


class TenderDocument(BaseModel):
    title: str
    url: str
    format: str | None = None
    date_published: str | None = None


class ContactPerson(BaseModel):
    name: str = ""
    email: str = ""
    telephone: str = ""


class BriefingSession(BaseModel):
    has_session: bool = False
    compulsory: bool = False
    date: str = ""
    venue: str = ""


class Match(BaseModel):
    ocid: str
    title: str
    buyer: str
    procuring_entity: str
    value_zar: float | None
    value_display: str
    closing_date: str
    days_to_close: int | None
    province: str | None
    category: str | None
    link: str
    flags: list[Literal["high-value", "closing-soon", "closed"]]
    matched_on: dict[str, list[str]]
    # Rich fields added 2026-07-22 — all available in the eTenders OCDS
    # payload but not surfaced in v1.
    description: str = ""
    status: str = ""
    procurement_method: str = ""
    delivery_location: str = ""
    special_conditions: str = ""
    contact_person: ContactPerson | None = None
    briefing_session: BriefingSession | None = None
    documents: list[TenderDocument] = []
    published_date: str = ""
    tender_start_date: str = ""


class Stats(BaseModel):
    releases_scanned: int
    matched: int
    rejected_by_status: int
    rejected_no_keyword_no_buyer: int


class MatchesResponse(BaseModel):
    fetched_at: datetime
    window: dict[str, datetime]
    config_digest: str
    stats: Stats
    matches: list[Match]
    cached_response: "MatchesResponse | None" = None


class HealthResponse(BaseModel):
    ok: bool
    etenders_reachable: bool
    config_path: str
    detail: str | None = None


class ConfigResponse(BaseModel):
    config: Config
    config_digest: str


# Forward-reference resolution
MatchesResponse.model_rebuild()
