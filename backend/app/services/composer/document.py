"""
Canonical EmailDocument normalization (backend mirror).

Mirrors frontend/src/composer/model/document.ts + normalize.ts. Documents are
handled as plain dicts because the block union has 25 members; structure is
validated and repaired here so the compiler can read fields without guards.
Any change here must be applied to the TypeScript model and the golden fixtures.
"""
from __future__ import annotations

import json
import random
import string
from typing import Any, Iterable, Iterator, Optional

DOCUMENT_VERSION = 1

ALIGNS = ("left", "center", "right", "justify")
VALIGNS = ("top", "middle", "bottom")
BORDER_STYLES = ("none", "solid", "dashed", "dotted", "double")
BG_MODES = ("inherit", "transparent", "color", "image")
SECTION_ROLES = ("header", "body", "footer")
DIRECTIONS = ("ltr", "rtl")
LINK_TYPES = ("url", "email", "tel", "unsubscribe", "preferences", "view_in_browser", "merge")

BLOCK_TYPES = (
    "text", "heading", "image", "button", "divider", "spacer", "quote", "list", "table",
    "signature", "rawHtml", "preformatted", "social", "navLinks", "logo", "contactInfo",
    "viewInBrowser", "unsubscribe", "preferenceCenter", "orgFooter", "legal", "videoThumb",
    "mergeField", "reusable", "conditional",
)

RICH_TEXT_BLOCKS = ("text", "heading", "quote", "signature", "orgFooter", "legal")

BLOCK_LABELS = {
    "text": "Text", "heading": "Heading", "image": "Image", "button": "Button",
    "divider": "Divider", "spacer": "Spacer", "quote": "Quote", "list": "List",
    "table": "Table", "signature": "Signature", "rawHtml": "Raw HTML",
    "preformatted": "Preformatted text", "social": "Social links",
    "navLinks": "Navigation links", "logo": "Logo", "contactInfo": "Contact information",
    "viewInBrowser": "View in browser", "unsubscribe": "Unsubscribe link",
    "preferenceCenter": "Preference center", "orgFooter": "Organization footer",
    "legal": "Legal disclaimer", "videoThumb": "Video thumbnail",
    "mergeField": "Merge field", "reusable": "Reusable block",
    "conditional": "Conditional content",
}

_ID_ALPHABET = string.ascii_lowercase + string.digits


def new_id(prefix: str) -> str:
    suffix = "".join(random.choice(_ID_ALPHABET) for _ in range(10))
    return f"{prefix}_{suffix}"


# ── coercion helpers ──────────────────────────────────────────────────────────

def _dict(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def _list(value: Any) -> list:
    return value if isinstance(value, list) else []


def _str(value: Any, fallback: str = "") -> str:
    return value if isinstance(value, str) else fallback


def _opt_str(value: Any) -> Optional[str]:
    return value if isinstance(value, str) and value != "" else None


def _num(value: Any, fallback: float) -> float:
    if isinstance(value, bool):
        return fallback
    if isinstance(value, (int, float)):
        return value
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return parsed


def _int(value: Any, fallback: int) -> int:
    return int(round(_num(value, fallback)))


def _opt_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None


def _opt_num(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _bool(value: Any, fallback: bool = False) -> bool:
    return value if isinstance(value, bool) else fallback


def _pick(value: Any, allowed: Iterable[str], fallback: str) -> str:
    return value if value in allowed else fallback


def _spacing(value: Any, fallback: float = 0) -> dict:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return {"top": value, "right": value, "bottom": value, "left": value}
    data = _dict(value)
    return {
        "top": _num(data.get("top"), fallback),
        "right": _num(data.get("right"), fallback),
        "bottom": _num(data.get("bottom"), fallback),
        "left": _num(data.get("left"), fallback),
    }


def _background(value: Any) -> dict:
    data = _dict(value)
    mode = _pick(data.get("mode"), BG_MODES, "inherit")
    out: dict = {"mode": mode}
    color = _opt_str(data.get("color"))
    if color:
        out["color"] = color
    if mode == "image":
        out["imageUrl"] = _str(data.get("imageUrl"))
        out["imagePosition"] = _str(data.get("imagePosition"), "center center")
        out["imageRepeat"] = _pick(data.get("imageRepeat"), ("no-repeat", "repeat", "repeat-x", "repeat-y"), "no-repeat")
        out["imageSize"] = _pick(data.get("imageSize"), ("auto", "cover", "contain"), "cover")
        fallback = _opt_str(data.get("fallbackColor"))
        if fallback:
            out["fallbackColor"] = fallback
    return out


def _border(value: Any) -> dict:
    data = _dict(value)
    if not data:
        return {"style": "none", "width": _spacing(0), "color": "#e5e7eb", "radius": 0}
    return {
        "style": _pick(data.get("style"), BORDER_STYLES, "none"),
        "width": _spacing(data.get("width"), 0),
        "color": _str(data.get("color"), "#e5e7eb"),
        "radius": _num(data.get("radius"), 0),
    }


def _visibility(value: Any) -> dict:
    data = _dict(value)
    return {"desktop": _bool(data.get("desktop"), True), "mobile": _bool(data.get("mobile"), True)}


def _text_style(value: Any) -> dict:
    data = _dict(value)
    transform = data.get("textTransform")
    align = data.get("align")
    direction = data.get("direction")
    return {
        "fontFamily": _opt_str(data.get("fontFamily")),
        "fontSize": _opt_num(data.get("fontSize")),
        "fontWeight": _opt_int(data.get("fontWeight")),
        "lineHeight": _opt_num(data.get("lineHeight")),
        "letterSpacing": _opt_num(data.get("letterSpacing")),
        "color": _opt_str(data.get("color")),
        "textTransform": _pick(transform, ("none", "uppercase", "lowercase", "capitalize"), "none") if transform else None,
        "align": _pick(align, ALIGNS, "left") if align else None,
        "direction": _pick(direction, DIRECTIONS, "ltr") if direction else None,
    }


def _mobile(value: Any) -> Optional[dict]:
    if not value:
        return None
    data = _dict(value)
    width = data.get("width")
    return {
        "padding": _spacing(data.get("padding")) if data.get("padding") else None,
        "align": _pick(data.get("align"), ALIGNS, "left") if data.get("align") else None,
        "fontSize": _opt_num(data.get("fontSize")),
        "width": "full" if width == "full" else _opt_num(width),
    }


def _link(value: Any) -> dict:
    data = _dict(value)
    return {
        "type": _pick(data.get("type"), LINK_TYPES, "url"),
        "value": _str(data.get("value")),
        "title": _opt_str(data.get("title")),
        "target": _pick(data.get("target"), ("_blank", "_self"), "_blank"),
        "trackingEnabled": _bool(data.get("trackingEnabled"), True),
    }


# ── block normalization ───────────────────────────────────────────────────────

def _block_base(data: dict, block_type: str) -> dict:
    return {
        "id": _str(data.get("id")) or new_id("blk"),
        "type": block_type,
        "name": _opt_str(data.get("name")),
        "locked": _bool(data.get("locked"), False),
        "visibility": _visibility(data.get("visibility")),
        "padding": _spacing(data.get("padding"), 0),
        "background": _background(data.get("background")),
        "border": _border(data.get("border")),
        "mobile": _mobile(data.get("mobile")),
    }


def normalize_block(raw: Any) -> Optional[dict]:
    data = _dict(raw)
    block_type = data.get("type")
    if block_type not in BLOCK_TYPES:
        return None

    block = _block_base(data, block_type)

    if block_type in RICH_TEXT_BLOCKS or block_type in ("list", "table", "preformatted",
                                                        "navLinks", "contactInfo", "mergeField",
                                                        "viewInBrowser", "unsubscribe",
                                                        "preferenceCenter"):
        block["style"] = _text_style(data.get("style"))

    if block_type == "text":
        block["html"] = _str(data.get("html"), "<p></p>")
    elif block_type == "signature":
        block["html"] = _str(data.get("html"), "")
    elif block_type == "heading":
        block["html"] = _str(data.get("html"), "")
        block["level"] = max(1, min(6, _int(data.get("level"), 2)))
    elif block_type == "quote":
        block["html"] = _str(data.get("html"), "")
        block["citation"] = _opt_str(data.get("citation"))
        block["accentColor"] = _opt_str(data.get("accentColor"))
    elif block_type == "orgFooter":
        block["html"] = _str(data.get("html"), "")
        block["useThemeFooter"] = _bool(data.get("useThemeFooter"), True)
    elif block_type == "legal":
        block["html"] = _str(data.get("html"), "")
        block["useThemeLegal"] = _bool(data.get("useThemeLegal"), True)
    elif block_type == "rawHtml":
        block["html"] = _str(data.get("html"), "")
    elif block_type == "preformatted":
        block["text"] = _str(data.get("text"), "")
    elif block_type == "image":
        block.update({
            "src": _str(data.get("src")),
            "alt": _str(data.get("alt")),
            "title": _opt_str(data.get("title")),
            "width": _opt_int(data.get("width")),
            "height": _opt_int(data.get("height")),
            "maxWidth": _opt_int(data.get("maxWidth")),
            "lockAspect": _bool(data.get("lockAspect"), True),
            "naturalWidth": _opt_int(data.get("naturalWidth")),
            "naturalHeight": _opt_int(data.get("naturalHeight")),
            "fit": _pick(data.get("fit"), ("none", "fit", "fill"), "fit"),
            "align": _pick(data.get("align"), ALIGNS, "center"),
            "link": _link(data.get("link")) if data.get("link") else None,
            "assetCode": _opt_str(data.get("assetCode")),
        })
    elif block_type == "button":
        block.update({
            "text": _str(data.get("text"), "Click here"),
            "link": _link(data.get("link")),
            "align": _pick(data.get("align"), ALIGNS, "center"),
            "fullWidth": _bool(data.get("fullWidth"), False),
            "width": _opt_int(data.get("width")),
            "backgroundColor": _opt_str(data.get("backgroundColor")),
            "textColor": _opt_str(data.get("textColor")),
            "style": _text_style(data.get("style")),
            "innerPadding": _spacing(data.get("innerPadding") or {"top": 12, "right": 24, "bottom": 12, "left": 24}, 12),
            "accessibleLabel": _opt_str(data.get("accessibleLabel")),
            "trackingParams": data.get("trackingParams") if isinstance(data.get("trackingParams"), dict) else None,
        })
    elif block_type == "divider":
        block.update({
            "lineStyle": _pick(data.get("lineStyle"), ("solid", "dashed", "dotted", "double"), "solid"),
            "thickness": max(1, _int(data.get("thickness"), 1)),
            "color": _opt_str(data.get("color")),
            "widthPct": max(1, min(100, _int(data.get("widthPct"), 100))),
            "align": _pick(data.get("align"), ALIGNS, "center"),
        })
    elif block_type == "spacer":
        block.update({
            "height": max(0, _int(data.get("height"), 24)),
            "mobileHeight": _opt_int(data.get("mobileHeight")),
        })
    elif block_type == "list":
        items = [_str(item) for item in _list(data.get("items"))]
        block.update({"ordered": _bool(data.get("ordered"), False), "items": items or [""]})
    elif block_type == "table":
        rows = []
        for raw_row in _list(data.get("rows")):
            row_data = _dict(raw_row)
            cells = []
            for raw_cell in _list(row_data.get("cells")):
                cell = _dict(raw_cell)
                cells.append({
                    "id": _str(cell.get("id")) or new_id("tcel"),
                    "html": _str(cell.get("html")),
                    "align": _pick(cell.get("align"), ALIGNS, "left"),
                    "vAlign": _pick(cell.get("vAlign"), VALIGNS, "middle"),
                    "background": _opt_str(cell.get("background")),
                    "colSpan": max(1, _int(cell.get("colSpan"), 1)),
                    "rowSpan": max(1, _int(cell.get("rowSpan"), 1)),
                })
            if cells:
                rows.append({"id": _str(row_data.get("id")) or new_id("trow"), "cells": cells})
        block.update({
            "rows": rows,
            "headerRow": _bool(data.get("headerRow"), True),
            "footerRow": _bool(data.get("footerRow"), False),
            "cellPadding": _spacing(data.get("cellPadding") or {"top": 8, "right": 10, "bottom": 8, "left": 10}, 8),
            "cellBorder": _border(data.get("cellBorder") or {"style": "solid", "width": 1, "color": "#e5e7eb"}),
            "widthPct": max(1, min(100, _int(data.get("widthPct"), 100))),
            "alternateRowColor": _opt_str(data.get("alternateRowColor")),
            "headerBackground": _opt_str(data.get("headerBackground")),
            "mobileStrategy": _pick(data.get("mobileStrategy"), ("scroll", "stack"), "scroll"),
        })
    elif block_type == "social":
        links = []
        for raw_link in _list(data.get("links")):
            link_data = _dict(raw_link)
            links.append({
                "id": _str(link_data.get("id")) or new_id("soc"),
                "network": _str(link_data.get("network"), "link"),
                "url": _str(link_data.get("url")),
                "label": _str(link_data.get("label"), _str(link_data.get("network"), "Link")),
                "iconUrl": _opt_str(link_data.get("iconUrl")),
            })
        block.update({
            "links": links,
            "iconSize": max(12, _int(data.get("iconSize"), 24)),
            "gap": max(0, _int(data.get("gap"), 12)),
            "align": _pick(data.get("align"), ALIGNS, "center"),
            "showLabels": _bool(data.get("showLabels"), False),
        })
    elif block_type == "navLinks":
        items = []
        for raw_item in _list(data.get("items")):
            item = _dict(raw_item)
            items.append({
                "id": _str(item.get("id")) or new_id("nav"),
                "label": _str(item.get("label"), "Link"),
                "link": _link(item.get("link")),
            })
        block.update({
            "items": items,
            "separator": _str(data.get("separator"), "|"),
            "align": _pick(data.get("align"), ALIGNS, "center"),
        })
    elif block_type == "logo":
        block.update({
            "src": _str(data.get("src")),
            "alt": _str(data.get("alt"), "Organization logo"),
            "width": _opt_int(data.get("width")),
            "align": _pick(data.get("align"), ALIGNS, "left"),
            "link": _link(data.get("link")) if data.get("link") else None,
            "useThemeLogo": _bool(data.get("useThemeLogo"), True),
            "themeVariant": _pick(data.get("themeVariant"), ("primary", "secondary", "dark"), "primary"),
        })
    elif block_type == "contactInfo":
        block.update({
            "organizationName": _str(data.get("organizationName")),
            "addressLines": [_str(line) for line in _list(data.get("addressLines"))],
            "phone": _opt_str(data.get("phone")),
            "email": _opt_str(data.get("email")),
            "website": _opt_str(data.get("website")),
            "useThemeAddress": _bool(data.get("useThemeAddress"), True),
            "align": _pick(data.get("align"), ALIGNS, "center"),
        })
    elif block_type in ("viewInBrowser", "unsubscribe", "preferenceCenter"):
        defaults = {
            "viewInBrowser": "View in browser",
            "unsubscribe": "Unsubscribe",
            "preferenceCenter": "Email preferences",
        }
        block.update({
            "label": _str(data.get("label"), defaults[block_type]),
            "align": _pick(data.get("align"), ALIGNS, "center"),
        })
    elif block_type == "videoThumb":
        block.update({
            "thumbnailUrl": _str(data.get("thumbnailUrl")),
            "videoUrl": _str(data.get("videoUrl")),
            "alt": _str(data.get("alt"), "Watch the video"),
            "width": _opt_int(data.get("width")),
            "align": _pick(data.get("align"), ALIGNS, "center"),
            "showPlayBadge": _bool(data.get("showPlayBadge"), True),
        })
    elif block_type == "mergeField":
        block.update({
            "fieldKey": _str(data.get("fieldKey")),
            "fallback": _opt_str(data.get("fallback")),
            "format": _opt_str(data.get("format")),
            "align": _pick(data.get("align"), ALIGNS, "left"),
        })
    elif block_type == "reusable":
        block.update({
            "reusableCode": _str(data.get("reusableCode")),
            "label": _opt_str(data.get("label")),
            "detachable": _bool(data.get("detachable"), True),
        })
    elif block_type == "conditional":
        nested = [normalize_block(item) for item in _list(data.get("blocks"))]
        block.update({
            "label": _str(data.get("label"), "Conditional content"),
            "blocks": [item for item in nested if item],
        })

    return block


def _normalize_column_widths(row: dict) -> None:
    columns = row.get("columns") or []
    count = len(columns)
    if not count:
        return
    total = sum(_num(c.get("widthPct"), 0) for c in columns)
    if total <= 0:
        even = 100 // count
        for index, column in enumerate(columns):
            column["widthPct"] = 100 - even * (count - 1) if index == count - 1 else even
        return
    running = 0
    for index, column in enumerate(columns):
        if index == count - 1:
            column["widthPct"] = max(1, 100 - running)
        else:
            value = max(1, round((_num(column.get("widthPct"), 0) / total) * 100))
            column["widthPct"] = value
            running += value


def normalize_column(raw: Any) -> dict:
    data = _dict(raw)
    blocks = [normalize_block(item) for item in _list(data.get("blocks"))]
    return {
        "id": _str(data.get("id")) or new_id("col"),
        "name": _opt_str(data.get("name")),
        "widthPct": max(1, min(100, _int(data.get("widthPct"), 100))),
        "minWidth": _opt_int(data.get("minWidth")),
        "padding": _spacing(data.get("padding"), 0),
        "background": _background(data.get("background")),
        "border": _border(data.get("border")),
        "vAlign": _pick(data.get("vAlign"), VALIGNS, "top"),
        "mobileOrder": _opt_int(data.get("mobileOrder")),
        "keepSideBySideOnMobile": _bool(data.get("keepSideBySideOnMobile"), False),
        "visibility": _visibility(data.get("visibility")),
        "locked": _bool(data.get("locked"), False),
        "blocks": [block for block in blocks if block],
    }


def normalize_row(raw: Any) -> dict:
    data = _dict(raw)
    columns = [normalize_column(item) for item in _list(data.get("columns"))]
    row = {
        "id": _str(data.get("id")) or new_id("row"),
        "name": _opt_str(data.get("name")),
        "columns": columns or [normalize_column({})],
        "gap": max(0, _int(data.get("gap"), 16)),
        "vAlign": _pick(data.get("vAlign"), VALIGNS, "top"),
        "stackOnMobile": _bool(data.get("stackOnMobile"), True),
        "reverseOnMobile": _bool(data.get("reverseOnMobile"), False),
        "visibility": _visibility(data.get("visibility")),
        "padding": _spacing(data.get("padding"), 0),
        "background": _background(data.get("background")),
        "border": _border(data.get("border")),
        "minHeight": _opt_int(data.get("minHeight")),
        "locked": _bool(data.get("locked"), False),
    }
    _normalize_column_widths(row)
    return row


def normalize_section(raw: Any) -> dict:
    data = _dict(raw)
    rows = [normalize_row(item) for item in _list(data.get("rows"))]
    return {
        "id": _str(data.get("id")) or new_id("sec"),
        "name": _opt_str(data.get("name")),
        "role": _pick(data.get("role"), SECTION_ROLES, "body"),
        "rows": rows or [normalize_row({})],
        "outerBackground": _background(data.get("outerBackground")),
        "background": _background(data.get("background")),
        "padding": _spacing(data.get("padding"), 24),
        "border": _border(data.get("border")),
        "contentWidth": _opt_int(data.get("contentWidth")),
        "align": _pick(data.get("align"), ALIGNS, "left"),
        "vAlign": _pick(data.get("vAlign"), VALIGNS, "top"),
        "minHeight": _opt_int(data.get("minHeight")),
        "visibility": _visibility(data.get("visibility")),
        "locked": _bool(data.get("locked"), False),
    }


def normalize_settings(raw: Any) -> dict:
    data = _dict(raw)
    min_width = max(240, _int(data.get("minWidth"), 320))
    max_width = max(min_width, _int(data.get("maxWidth"), 900))
    content_width = min(max_width, max(min_width, _int(data.get("contentWidth"), 640)))
    return {
        "contentWidth": content_width,
        "minWidth": min_width,
        "maxWidth": max_width,
        "background": _background(data.get("background")) if data.get("background") else {"mode": "color", "color": "#ffffff"},
        "outerBackground": _background(data.get("outerBackground")) if data.get("outerBackground") else {"mode": "color", "color": "#f4f5f7"},
        "lang": _str(data.get("lang"), "en"),
        "direction": _pick(data.get("direction"), DIRECTIONS, "ltr"),
    }


def normalize_document(raw: Any) -> dict:
    data = _dict(raw)
    overrides = data.get("themeOverrides")
    return {
        "version": DOCUMENT_VERSION,
        "settings": normalize_settings(data.get("settings")),
        "themeId": _opt_str(data.get("themeId")),
        "themeOverrides": overrides if isinstance(overrides, dict) else None,
        "sections": [normalize_section(item) for item in _list(data.get("sections"))],
    }


def empty_document() -> dict:
    return normalize_document({"sections": []})


def parse_document(value: Any) -> Optional[dict]:
    """Accept a dict or JSON string; return None when it is not a document."""
    if value is None:
        return None
    if isinstance(value, str):
        if not value.strip():
            return None
        try:
            value = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return None
    if not isinstance(value, dict) or not isinstance(value.get("sections"), list):
        return None
    return normalize_document(value)


# ── traversal ─────────────────────────────────────────────────────────────────

def iter_blocks(document: dict) -> Iterator[tuple[dict, dict, dict, dict]]:
    """Yield (block, section, row, column) for every block, including nested."""
    for section in document.get("sections") or []:
        for row in section.get("rows") or []:
            for column in row.get("columns") or []:
                yield from _iter_block_list(column.get("blocks") or [], section, row, column)


def _iter_block_list(blocks: list, section: dict, row: dict, column: dict):
    for block in blocks:
        yield block, section, row, column
        if block.get("type") == "conditional":
            yield from _iter_block_list(block.get("blocks") or [], section, row, column)


def find_block(document: dict, block_id: str) -> Optional[dict]:
    for block, _s, _r, _c in iter_blocks(document):
        if block.get("id") == block_id:
            return block
    return None


def strip_html(value: str) -> str:
    import re

    text = re.sub(r"<[^>]*>", " ", value or "")
    text = text.replace("&nbsp;", " ")
    return re.sub(r"\s+", " ", text).strip()


def document_is_empty(document: dict) -> bool:
    blocks = [block for block, *_ in iter_blocks(document)]
    if not blocks:
        return True
    for block in blocks:
        block_type = block.get("type")
        if block_type in ("text", "heading", "quote", "signature"):
            if strip_html(block.get("html", "")):
                return False
        elif block_type == "image":
            if block.get("src"):
                return False
        elif block_type == "button":
            if (block.get("text") or "").strip():
                return False
        elif block_type == "list":
            if any(strip_html(item) for item in block.get("items") or []):
                return False
        elif block_type == "table":
            for row in block.get("rows") or []:
                if any(strip_html(cell.get("html", "")) for cell in row.get("cells") or []):
                    return False
        elif block_type == "rawHtml":
            if strip_html(block.get("html", "")):
                return False
        elif block_type == "preformatted":
            if (block.get("text") or "").strip():
                return False
        elif block_type in ("spacer", "divider"):
            continue
        else:
            return False
    return True


def section_label(document: dict, section_id: str) -> str:
    for index, section in enumerate(document.get("sections") or []):
        if section.get("id") == section_id:
            return section.get("name") or f"Section {index + 1}"
    return "Section"


def describe_block(document: dict, block_id: str) -> str:
    for block, section, _row, _column in iter_blocks(document):
        if block.get("id") == block_id:
            label = BLOCK_LABELS.get(block.get("type", ""), "Block")
            return f"{label} in {section_label(document, section.get('id', ''))}"
    return "Block"
