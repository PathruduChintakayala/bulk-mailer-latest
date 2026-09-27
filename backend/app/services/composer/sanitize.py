"""
HTML sanitization for the composer.

Backend sanitization is authoritative (spec 26.2). The browser performs a fast
pass for feedback, but nothing is saved, previewed, test-sent, published or sent
without passing through here.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Iterable, Optional

logger = logging.getLogger(__name__)

try:  # pragma: no cover - import guard
    import bleach

    _HAS_BLEACH = True
except ImportError:  # pragma: no cover - degraded mode
    bleach = None  # type: ignore[assignment]
    _HAS_BLEACH = False
    logger.warning("bleach is not installed; composer HTML sanitization runs in degraded regex mode")


DEFAULT_ALLOWED_TAGS: tuple[str, ...] = (
    "html", "head", "body", "meta", "title", "style",
    "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
    "div", "span", "p", "br", "hr", "a", "img", "center",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "b", "em", "i", "u", "s", "strike", "sub", "sup", "small", "big",
    "ul", "ol", "li", "dl", "dt", "dd",
    "blockquote", "pre", "code", "figure", "figcaption", "font", "abbr", "cite", "time",
)

DEFAULT_ALLOWED_ATTRIBUTES: dict[str, tuple[str, ...]] = {
    "*": ("style", "class", "id", "align", "valign", "dir", "lang", "title", "role", "aria-label", "aria-hidden"),
    "a": ("href", "target", "rel", "name"),
    "img": ("src", "alt", "width", "height", "border", "srcset", "loading"),
    "table": ("width", "height", "cellpadding", "cellspacing", "border", "bgcolor", "background"),
    "td": ("width", "height", "colspan", "rowspan", "bgcolor", "background", "nowrap"),
    "th": ("width", "height", "colspan", "rowspan", "bgcolor", "background", "scope"),
    "tr": ("height", "bgcolor"),
    "body": ("bgcolor", "topmargin", "leftmargin", "marginwidth", "marginheight", "offset"),
    "meta": ("charset", "name", "content", "http-equiv"),
    "font": ("color", "face", "size"),
    "html": ("xmlns", "xmlns:v", "xmlns:o"),
}

DEFAULT_ALLOWED_CSS: tuple[str, ...] = (
    "background", "background-color", "background-image", "background-position",
    "background-repeat", "background-size",
    "border", "border-bottom", "border-bottom-color", "border-bottom-style",
    "border-bottom-width", "border-collapse", "border-color", "border-left",
    "border-left-color", "border-left-style", "border-left-width", "border-radius",
    "border-right", "border-right-color", "border-right-style", "border-right-width",
    "border-spacing", "border-style", "border-top", "border-top-color",
    "border-top-style", "border-top-width", "border-width",
    "color", "direction", "display", "float", "font", "font-family", "font-size",
    "font-style", "font-variant", "font-weight", "height", "letter-spacing",
    "line-height", "list-style", "list-style-type", "margin", "margin-bottom",
    "margin-left", "margin-right", "margin-top", "max-height", "max-width",
    "min-height", "min-width", "mso-hide", "mso-line-height-rule",
    "mso-table-lspace", "mso-table-rspace", "mso-padding-alt", "opacity",
    "overflow", "padding", "padding-bottom", "padding-left", "padding-right",
    "padding-top", "table-layout", "text-align", "text-decoration",
    "text-transform", "vertical-align", "white-space", "width", "word-break",
    "word-wrap", "-ms-text-size-adjust", "-webkit-text-size-adjust",
)

# Inline-only allowlist for rich-text block content.
INLINE_ALLOWED_TAGS: tuple[str, ...] = (
    "p", "br", "span", "strong", "b", "em", "i", "u", "s", "strike", "sub", "sup",
    "a", "code", "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6",
    "small", "abbr", "cite",
)

INLINE_ALLOWED_ATTRIBUTES: dict[str, tuple[str, ...]] = {
    "*": ("style", "class", "dir", "title"),
    "a": ("href", "target", "rel"),
    "span": ("data-merge-field", "data-merge-default", "data-merge-format"),
}

UNSAFE_URL_SCHEMES = ("javascript:", "vbscript:", "data:text/html", "file:", "about:")

_DANGEROUS_TAG_RE = re.compile(
    r"<\s*(script|iframe|object|embed|form|input|button|select|textarea|applet|base|link|frame|frameset|noscript|svg|math)\b",
    re.IGNORECASE,
)
_EVENT_ATTR_RE = re.compile(r"\son[a-z]+\s*=", re.IGNORECASE)
_STYLE_ATTR_RE = re.compile(r'style\s*=\s*"([^"]*)"', re.IGNORECASE)
_STYLE_ATTR_SQ_RE = re.compile(r"style\s*=\s*'([^']*)'", re.IGNORECASE)
_CSS_IMPORT_RE = re.compile(r"@import", re.IGNORECASE)
_CSS_EXPRESSION_RE = re.compile(r"expression\s*\(", re.IGNORECASE)
_URL_IN_CSS_RE = re.compile(r"url\s*\(\s*['\"]?\s*(javascript|vbscript|data:text/html)", re.IGNORECASE)


@dataclass
class SanitizeResult:
    html: str
    removed: list[str] = field(default_factory=list)

    @property
    def changed(self) -> bool:
        return bool(self.removed)


def is_safe_url(value: str, *, allow_data_images: bool = True) -> bool:
    if value is None:
        return False
    candidate = value.strip().replace("\x00", "")
    if not candidate:
        return False
    collapsed = re.sub(r"\s+", "", candidate).lower()
    for scheme in UNSAFE_URL_SCHEMES:
        if collapsed.startswith(scheme):
            return False
    if collapsed.startswith("data:"):
        if not allow_data_images:
            return False
        return collapsed.startswith("data:image/")
    return True


def filter_declarations(style_value: str, allowed: Iterable[str]) -> tuple[str, list[str]]:
    """Keep only allowed CSS properties with safe values."""
    allowed_set = {prop.lower() for prop in allowed}
    kept: list[str] = []
    removed: list[str] = []
    for declaration in style_value.split(";"):
        if ":" not in declaration:
            continue
        prop, _, raw_value = declaration.partition(":")
        name = prop.strip().lower()
        value = raw_value.strip()
        if not name or not value:
            continue
        if name not in allowed_set:
            removed.append(f"CSS property '{name}'")
            continue
        if _CSS_EXPRESSION_RE.search(value) or _URL_IN_CSS_RE.search(value):
            removed.append(f"unsafe CSS value in '{name}'")
            continue
        kept.append(f"{name}:{value}")
    return "; ".join(kept), removed


def _filter_style_attributes(html: str, allowed_css: Iterable[str]) -> tuple[str, list[str]]:
    removed: list[str] = []

    def replace(match: re.Match[str], quote: str) -> str:
        cleaned, dropped = filter_declarations(match.group(1), allowed_css)
        removed.extend(dropped)
        if not cleaned:
            return ""
        return f'style={quote}{cleaned}{quote}'

    html = _STYLE_ATTR_RE.sub(lambda m: replace(m, '"'), html)
    html = _STYLE_ATTR_SQ_RE.sub(lambda m: replace(m, "'"), html)
    return html, removed


def _scan_dangerous(html: str) -> list[str]:
    findings: list[str] = []
    for match in _DANGEROUS_TAG_RE.finditer(html or ""):
        findings.append(f"<{match.group(1).lower()}> element")
    if _EVENT_ATTR_RE.search(html or ""):
        findings.append("inline event handler attribute")
    if _CSS_IMPORT_RE.search(html or ""):
        findings.append("@import rule")
    if _CSS_EXPRESSION_RE.search(html or ""):
        findings.append("CSS expression()")
    for match in re.finditer(r'(?:href|src|background)\s*=\s*["\']?([^"\'\s>]+)', html or "", re.IGNORECASE):
        if not is_safe_url(match.group(1)):
            findings.append(f"unsafe URL '{match.group(1)[:60]}'")
    # De-duplicate while preserving order.
    seen: set[str] = set()
    unique: list[str] = []
    for item in findings:
        if item not in seen:
            seen.add(item)
            unique.append(item)
    return unique


def _regex_fallback_clean(html: str, allowed_tags: Iterable[str]) -> str:
    """Conservative cleaner used only when bleach is unavailable."""
    allowed = {tag.lower() for tag in allowed_tags}
    cleaned = re.sub(
        r"<\s*(script|style|iframe|object|embed|form|applet|link|base|frame|frameset|noscript|svg|math)\b[^>]*>.*?<\s*/\s*\1\s*>",
        "",
        html or "",
        flags=re.IGNORECASE | re.DOTALL,
    )
    cleaned = _DANGEROUS_TAG_RE.sub("<removed", cleaned)
    cleaned = _EVENT_ATTR_RE.sub(" data-removed=", cleaned)

    def drop_disallowed(match: re.Match[str]) -> str:
        tag = match.group(2).lower()
        return match.group(0) if tag in allowed else ""

    return re.sub(r"<\s*(/?)\s*([a-zA-Z0-9:-]+)", drop_disallowed, cleaned)


def sanitize_html(
    html: str,
    *,
    allowed_tags: Optional[Iterable[str]] = None,
    allowed_attributes: Optional[dict[str, Iterable[str]]] = None,
    allowed_css: Optional[Iterable[str]] = None,
    strip_comments: bool = False,
) -> SanitizeResult:
    """Sanitize author HTML, reporting what was removed."""
    source = html or ""
    tags = tuple(allowed_tags or DEFAULT_ALLOWED_TAGS)
    attributes = {k: tuple(v) for k, v in (allowed_attributes or DEFAULT_ALLOWED_ATTRIBUTES).items()}
    css = tuple(allowed_css or DEFAULT_ALLOWED_CSS)

    removed = _scan_dangerous(source)

    if _HAS_BLEACH:
        cleaned = bleach.clean(
            source,
            tags=set(tags),
            attributes={k: list(v) for k, v in attributes.items()},
            protocols=["http", "https", "mailto", "tel", "cid", "data"],
            strip=True,
            strip_comments=strip_comments,
        )
    else:
        cleaned = _regex_fallback_clean(source, tags)

    cleaned, style_removed = _filter_style_attributes(cleaned, css)
    removed.extend(style_removed)

    # Strip any remaining unsafe URLs that survived attribute cleaning.
    def scrub_url(match: re.Match[str]) -> str:
        attr, quote, value = match.group(1), match.group(2), match.group(3)
        if is_safe_url(value):
            return match.group(0)
        removed.append(f"unsafe URL in {attr.lower()}")
        return f'{attr}={quote}{quote}'

    cleaned = re.sub(r'(href|src|background)=(["\'])(.*?)\2', scrub_url, cleaned, flags=re.IGNORECASE | re.DOTALL)

    seen: set[str] = set()
    unique_removed = [item for item in removed if not (item in seen or seen.add(item))]
    return SanitizeResult(html=cleaned, removed=unique_removed)


def sanitize_inline_html(html: str, *, allowed_css: Optional[Iterable[str]] = None) -> SanitizeResult:
    """Sanitize rich-text block content (no document-level or table tags)."""
    return sanitize_html(
        html,
        allowed_tags=INLINE_ALLOWED_TAGS,
        allowed_attributes=INLINE_ALLOWED_ATTRIBUTES,
        allowed_css=allowed_css,
        strip_comments=True,
    )


def sanitize_raw_block(html: str, *, allowed_tags: Optional[Iterable[str]] = None) -> SanitizeResult:
    """Sanitize a Raw HTML block: same allowlist as documents minus document tags."""
    tags = tuple(t for t in (allowed_tags or DEFAULT_ALLOWED_TAGS) if t not in ("html", "head", "body", "meta", "title", "style"))
    return sanitize_html(html, allowed_tags=tags)


def sanitizer_available() -> bool:
    return _HAS_BLEACH
