"""CSS inlining for email clients (premailer), with a safe no-op fallback."""
from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

try:  # pragma: no cover - import guard
    from premailer import transform as _premailer_transform

    _HAS_PREMAILER = True
except Exception:  # pragma: no cover - premailer pulls lxml/cssutils
    _premailer_transform = None  # type: ignore[assignment]
    _HAS_PREMAILER = False
    logger.warning("premailer is unavailable; composer output will keep <style> rules un-inlined")


@dataclass
class InlineResult:
    html: str
    inlined: bool
    warning: str | None = None


def inline_css(html: str, *, keep_style_tags: bool = True) -> InlineResult:
    """
    Inline embedded CSS onto elements.

    `keep_style_tags` is on by default because the compiler's media query must
    survive inlining to keep responsive stacking and visibility working.
    """
    source = html or ""
    if not _HAS_PREMAILER:
        return InlineResult(html=source, inlined=False, warning="CSS inlining is unavailable on this server.")
    try:
        result = _premailer_transform(
            source,
            keep_style_tags=keep_style_tags,
            strip_important=False,
            remove_classes=False,
            disable_validation=True,
            # Without this premailer rewrites CSS into legacy presentational
            # attributes, producing invalid values such as height="100% !important".
            disable_basic_attributes=["height", "width", "bgcolor", "align", "valign"],
            cssutils_logging_level=logging.CRITICAL,
        )
        return InlineResult(html=result, inlined=True)
    except Exception as exc:  # pragma: no cover - malformed source
        logger.info("CSS inlining failed, returning source unchanged: %s", exc)
        return InlineResult(html=source, inlined=False, warning=f"CSS inlining failed: {exc}")


def inliner_available() -> bool:
    return _HAS_PREMAILER
