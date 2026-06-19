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
    buyer = (tender.get("buyer") or {}).get("name") or ""
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
    link = f"https://etenders.gov.za/release/{release.get('ocid', '')}"
    items = tender.get("items") or []

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
    item_text = " ".join(
        (item.get("classification") or {}).get("description", "") for item in items
    ).lower()
    matched_keywords = [
        kw for kw in config.keywords
        if kw.lower() in title_lower or kw.lower() in item_text
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
