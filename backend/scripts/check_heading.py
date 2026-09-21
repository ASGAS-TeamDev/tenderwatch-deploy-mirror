"""One-shot validation of the Claude heading feature with the configured key."""
import asyncio

from app.services.heading import get_heading
from app.settings import settings


async def main() -> None:
    if not settings.anthropic_api_key:
        raise SystemExit("TW_ANTHROPIC_API_KEY not set — cannot test.")
    heading = await get_heading(
        "ocds-9t57fa-test",
        "RFQ 2026/008: Provision of digital forensic investigation services",
        "The department requires accredited digital forensic investigators "
        "to perform mobile phone extraction and analysis.",
    )
    print("HEADING:", repr(heading))


asyncio.run(main())
