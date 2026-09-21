"""Pydantic models for the Tender Watch API. Single source of truth for response shapes."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


DEFAULT_KEYWORDS = [
    # Risk Diversion — digital forensic investigation services. Bare
    # "forensic" is a naturally rare/specific word in general government
    # tender text (unlike "development" or "agricultural"), so it's a
    # low-noise root that already covers "digital/computer/mobile
    # forensics", "forensic investigation/analysis", "cyber forensics",
    # "audio/video forensic" and "forensic training" as substrings —
    # only these two don't contain "forensic" and need listing separately.
    "forensic", "cyber intelligence", "data recovery",
    # Farm Logic — agri-tech marketplace / farm management platform.
    # No keyword-only agri-tech terms: every phrase tried (bare
    # "agricultural", then narrower "agri-tech"/"farm management"/etc.)
    # produced either noise (physical goods tenders) or zero matches in the
    # real feed. Agri-side coverage is buyer-only for now — see
    # DEFAULT_BUYER_ALLOWLIST (AgriSETA, Land Bank) — apply_rules matches
    # on keyword OR buyer, so this doesn't need a keyword counterpart.
    #
    # Added 2026-09-18 — user-supplied list, broadening beyond bare
    # "forensic" into the wider risk/investigation/security-services space
    # Risk Diversion also operates in. Not yet empirically validated against
    # the live feed the way "forensic" was — some of these (bare "training",
    # "investigation") are generic enough to risk noise the way "development"
    # and "agricultural" did previously. The Config tab now exposes each as
    # an individually toggleable checkbox specifically so noisy ones can be
    # switched off without editing JSON.
    "risk management", "training", "threat and risk assessment",
    "assessment tools development centre", "risk assessment",
    "software performance testing services", "assessment tools development",
    "biometric security systems", "professional technical training services",
    "biometric access control", "fraud and corruption", "investigation",
    "whistleblowing", "hotline management service", "smoke detector",
    "alarms supply delivery", "screening verification", "reference checks",
    "ai/ml", "software development",
]
DEFAULT_BUYER_ALLOWLIST = [
    # Forensics — law enforcement / prosecuting / investigative bodies.
    # Neither acronym nor full name is confirmed against real eTenders
    # buyer strings (none of these agencies published anything in the
    # sampled window) — both forms are listed as a hedge; verify and prune
    # once a real match surfaces.
    "saps", "south african police service",
    "hawks", "dpci", "directorate for priority crime investigation",
    "npa", "national prosecuting authority",
    "siu", "special investigating unit",
    "ipid", "independent police investigative directorate",
    "department of justice",
    # Agri-tech — deliberately narrow. Generic "agriculture" department
    # buyers were tried and dropped: real provincial buyer names (e.g.
    # "Gauteng - Agriculture and Rural Development") procure mostly
    # physical goods/services, so buyer-matching them broadly reintroduces
    # the same noise the keyword fix just removed. AgriSETA and Land Bank
    # are narrow-mandate agri bodies, safer to match broadly.
    "agriseta", "land bank",
    # Added 2026-09-18 — user-supplied buyer names.
    "council for medical schemes", "indigent subsidy verification agency",
    "cross-border road transport agency", "airports company of south africa",
]


class Config(BaseModel):
    lookback_days: int = Field(default=7, ge=7, le=90)
    page_size: int = Field(default=100, ge=1, le=1000)
    high_value_threshold_zar: float = Field(default=5_000_000, ge=0)
    closing_soon_days: int = Field(default=7, ge=1, le=60)
    include_closed: bool = True
    keywords: list[str] = Field(default_factory=lambda: list(DEFAULT_KEYWORDS))
    buyer_allowlist: list[str] = Field(default_factory=lambda: list(DEFAULT_BUYER_ALLOWLIST))
    # When true, every release is treated as buyer-matched regardless of
    # buyer_allowlist — a persisted "seek all buyers" override (the Config
    # tab's buyer checklist "All" option), independent of the per-session
    # `show_all` query bypass in routes/matches.py.
    match_all_buyers: bool = False
    favourited_ocids: list[str] = Field(default_factory=list)


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
    flags: list[Literal["high-value", "closing-soon", "closed", "briefing-required", "briefing-scheduled", "briefing-missed"]]
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
    # Claude-generated short heading (see services/heading.py). "" when
    # TW_ANTHROPIC_API_KEY isn't set or generation failed.
    heading: str = ""


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
    # Postgres sync freshness (see services/db.py). Null when TW_DATABASE_URL
    # isn't configured (dev fallback — data comes from the live fetch instead).
    last_synced_at: datetime | None = None


class SummaryResponse(BaseModel):
    summary: str


class ConfigResponse(BaseModel):
    config: Config
    config_digest: str


# Forward-reference resolution
MatchesResponse.model_rebuild()
