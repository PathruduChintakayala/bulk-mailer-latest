"""Generate unique Option-B public codes: PREFIX-##### (10000–99999)."""
from __future__ import annotations

import random
from typing import Callable, Awaitable, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

PREFIXES = {
    "campaign": "CMP",
    "template": "TPL",
    "user": "USR",
    "sender": "SND",
    "recipient": "RCP",
    "asset": "AST",
    "suppression": "SUP",
    "revision": "REV",
    "theme": "THM",
    "reusable": "RUB",
    "snapshot": "SNP",
}


def format_public_code(prefix: str, number: int) -> str:
    return f"{prefix}-{number:05d}"


def random_public_code(prefix: str) -> str:
    return format_public_code(prefix, random.randint(10000, 99999))


async def generate_unique_public_code(
    db: AsyncSession,
    model,
    prefix: str,
    *,
    max_attempts: int = 40,
) -> str:
    """Generate a unique public_code for the given SQLAlchemy model."""
    for _ in range(max_attempts):
        code = random_public_code(prefix)
        result = await db.execute(select(model.id).where(model.public_code == code).limit(1))
        if result.scalar_one_or_none() is None:
            return code
    # Exhausted 5-digit space collisions — extend to 6 digits
    for n in range(100000, 1000000):
        code = f"{prefix}-{n}"
        result = await db.execute(select(model.id).where(model.public_code == code).limit(1))
        if result.scalar_one_or_none() is None:
            return code
    raise RuntimeError(f"Unable to allocate public_code for prefix {prefix}")


def parse_public_code(value: str) -> Optional[tuple[str, str]]:
    """Return (prefix, full_code) if value looks like PREFIX-#####."""
    if not value or "-" not in value:
        return None
    prefix, _, rest = value.partition("-")
    if not prefix or not rest.isdigit():
        return None
    return prefix.upper(), f"{prefix.upper()}-{rest}"
