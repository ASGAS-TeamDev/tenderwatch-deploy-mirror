"""Filter pipeline. Mirrors system spec §4."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.models import Config


@dataclass
class FilterResult:
    keep: bool
    reasons: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)
    matched_on: dict[str, list[str]] = field(default_factory=dict)
    title: str = ""
    buyer: str = ""
    procuring_entity: str = ""
    value_zar: float | None = None
    value_display: str = ""
    closing_date: str = ""
    days_to_close: int | None = None
    province: str | None = None
    category: str | None = None
    link: str = ""
    # Rich fields added 2026-07-22
    description: str = ""
    status: str = ""
    procurement_method: str = ""
    delivery_location: str = ""
    special_conditions: str = ""
    contact_person: dict | None = None
    briefing_session: dict | None = None
    documents: list[dict] = field(default_factory=list)
    published_date: str = ""
    tender_start_date: str = ""


HARD_REJECT_STATUSES = {"cancelled", "unsuccessful", "withdrawn"}


def _format_zar(amount: float | None) -> str:
    if amount is None:
        return "R —"
    # Use South African locale formatting (en-ZA): "R 12,500,000".
    # Implemented inline to avoid pulling in Babel in the backend.
    return f"R {amount:,.0f}"


def _days_to_close(closing_iso: str, now: datetime) -> int | None:
    try:
        end = datetime.fromisoformat(closing_iso.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    delta = end - now
    return int(delta.total_seconds() // 86400)


def apply_rules(release: dict[str, Any], config: Config, *, now: datetime) -> FilterResult:
    tender = release.get("tender") or {}
    status = (tender.get("status") or "").lower()
    title = tender.get("title") or ""
    # Buyer name lives at `release.buyer.name` in OCDS; some releases also
    # nest it at `tender.buyer.name`. Fall back across both.
    release_buyer = release.get("buyer")
    tender_buyer = tender.get("buyer")
    buyer = (
        (release_buyer.get("name") if isinstance(release_buyer, dict) else None)
        or (tender_buyer.get("name") if isinstance(tender_buyer, dict) else None)
        or ""
    )
    procuring_entity = (tender.get("procuringEntity") or {}).get("name") or ""
    value = tender.get("value") or {}
    # Treat amount=0 as "no value published" — eTenders often reports 0
    # when the budget is undisclosed. Showing "R 0" in the UI is misleading.
    raw_amount = value.get("amount")
    amount: float | None = raw_amount if isinstance(raw_amount, (int, float)) and raw_amount > 0 else None
    closing_period = tender.get("tenderPeriod") or {}
    closing_iso = closing_period.get("endDate") or ""
    province = tender.get("province")
    category = tender.get("category")
    # eTenders has no standalone HTML tender detail page — the old
    # /release/<ocid> URL is dead (etenders.gov.za has no DNS A record;
    # /release/<ocid> 404s on www.etenders.gov.za). The portal uses
    # jQuery DataTables inline expansion via AJAX to /Home/tenderDetails
    # (JSON only, not a viewable page). There is no URL that renders a
    # single tender, and the ?filter=&search= params are broken on their
    # site (loadTendersHome is an undefined function — the page loads all
    # tenders unfiltered). Best we can do: link to the opportunities page
    # on the correct status tab so the user lands in the right list and
    # can use QuickFind to search by tender number. Map OCDS status to
    # the eTenders tab id (1=active, 2=awarded, 3=cancelled, 4=closed).
    _status_to_tab = {
        "active": 1, "planning": 1, "planned": 1,
        "awarded": 2, "complete": 2,
        "cancelled": 3, "unsuccessful": 3, "withdrawn": 3,
        "closed": 4,
    }
    _tab = _status_to_tab.get(status, 1)
    link = f"https://www.etenders.gov.za/Home/opportunities?id={_tab}"
    items = tender.get("items") or []

    # --- Rich fields (added 2026-07-22) ------------------------------------
    # All of these come straight from the eTenders OCDS release payload.
    # No additional API calls needed — the data was already fetched.
    description = tender.get("description") or ""
    procurement_method = tender.get("procurementMethodDetails") or ""
    delivery_location = tender.get("deliveryLocation") or ""
    special_conditions = tender.get("specialConditions") or ""
    published_date = (release.get("date") or "")[:10]  # ISO date → YYYY-MM-DD
    tender_start_date = (closing_period.get("startDate") or "")[:10]

    # Contact person — name, email, telephone
    contact_raw = tender.get("contactPerson") or {}
    contact_person = None
    if isinstance(contact_raw, dict) and (contact_raw.get("name") or contact_raw.get("email") or contact_raw.get("telephoneNumber")):
        contact_person = {
            "name": contact_raw.get("name") or "",
            "email": contact_raw.get("email") or "",
            "telephone": contact_raw.get("telephoneNumber") or "",
        }

    # Briefing session — is_session, compulsory, date, venue
    briefing_raw = tender.get("briefingSession") or {}
    briefing_session = None
    if isinstance(briefing_raw, dict) and briefing_raw.get("isSession"):
        briefing_session = {
            "has_session": True,
            "compulsory": bool(briefing_raw.get("compulsory")),
            "date": (briefing_raw.get("date") or "")[:10] if briefing_raw.get("date") and briefing_raw.get("date") != "0001-01-01T00:00:00Z" else "",
            "venue": briefing_raw.get("venue") or "",
        }

    # Documents — title, url, format, date_published (direct download links)
    documents = []
    for doc in (tender.get("documents") or []):
        if isinstance(doc, dict) and doc.get("url"):
            documents.append({
                "title": doc.get("title") or doc.get("description") or "Document",
                "url": doc.get("url") or "",
                "format": doc.get("format") or "",
                "date_published": (doc.get("datePublished") or "")[:10],
            })

    result = FilterResult(
        keep=False,
        title=title,
        buyer=buyer,
        procuring_entity=procuring_entity,
        value_zar=amount,
        value_display=_format_zar(amount),
        closing_date=closing_iso[:10] if closing_iso else "",
        days_to_close=_days_to_close(closing_iso, now),
        province=province,
        category=category,
        link=link,
        description=description,
        status=status,
        procurement_method=procurement_method,
        delivery_location=delivery_location,
        special_conditions=special_conditions,
        contact_person=contact_person,
        briefing_session=briefing_session,
        documents=documents,
        published_date=published_date,
        tender_start_date=tender_start_date,
    )

    # Hard-reject rules
    if status in HARD_REJECT_STATUSES:
        result.reasons.append(f"status:{status}")
        return result
    if not title:
        result.reasons.append("no_title")
        return result

    # Soft-keep rules
    title_lower = title.lower()
    description_lower = (tender.get("description") or "").lower()
    item_text = " ".join(
        (item.get("classification") or {}).get("description", "") for item in items
    ).lower()
    # eTenders' titles are often procurement IDs (e.g. "SCMU3-P26/27-0103-HO")
    # so we also search the description. This is what the user actually reads.
    searchable = " ".join([title_lower, description_lower, item_text])
    matched_keywords = [
        kw for kw in config.keywords
        if kw.lower() in searchable
    ]
    matched_buyers = [
        b for b in config.buyer_allowlist
        if b.lower() in buyer.lower() or b.lower() in procuring_entity.lower()
    ]
    result.matched_on = {"keywords": matched_keywords, "buyers": matched_buyers}

    # Per system spec §4.1: must match EITHER a buyer OR a keyword. No match → drop.
    if not matched_keywords and not matched_buyers:
        result.reasons.append("no_keyword_no_buyer")
        return result

    result.keep = True

    # Flag rules
    if amount is not None and amount >= config.high_value_threshold_zar:
        result.flags.append("high-value")
    if closing_iso:
        end = datetime.fromisoformat(closing_iso.replace("Z", "+00:00"))
        if end < now:
            if config.include_closed:
                result.flags.append("closed")
            else:
                result.keep = False
                result.reasons.append("closed_excluded")
        elif (end - now).days <= config.closing_soon_days:
            result.flags.append("closing-soon")
    return result
