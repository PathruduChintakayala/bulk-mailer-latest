"""Theme tokens (backend mirror of frontend/src/composer/model/theme.ts)."""
from __future__ import annotations

from typing import Any, Optional

DEFAULT_HEADING_SIZES = {"h1": 32, "h2": 26, "h3": 22, "h4": 19, "h5": 17, "h6": 15}

DEFAULT_THEME_TOKENS: dict[str, Any] = {
    "pageBackground": "#f4f5f7",
    "contentBackground": "#ffffff",
    "primaryColor": "#4f46e5",
    "secondaryColor": "#6366f1",
    "headingColor": "#111827",
    "bodyTextColor": "#374151",
    "mutedTextColor": "#6b7280",
    "linkColor": "#4f46e5",
    "buttonBackground": "#4f46e5",
    "buttonTextColor": "#ffffff",
    "dividerColor": "#e5e7eb",
    "bodyFont": "Arial, Helvetica, sans-serif",
    "headingFont": "Arial, Helvetica, sans-serif",
    "bodyFontSize": 16,
    "headingSizes": dict(DEFAULT_HEADING_SIZES),
    "lineHeight": 1.5,
    "contentWidth": 640,
    "sectionPaddingY": 24,
    "sectionPaddingX": 24,
    "buttonRadius": 6,
    "borderStyle": "solid",
    "brand": {},
}

BUILTIN_THEMES: list[dict[str, Any]] = [
    {
        "code": "THM-BASE",
        "name": "Default",
        "description": "Neutral, high-contrast starting point.",
        "tokens": dict(DEFAULT_THEME_TOKENS),
    },
    {
        "code": "THM-YSRCP",
        "name": "YSRCP",
        "description": "Brand colours from the logo: blue, green and orange on white.",
        "tokens": {
            **DEFAULT_THEME_TOKENS,
            "pageBackground": "#eef5fc",
            "contentBackground": "#ffffff",
            "primaryColor": "#034ea2",
            "secondaryColor": "#008c45",
            "headingColor": "#032b3c",
            "bodyTextColor": "#23323b",
            "mutedTextColor": "#5b6b75",
            "linkColor": "#034ea2",
            "buttonBackground": "#008c45",
            "buttonTextColor": "#ffffff",
            "dividerColor": "#f87c1c",
        },
    },
    {
        "code": "THM-CLASSIC",
        "name": "Classic serif",
        "description": "Serif headings on a warm paper background.",
        "tokens": {
            **DEFAULT_THEME_TOKENS,
            "pageBackground": "#f5f1ea",
            "contentBackground": "#fffdf9",
            "primaryColor": "#8a5a2b",
            "secondaryColor": "#a97142",
            "headingColor": "#3b2a1a",
            "bodyTextColor": "#40372c",
            "mutedTextColor": "#7a6a58",
            "linkColor": "#8a5a2b",
            "buttonBackground": "#8a5a2b",
            "dividerColor": "#e4dacb",
            "headingFont": "Georgia, 'Times New Roman', serif",
            "buttonRadius": 2,
        },
    },
    {
        "code": "THM-CONTRAST",
        "name": "High contrast",
        "description": "Maximum legibility for accessibility-first sends.",
        "tokens": {
            **DEFAULT_THEME_TOKENS,
            "pageBackground": "#ffffff",
            "primaryColor": "#0b3d91",
            "secondaryColor": "#12509c",
            "headingColor": "#000000",
            "bodyTextColor": "#1a1a1a",
            "mutedTextColor": "#4a4a4a",
            "linkColor": "#0b3d91",
            "buttonBackground": "#0b3d91",
            "dividerColor": "#c9c9c9",
            "bodyFontSize": 17,
            "lineHeight": 1.6,
            "buttonRadius": 4,
        },
    },
    {
        "code": "THM-COMPACT",
        "name": "Compact transactional",
        "description": "Tight spacing for receipts and notifications.",
        "tokens": {
            **DEFAULT_THEME_TOKENS,
            "pageBackground": "#eceff3",
            "primaryColor": "#1f6feb",
            "secondaryColor": "#3b82f6",
            "headingColor": "#0f172a",
            "bodyTextColor": "#33415c",
            "linkColor": "#1f6feb",
            "buttonBackground": "#1f6feb",
            "bodyFontSize": 15,
            "sectionPaddingY": 16,
            "sectionPaddingX": 20,
            "contentWidth": 600,
            "headingSizes": {"h1": 26, "h2": 22, "h3": 19, "h4": 17, "h5": 15, "h6": 14},
        },
    },
]


def resolve_tokens(base: Optional[dict], overrides: Optional[dict] = None) -> dict:
    tokens = dict(DEFAULT_THEME_TOKENS)
    if base:
        tokens.update({k: v for k, v in base.items() if v is not None})
    tokens["headingSizes"] = {
        **DEFAULT_HEADING_SIZES,
        **((base or {}).get("headingSizes") or {}),
    }
    tokens["brand"] = dict((base or {}).get("brand") or {})
    if overrides:
        for key, value in overrides.items():
            if value is None:
                continue
            if key == "headingSizes" and isinstance(value, dict):
                tokens["headingSizes"] = {**tokens["headingSizes"], **value}
            elif key == "brand" and isinstance(value, dict):
                tokens["brand"] = {**tokens["brand"], **value}
            else:
                tokens[key] = value
    return tokens


def heading_size(tokens: dict, level: int) -> int:
    key = f"h{max(1, min(6, int(level)))}"
    sizes = tokens.get("headingSizes") or DEFAULT_HEADING_SIZES
    return int(sizes.get(key, DEFAULT_HEADING_SIZES[key]))


def builtin_theme(code: str) -> Optional[dict]:
    for theme in BUILTIN_THEMES:
        if theme["code"] == code:
            return theme
    return None
