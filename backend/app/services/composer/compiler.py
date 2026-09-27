"""
EmailDocument -> email-safe HTML compiler.

This is the single authoritative renderer: the preview iframe, test sends and
campaign sends all use its output, so what the author sees is what is delivered.
Output uses nested tables with inline styles, a single media query for stacking
and visibility, and no absolute positioning.
"""
from __future__ import annotations

import html as html_module
import re
from dataclasses import dataclass, field
from typing import Any, Optional

from app.services.composer import document as doc_model
from app.services.composer.sanitize import (
    is_safe_url,
    sanitize_inline_html,
    sanitize_raw_block,
)
from app.services.composer.theme import heading_size, resolve_tokens

MOBILE_BREAKPOINT = 600

SYSTEM_LINK_TOKENS = {
    "unsubscribe": "{{unsubscribe_url}}",
    "preferences": "{{preferences_url}}",
    "view_in_browser": "{{view_in_browser_url}}",
}


@dataclass
class CompileResult:
    html: str
    warnings: list[str] = field(default_factory=list)
    """Node ids that could not be rendered (unresolved reusable blocks, etc.)."""
    unresolved: list[str] = field(default_factory=list)
    auto_appended: list[str] = field(default_factory=list)


def esc(value: Any) -> str:
    return html_module.escape(str(value if value is not None else ""), quote=True)


def _px(value: Any) -> str:
    number = doc_model._num(value, 0)
    if number == int(number):
        return f"{int(number)}px"
    return f"{number:g}px"


def _style(pairs: dict[str, Any]) -> str:
    parts = [f"{key}:{value}" for key, value in pairs.items() if value not in (None, "")]
    return ";".join(parts)


def _attr(name: str, value: Any) -> str:
    if value in (None, ""):
        return ""
    return f' {name}="{esc(value)}"'


def _spacing_css(spacing: dict) -> str:
    return " ".join(
        _px(spacing.get(side, 0)) for side in ("top", "right", "bottom", "left")
    )


def _has_spacing(spacing: dict) -> bool:
    return any(doc_model._num(spacing.get(side), 0) for side in ("top", "right", "bottom", "left"))


def _background_css(background: dict, *, inherit_color: Optional[str] = None) -> dict[str, Any]:
    mode = (background or {}).get("mode", "inherit")
    out: dict[str, Any] = {}
    if mode == "inherit":
        if inherit_color:
            out["background-color"] = inherit_color
        return out
    if mode == "transparent":
        out["background-color"] = "transparent"
        return out
    if mode == "color":
        color = background.get("color") or inherit_color
        if color:
            out["background-color"] = color
        return out
    if mode == "image":
        fallback = background.get("fallbackColor") or background.get("color") or inherit_color
        if fallback:
            out["background-color"] = fallback
        url = background.get("imageUrl")
        if url and is_safe_url(url):
            out["background-image"] = f"url('{url}')"
            out["background-position"] = background.get("imagePosition") or "center center"
            out["background-repeat"] = background.get("imageRepeat") or "no-repeat"
            out["background-size"] = background.get("imageSize") or "cover"
    return out


def _border_css(border: dict) -> dict[str, Any]:
    if not border or border.get("style") in (None, "none"):
        radius = doc_model._num((border or {}).get("radius"), 0)
        return {"border-radius": _px(radius)} if radius else {}
    style = border.get("style")
    color = border.get("color") or "#e5e7eb"
    widths = border.get("width") or {}
    out: dict[str, Any] = {}
    for side in ("top", "right", "bottom", "left"):
        width = doc_model._num(widths.get(side), 0)
        if width:
            out[f"border-{side}"] = f"{_px(width)} {style} {color}"
    radius = doc_model._num(border.get("radius"), 0)
    if radius:
        out["border-radius"] = _px(radius)
    return out


def _visibility_parts(visibility: dict) -> tuple[list[str], dict[str, Any]]:
    """Return (css classes, inline style) implementing desktop/mobile visibility."""
    desktop = (visibility or {}).get("desktop", True)
    mobile = (visibility or {}).get("mobile", True)
    classes: list[str] = []
    inline: dict[str, Any] = {}
    if not desktop and not mobile:
        inline["display"] = "none"
        inline["mso-hide"] = "all"
        classes.append("cn-hide-m")
    elif not desktop:
        inline["display"] = "none"
        inline["mso-hide"] = "all"
        classes.append("cn-show-m")
    elif not mobile:
        classes.append("cn-hide-m")
    return classes, inline


def _class_attr(classes: list[str]) -> str:
    filtered = [c for c in classes if c]
    return f' class="{" ".join(filtered)}"' if filtered else ""


def _text_css(style: dict, tokens: dict, *, kind: str = "body", level: int = 2) -> dict[str, Any]:
    style = style or {}
    if kind == "heading":
        family = style.get("fontFamily") or tokens["headingFont"]
        size = style.get("fontSize") or heading_size(tokens, level)
        color = style.get("color") or tokens["headingColor"]
        weight = style.get("fontWeight") or 700
    elif kind == "muted":
        family = style.get("fontFamily") or tokens["bodyFont"]
        size = style.get("fontSize") or max(12, int(tokens["bodyFontSize"]) - 3)
        color = style.get("color") or tokens["mutedTextColor"]
        weight = style.get("fontWeight")
    else:
        family = style.get("fontFamily") or tokens["bodyFont"]
        size = style.get("fontSize") or tokens["bodyFontSize"]
        color = style.get("color") or tokens["bodyTextColor"]
        weight = style.get("fontWeight")

    css: dict[str, Any] = {
        "font-family": family,
        "font-size": _px(size),
        "color": color,
        "line-height": style.get("lineHeight") or tokens["lineHeight"],
    }
    if weight:
        css["font-weight"] = weight
    if style.get("letterSpacing"):
        css["letter-spacing"] = _px(style["letterSpacing"])
    if style.get("textTransform") and style["textTransform"] != "none":
        css["text-transform"] = style["textTransform"]
    if style.get("align"):
        css["text-align"] = style["align"]
    if style.get("direction"):
        css["direction"] = style["direction"]
    return css


def _link_href(link: Optional[dict]) -> str:
    if not link:
        return ""
    link_type = link.get("type", "url")
    value = (link.get("value") or "").strip()
    if link_type in SYSTEM_LINK_TOKENS:
        return SYSTEM_LINK_TOKENS[link_type]
    if link_type == "email":
        return f"mailto:{value}" if value else ""
    if link_type == "tel":
        return f"tel:{re.sub(r'[^0-9+]', '', value)}" if value else ""
    if not value:
        return ""
    if not is_safe_url(value):
        return ""
    return value


def _merge_expression(key: str, fallback: Optional[str], fmt: Optional[str]) -> str:
    if not key:
        return ""
    expression = key
    if fallback:
        escaped = fallback.replace('"', '\\"')
        expression += f' | default: "{escaped}"'
    if fmt:
        expression += f" | format: {fmt}"
    return "{{ " + expression + " }}"


class Compiler:
    def __init__(
        self,
        document: dict,
        tokens: dict,
        *,
        org_settings: Optional[dict] = None,
        reusable: Optional[dict[str, Any]] = None,
    ) -> None:
        self.document = document
        self.tokens = tokens
        self.org = org_settings or {}
        self.reusable = reusable or {}
        self.warnings: list[str] = []
        self.unresolved: list[str] = []
        self._reusable_depth = 0

    # ── blocks ───────────────────────────────────────────────────────────────

    def render_block(self, block: dict) -> str:
        block_type = block.get("type")
        renderer = getattr(self, f"_render_{block_type}", None)
        if renderer is None:
            self.warnings.append(f"Block type '{block_type}' is not renderable and was skipped.")
            return ""
        inner = renderer(block)
        if not inner:
            return ""
        return self._wrap_block(block, inner)

    def _wrap_block(self, block: dict, inner: str) -> str:
        align = block.get("align") or "left"
        classes, inline = _visibility_parts(block.get("visibility"))
        cell_style = {}
        padding = block.get("padding") or {}
        if _has_spacing(padding):
            cell_style["padding"] = _spacing_css(padding)
        cell_style.update(_background_css(block.get("background")))
        cell_style.update(_border_css(block.get("border")))

        mobile = block.get("mobile") or {}
        if mobile.get("width") == "full":
            classes.append("cn-w-full")

        table_style = {"border-collapse": "collapse", **inline}
        return (
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
            f'{_class_attr(classes)} style="{_style(table_style)}">'
            f'<tr><td align="{esc(align)}" style="{_style(cell_style)}">{inner}</td></tr>'
            f"</table>"
        )

    def _inline_html(self, raw: str) -> str:
        result = sanitize_inline_html(raw or "")
        if result.removed:
            self.warnings.append("Unsupported markup was removed from text content.")
        return result.html

    def _render_text(self, block: dict) -> str:
        css = _text_css(block.get("style"), self.tokens)
        body = self._inline_html(block.get("html", ""))
        return f'<div style="{_style(css)}">{body}</div>'

    def _render_heading(self, block: dict) -> str:
        level = int(block.get("level", 2))
        css = _text_css(block.get("style"), self.tokens, kind="heading", level=level)
        css["margin"] = "0"
        body = self._inline_html(block.get("html", ""))
        return f'<h{level} style="{_style(css)}">{body}</h{level}>'

    def _render_quote(self, block: dict) -> str:
        css = _text_css(block.get("style"), self.tokens)
        accent = block.get("accentColor") or self.tokens["primaryColor"]
        css.update({
            "margin": "0",
            "padding": "4px 0 4px 16px",
            "border-left": f"3px solid {accent}",
            "font-style": "italic",
        })
        body = self._inline_html(block.get("html", ""))
        citation = block.get("citation")
        cite_html = ""
        if citation:
            cite_css = _text_css(block.get("style"), self.tokens, kind="muted")
            cite_css["margin"] = "6px 0 0"
            cite_html = f'<div style="{_style(cite_css)}">&mdash; {esc(citation)}</div>'
        return f'<blockquote style="{_style(css)}">{body}{cite_html}</blockquote>'

    def _render_signature(self, block: dict) -> str:
        css = _text_css(block.get("style"), self.tokens)
        return f'<div style="{_style(css)}">{self._inline_html(block.get("html", ""))}</div>'

    def _render_preformatted(self, block: dict) -> str:
        style = dict(block.get("style") or {})
        css = _text_css(style, self.tokens)
        css.update({
            "font-family": style.get("fontFamily") or "'Courier New', Courier, monospace",
            "margin": "0",
            "white-space": "pre-wrap",
            "word-break": "break-word",
        })
        return f'<pre style="{_style(css)}">{esc(block.get("text", ""))}</pre>'

    def _render_list(self, block: dict) -> str:
        tag = "ol" if block.get("ordered") else "ul"
        css = _text_css(block.get("style"), self.tokens)
        css.update({"margin": "0", "padding-left": "22px"})
        items = "".join(
            f'<li style="margin:0 0 6px 0">{self._inline_html(item)}</li>'
            for item in block.get("items") or []
        )
        return f'<{tag} style="{_style(css)}">{items}</{tag}>'

    def _render_image(self, block: dict) -> str:
        src = (block.get("src") or "").strip()
        if not src or not is_safe_url(src):
            if src:
                self.warnings.append("An image was skipped because its URL is not allowed.")
            return ""
        width = block.get("width")
        max_width = block.get("maxWidth")
        img_css: dict[str, Any] = {
            "display": "block",
            "border": "0",
            "outline": "none",
            "text-decoration": "none",
            "height": "auto" if block.get("fit") != "none" else None,
            "max-width": _px(max_width) if max_width else "100%",
        }
        border = _border_css(block.get("border"))
        radius = border.get("border-radius")
        if radius:
            img_css["border-radius"] = radius
        if block.get("fit") == "fill":
            img_css["width"] = "100%"
        align = block.get("align") or "center"
        if align == "center":
            img_css["margin"] = "0 auto"

        img = (
            f'<img src="{esc(src)}"'
            f'{_attr("alt", block.get("alt") or "")}'
            f'{_attr("title", block.get("title"))}'
            f'{_attr("width", width)}'
            f'{_attr("height", block.get("height"))}'
            f' border="0" style="{_style(img_css)}" />'
        )
        href = _link_href(block.get("link"))
        if href:
            link = block.get("link") or {}
            img = (
                f'<a href="{esc(href)}"{_attr("target", link.get("target"))}'
                f'{_attr("title", link.get("title"))} style="text-decoration:none">{img}</a>'
            )
        return img

    def _render_button(self, block: dict) -> str:
        text = block.get("text") or ""
        href = _link_href(block.get("link"))
        bg = block.get("backgroundColor") or self.tokens["buttonBackground"]
        fg = block.get("textColor") or self.tokens["buttonTextColor"]
        radius = self.tokens["buttonRadius"]
        style = block.get("style") or {}
        label_css = {
            "font-family": style.get("fontFamily") or self.tokens["bodyFont"],
            "font-size": _px(style.get("fontSize") or self.tokens["bodyFontSize"]),
            "font-weight": style.get("fontWeight") or 600,
            "color": fg,
            "text-decoration": "none",
            "display": "inline-block",
            "line-height": 1.2,
            "mso-padding-alt": "0",
        }
        if style.get("letterSpacing"):
            label_css["letter-spacing"] = _px(style["letterSpacing"])
        if style.get("textTransform") and style["textTransform"] != "none":
            label_css["text-transform"] = style["textTransform"]

        cell_css = {
            "background-color": bg,
            "border-radius": _px(radius),
            "padding": _spacing_css(block.get("innerPadding") or {}),
            "text-align": "center",
        }
        cell_css.update(_border_css(block.get("border")))

        table_attrs = 'role="presentation" cellpadding="0" cellspacing="0" border="0"'
        width_attr = ""
        table_css: dict[str, Any] = {"border-collapse": "separate"}
        if block.get("fullWidth"):
            width_attr = ' width="100%"'
            table_css["width"] = "100%"
        elif block.get("width"):
            width_attr = f' width="{int(block["width"])}"'

        anchor = (
            f'<a href="{esc(href or "#")}"'
            f'{_attr("target", (block.get("link") or {}).get("target"))}'
            f'{_attr("aria-label", block.get("accessibleLabel"))}'
            f'{_attr("title", (block.get("link") or {}).get("title"))}'
            f' style="{_style(label_css)}">{esc(text)}</a>'
        )
        align = block.get("align") or "center"
        return (
            f'<table {table_attrs}{width_attr} align="{esc(align)}" style="{_style(table_css)}">'
            f'<tr><td style="{_style(cell_css)}">{anchor}</td></tr></table>'
        )

    def _render_divider(self, block: dict) -> str:
        color = block.get("color") or self.tokens["dividerColor"]
        thickness = block.get("thickness") or 1
        line_style = block.get("lineStyle") or "solid"
        width = block.get("widthPct") or 100
        align = block.get("align") or "center"
        cell_css = {
            "border-top": f"{_px(thickness)} {line_style} {color}",
            "font-size": "0",
            "line-height": "0",
            "height": "0",
        }
        return (
            f'<table role="presentation" width="{int(width)}%" cellpadding="0" cellspacing="0" border="0"'
            f' align="{esc(align)}" style="border-collapse:collapse">'
            f'<tr><td style="{_style(cell_css)}">&nbsp;</td></tr></table>'
        )

    def _render_spacer(self, block: dict) -> str:
        height = int(doc_model._num(block.get("height"), 24))
        css = {
            "height": _px(height),
            "line-height": _px(height),
            "font-size": "0",
            "mso-line-height-rule": "exactly",
        }
        return f'<div style="{_style(css)}">&nbsp;</div>'

    def _render_table(self, block: dict) -> str:
        rows = block.get("rows") or []
        if not rows:
            return ""
        base_css = _text_css(block.get("style"), self.tokens)
        cell_border = _border_css(block.get("cellBorder"))
        padding = _spacing_css(block.get("cellPadding") or {})
        header_bg = block.get("headerBackground") or "#f3f4f6"
        alt_color = block.get("alternateRowColor")
        header_row = block.get("headerRow")
        footer_row = block.get("footerRow")
        total = len(rows)

        parts: list[str] = []
        for index, row in enumerate(rows):
            is_header = header_row and index == 0
            is_footer = footer_row and index == total - 1 and total > 1
            cells: list[str] = []
            for cell in row.get("cells") or []:
                tag = "th" if is_header else "td"
                cell_css = {**base_css, "padding": padding, **cell_border}
                cell_css["text-align"] = cell.get("align") or "left"
                cell_css["vertical-align"] = cell.get("vAlign") or "middle"
                background = cell.get("background")
                if is_header:
                    background = background or header_bg
                    cell_css["font-weight"] = 700
                elif is_footer:
                    background = background or header_bg
                elif alt_color and index % 2 == (1 if header_row else 0):
                    background = background or alt_color
                if background:
                    cell_css["background-color"] = background
                span = ""
                if int(cell.get("colSpan", 1) or 1) > 1:
                    span += f' colspan="{int(cell["colSpan"])}"'
                if int(cell.get("rowSpan", 1) or 1) > 1:
                    span += f' rowspan="{int(cell["rowSpan"])}"'
                scope = ' scope="col"' if is_header else ""
                cells.append(
                    f'<{tag}{span}{scope} style="{_style(cell_css)}">{self._inline_html(cell.get("html", ""))}</{tag}>'
                )
            parts.append(f"<tr>{''.join(cells)}</tr>")

        width = int(block.get("widthPct") or 100)
        wrapper_class = "cn-table-scroll" if block.get("mobileStrategy") == "scroll" else "cn-table-stack"
        table_html = (
            f'<table role="presentation" width="{width}%" cellpadding="0" cellspacing="0" border="0"'
            f' style="border-collapse:collapse;table-layout:auto">{"".join(parts)}</table>'
        )
        return f'<div class="{wrapper_class}" style="width:100%;overflow-x:auto">{table_html}</div>'

    def _render_rawHtml(self, block: dict) -> str:
        result = sanitize_raw_block(block.get("html", ""))
        if result.removed:
            self.warnings.append(
                "A Raw HTML block contained unsupported content that was removed: "
                + ", ".join(result.removed[:4])
            )
        return result.html

    def _render_social(self, block: dict) -> str:
        links = [link for link in block.get("links") or [] if (link.get("url") or "").strip()]
        if not links:
            return ""
        gap = int(doc_model._num(block.get("gap"), 12))
        size = int(doc_model._num(block.get("iconSize"), 24))
        label_css = _text_css(None, self.tokens, kind="muted")
        label_css["text-decoration"] = "none"
        label_css["color"] = self.tokens["linkColor"]

        cells: list[str] = []
        for index, link in enumerate(links):
            href = link.get("url") or ""
            if not is_safe_url(href):
                continue
            if link.get("iconUrl") and is_safe_url(link["iconUrl"]):
                content = (
                    f'<img src="{esc(link["iconUrl"])}" alt="{esc(link.get("label") or link.get("network"))}"'
                    f' width="{size}" height="{size}" border="0"'
                    f' style="display:block;border:0;width:{size}px;height:{size}px" />'
                )
            else:
                content = esc(link.get("label") or link.get("network") or "Link")
            if block.get("showLabels") and link.get("iconUrl"):
                content += f'<span style="{_style(label_css)}">&nbsp;{esc(link.get("label"))}</span>'
            spacer = f'<td width="{gap}" style="width:{gap}px;font-size:0;line-height:0">&nbsp;</td>' if index else ""
            cells.append(
                f'{spacer}<td style="vertical-align:middle">'
                f'<a href="{esc(href)}" target="_blank" style="{_style(label_css)}">{content}</a></td>'
            )
        if not cells:
            return ""
        align = block.get("align") or "center"
        return (
            f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="{esc(align)}"'
            f' style="border-collapse:collapse"><tr>{"".join(cells)}</tr></table>'
        )

    def _render_navLinks(self, block: dict) -> str:
        items = block.get("items") or []
        if not items:
            return ""
        css = _text_css(block.get("style"), self.tokens)
        link_css = {**css, "color": self.tokens["linkColor"], "text-decoration": "none"}
        sep_css = {**css, "color": self.tokens["mutedTextColor"]}
        separator = block.get("separator") or "|"
        pieces: list[str] = []
        for index, item in enumerate(items):
            href = _link_href(item.get("link"))
            if index:
                pieces.append(f'<span style="{_style(sep_css)}">&nbsp;{esc(separator)}&nbsp;</span>')
            label = esc(item.get("label") or "Link")
            if href:
                pieces.append(f'<a href="{esc(href)}" style="{_style(link_css)}">{label}</a>')
            else:
                pieces.append(f'<span style="{_style(css)}">{label}</span>')
        return f'<div style="{_style(css)}">{"".join(pieces)}</div>'

    def _render_logo(self, block: dict) -> str:
        src = block.get("src") or ""
        if block.get("useThemeLogo"):
            brand = self.tokens.get("brand") or {}
            variant = block.get("themeVariant") or "primary"
            key = {"primary": "primaryLogo", "secondary": "secondaryLogo", "dark": "darkLogo"}[variant]
            src = brand.get(key) or brand.get("primaryLogo") or src
        if not src or not is_safe_url(src):
            return ""
        width = block.get("width")
        img = (
            f'<img src="{esc(src)}" alt="{esc(block.get("alt") or "")}"'
            f'{_attr("width", width)} border="0"'
            f' style="display:block;border:0;height:auto;max-width:100%" />'
        )
        href = _link_href(block.get("link"))
        if href:
            img = f'<a href="{esc(href)}" style="text-decoration:none">{img}</a>'
        return img

    def _render_contactInfo(self, block: dict) -> str:
        brand = self.tokens.get("brand") or {}
        if block.get("useThemeAddress"):
            name = brand.get("organizationName") or block.get("organizationName") or ""
            address = brand.get("organizationAddress") or "\n".join(block.get("addressLines") or [])
            lines = [line for line in str(address).splitlines() if line.strip()]
        else:
            name = block.get("organizationName") or ""
            lines = [line for line in block.get("addressLines") or [] if line.strip()]

        css = _text_css(block.get("style"), self.tokens, kind="muted")
        css["margin"] = "0"
        parts: list[str] = []
        if name:
            parts.append(f'<div style="{_style({**css, "font-weight": 600})}">{esc(name)}</div>')
        for line in lines:
            parts.append(f'<div style="{_style(css)}">{esc(line)}</div>')
        contact_bits: list[str] = []
        link_css = {**css, "color": self.tokens["linkColor"], "text-decoration": "none"}
        if block.get("phone"):
            digits = re.sub(r"[^0-9+]", "", block["phone"])
            contact_bits.append(f'<a href="tel:{esc(digits)}" style="{_style(link_css)}">{esc(block["phone"])}</a>')
        if block.get("email"):
            contact_bits.append(
                f'<a href="mailto:{esc(block["email"])}" style="{_style(link_css)}">{esc(block["email"])}</a>'
            )
        if block.get("website") and is_safe_url(block["website"]):
            contact_bits.append(
                f'<a href="{esc(block["website"])}" style="{_style(link_css)}">{esc(block["website"])}</a>'
            )
        if contact_bits:
            joiner = f'<span style="{_style(css)}">&nbsp;&middot;&nbsp;</span>'
            parts.append(f'<div style="{_style(css)}">{joiner.join(contact_bits)}</div>')
        return "".join(parts)

    def _render_system_link(self, block: dict, token_key: str) -> str:
        css = _text_css(block.get("style"), self.tokens, kind="muted")
        css.update({"color": self.tokens["linkColor"], "text-decoration": "underline"})
        label = esc(block.get("label") or token_key)
        return f'<a href="{SYSTEM_LINK_TOKENS[token_key]}" style="{_style(css)}">{label}</a>'

    def _render_viewInBrowser(self, block: dict) -> str:
        return self._render_system_link(block, "view_in_browser")

    def _render_unsubscribe(self, block: dict) -> str:
        return self._render_system_link(block, "unsubscribe")

    def _render_preferenceCenter(self, block: dict) -> str:
        return self._render_system_link(block, "preferences")

    def _render_orgFooter(self, block: dict) -> str:
        brand = self.tokens.get("brand") or {}
        raw = brand.get("defaultFooterHtml") if block.get("useThemeFooter") else block.get("html")
        raw = raw or block.get("html") or ""
        if not raw.strip():
            return ""
        css = _text_css(block.get("style"), self.tokens, kind="muted")
        return f'<div style="{_style(css)}">{self._inline_html(raw)}</div>'

    def _render_legal(self, block: dict) -> str:
        brand = self.tokens.get("brand") or {}
        raw = brand.get("standardLegalText") if block.get("useThemeLegal") else block.get("html")
        raw = raw or block.get("html") or ""
        if not raw.strip():
            return ""
        css = _text_css(block.get("style"), self.tokens, kind="muted")
        return f'<div style="{_style(css)}">{self._inline_html(raw)}</div>'

    def _render_videoThumb(self, block: dict) -> str:
        thumb = block.get("thumbnailUrl") or ""
        video = block.get("videoUrl") or ""
        if not thumb or not is_safe_url(thumb) or not video or not is_safe_url(video):
            return ""
        width = block.get("width")
        img = (
            f'<img src="{esc(thumb)}" alt="{esc(block.get("alt") or "")}"'
            f'{_attr("width", width)} border="0"'
            f' style="display:block;border:0;height:auto;max-width:100%" />'
        )
        parts = [f'<a href="{esc(video)}" target="_blank" style="text-decoration:none">{img}</a>']
        if block.get("showPlayBadge"):
            css = _text_css(None, self.tokens, kind="muted")
            css.update({"color": self.tokens["linkColor"], "text-decoration": "underline", "margin": "8px 0 0"})
            parts.append(
                f'<div style="{_style({"margin": "8px 0 0"})}">'
                f'<a href="{esc(video)}" target="_blank" style="{_style(css)}">'
                f'{esc(block.get("alt") or "Watch the video")}</a></div>'
            )
        return "".join(parts)

    def _render_mergeField(self, block: dict) -> str:
        expression = _merge_expression(block.get("fieldKey", ""), block.get("fallback"), block.get("format"))
        if not expression:
            return ""
        css = _text_css(block.get("style"), self.tokens)
        return f'<div style="{_style(css)}">{expression}</div>'

    def _render_reusable(self, block: dict) -> str:
        code = block.get("reusableCode")
        fragment = self.reusable.get(code) if code else None
        if not fragment:
            self.unresolved.append(block.get("id", ""))
            self.warnings.append(
                f"Reusable block '{code or 'unknown'}' could not be loaded and was skipped."
            )
            return ""
        if self._reusable_depth >= 3:
            self.warnings.append("Reusable blocks are nested too deeply; rendering stopped.")
            return ""
        self._reusable_depth += 1
        try:
            blocks = fragment.get("blocks") if isinstance(fragment, dict) else None
            if blocks:
                return "".join(self.render_block(doc_model.normalize_block(item) or {}) for item in blocks if item)
            section = fragment.get("section") if isinstance(fragment, dict) else None
            if section:
                return self.render_section(doc_model.normalize_section(section), inner_only=True)
        finally:
            self._reusable_depth -= 1
        return ""

    def _render_conditional(self, block: dict) -> str:
        inner = "".join(self.render_block(child) for child in block.get("blocks") or [])
        if not inner:
            return ""
        return f"<!-- conditional: {esc(block.get('label') or '')} -->{inner}"

    # ── structure ────────────────────────────────────────────────────────────

    def render_column(self, column: dict, row: dict, *, stack: bool) -> str:
        classes, inline = _visibility_parts(column.get("visibility"))
        if stack and not column.get("keepSideBySideOnMobile"):
            classes.append("cn-stack")
        cell_css: dict[str, Any] = {"vertical-align": column.get("vAlign") or "top"}
        padding = column.get("padding") or {}
        if _has_spacing(padding):
            cell_css["padding"] = _spacing_css(padding)
        cell_css.update(_background_css(column.get("background")))
        cell_css.update(_border_css(column.get("border")))
        if column.get("minWidth"):
            cell_css["min-width"] = _px(column["minWidth"])
        cell_css.update(inline)

        blocks_html = "".join(self.render_block(block) for block in column.get("blocks") or [])
        if not blocks_html:
            blocks_html = '<div style="font-size:0;line-height:0">&nbsp;</div>'

        width_pct = int(doc_model._num(column.get("widthPct"), 100))
        return (
            f'<td{_class_attr(classes)} width="{width_pct}%"'
            f' valign="{esc(column.get("vAlign") or "top")}" style="{_style(cell_css)}">'
            f"{blocks_html}</td>"
        )

    def render_row(self, row: dict) -> str:
        columns = row.get("columns") or []
        if not columns:
            return ""
        stack = bool(row.get("stackOnMobile")) and len(columns) > 1
        gap = int(doc_model._num(row.get("gap"), 0))

        ordered = list(columns)
        reverse = bool(row.get("reverseOnMobile"))
        orders = [c.get("mobileOrder") for c in columns]
        if not reverse and all(isinstance(o, int) for o in orders) and len(set(orders)) == len(orders):
            desired = [c for _, c in sorted(zip(orders, columns), key=lambda pair: pair[0])]
            if desired == list(reversed(columns)):
                reverse = True
            elif desired != columns:
                self.warnings.append(
                    "Custom mobile stacking order is only guaranteed when it reverses the desktop order."
                )

        cells: list[str] = []
        for index, column in enumerate(ordered):
            if index and gap:
                cells.append(
                    f'<td class="cn-gap" width="{gap}" style="width:{gap}px;font-size:0;line-height:0">&nbsp;</td>'
                )
            cells.append(self.render_column(column, row, stack=stack))

        classes, inline = _visibility_parts(row.get("visibility"))
        table_css: dict[str, Any] = {"border-collapse": "collapse", **inline}
        row_padding = row.get("padding") or {}
        outer_css: dict[str, Any] = {}
        if _has_spacing(row_padding):
            outer_css["padding"] = _spacing_css(row_padding)
        outer_css.update(_background_css(row.get("background")))
        outer_css.update(_border_css(row.get("border")))
        if row.get("minHeight"):
            outer_css["min-height"] = _px(row["minHeight"])

        dir_attrs = ' dir="rtl"' if reverse and stack else ""
        inner_dir = ' dir="ltr"' if reverse and stack else ""
        inner_table = (
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
            f'{dir_attrs} style="{_style(table_css)}"><tr{inner_dir}>{"".join(cells)}</tr></table>'
        )
        if not outer_css:
            return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"{_class_attr(classes)} style="border-collapse:collapse"><tr><td>{inner_table}</td></tr></table>'
        return (
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
            f'{_class_attr(classes)} style="border-collapse:collapse">'
            f'<tr><td style="{_style(outer_css)}">{inner_table}</td></tr></table>'
        )

    def render_section(self, section: dict, *, inner_only: bool = False) -> str:
        rows_html = "".join(self.render_row(row) for row in section.get("rows") or [])
        if not rows_html:
            return ""
        if inner_only:
            return rows_html

        width = int(
            doc_model._num(section.get("contentWidth"), 0)
            or doc_model._num(self.document.get("settings", {}).get("contentWidth"), 640)
        )
        inner_css: dict[str, Any] = {"border-collapse": "collapse"}
        inner_css.update(_background_css(section.get("background")))
        inner_css.update(_border_css(section.get("border")))
        if section.get("minHeight"):
            inner_css["min-height"] = _px(section["minHeight"])

        container = (
            f'<table role="presentation" class="cn-container" width="{width}"'
            f' cellpadding="0" cellspacing="0" border="0" style="{_style({**inner_css, "width": _px(width), "max-width": _px(width)})}">'
            f"<tr><td>{rows_html}</td></tr></table>"
        )

        outer_cell_css: dict[str, Any] = {}
        padding = section.get("padding") or {}
        if _has_spacing(padding):
            outer_cell_css["padding"] = _spacing_css(padding)
        outer_cell_css.update(_background_css(section.get("outerBackground")))

        classes, inline = _visibility_parts(section.get("visibility"))
        outer_css = {"border-collapse": "collapse", **inline}
        align = section.get("align") or "left"
        table_align = "center" if align in ("center", "justify") else align
        return (
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
            f'{_class_attr(classes)} style="{_style(outer_css)}">'
            f'<tr><td align="{esc(table_align)}" valign="{esc(section.get("vAlign") or "top")}"'
            f' style="{_style(outer_cell_css)}">{container}</td></tr></table>'
        )

    def render_body(self) -> str:
        return "".join(self.render_section(section) for section in self.document.get("sections") or [])


def _head_styles(tokens: dict) -> str:
    return f"""
    html, body {{ margin:0 !important; padding:0 !important; height:100% !important; width:100% !important; }}
    body {{ -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }}
    table, td {{ mso-table-lspace:0pt; mso-table-rspace:0pt; border-collapse:collapse; }}
    img {{ -ms-interpolation-mode:bicubic; border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }}
    a {{ color:{tokens['linkColor']}; }}
    .cn-hide-m {{ }}
    @media only screen and (max-width:{MOBILE_BREAKPOINT}px) {{
      .cn-container {{ width:100% !important; max-width:100% !important; }}
      .cn-stack {{ display:block !important; width:100% !important; max-width:100% !important; }}
      .cn-gap {{ display:none !important; width:0 !important; }}
      .cn-hide-m {{ display:none !important; max-height:0 !important; overflow:hidden !important; }}
      .cn-show-m {{ display:block !important; width:100% !important; max-height:none !important; overflow:visible !important; }}
      .cn-w-full, .cn-w-full img {{ width:100% !important; height:auto !important; }}
      .cn-table-stack table, .cn-table-stack td {{ display:block !important; width:100% !important; }}
    }}
    """.strip()


def _preheader_html(preheader: str) -> str:
    if not preheader:
        return ""
    css = _style({
        "display": "none",
        "font-size": "1px",
        "line-height": "1px",
        "max-height": "0",
        "max-width": "0",
        "opacity": "0",
        "overflow": "hidden",
        "mso-hide": "all",
    })
    # Trailing entities stop clients pulling body copy into the snippet.
    padding = "&#847;&zwnj;&nbsp;" * 20
    return f'<div style="{css}">{esc(preheader)}{padding}</div>'


def _compliance_footer(tokens: dict, required: dict) -> str:
    brand = tokens.get("brand") or {}
    muted = _text_css(None, tokens, kind="muted")
    muted["margin"] = "0 0 6px"
    parts: list[str] = []
    if required.get("address"):
        address = brand.get("organizationAddress") or ""
        name = brand.get("organizationName") or ""
        lines = [line for line in str(address).splitlines() if line.strip()]
        if name:
            parts.append(f'<div style="{_style(muted)}">{esc(name)}</div>')
        for line in lines:
            parts.append(f'<div style="{_style(muted)}">{esc(line)}</div>')
    links: list[str] = []
    link_css = {**muted, "color": tokens["linkColor"], "text-decoration": "underline", "margin": "0"}
    if required.get("unsubscribe"):
        links.append(f'<a href="{SYSTEM_LINK_TOKENS["unsubscribe"]}" style="{_style(link_css)}">Unsubscribe</a>')
    if required.get("view_in_browser"):
        links.append(
            f'<a href="{SYSTEM_LINK_TOKENS["view_in_browser"]}" style="{_style(link_css)}">View in browser</a>'
        )
    if links:
        sep = f'<span style="{_style(muted)}">&nbsp;&middot;&nbsp;</span>'
        parts.append(f'<div style="{_style(muted)}">{sep.join(links)}</div>')
    if not parts:
        return ""
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
        f' style="border-collapse:collapse"><tr><td align="center" style="padding:16px 24px">'
        f'{"".join(parts)}</td></tr></table>'
    )


def compile_document(
    document: dict,
    *,
    tokens: Optional[dict] = None,
    subject: str = "",
    preheader: str = "",
    org_settings: Optional[dict] = None,
    reusable: Optional[dict[str, Any]] = None,
) -> CompileResult:
    """Render a normalized document into a complete, email-safe HTML document."""
    document = doc_model.normalize_document(document)
    resolved = resolve_tokens(tokens, document.get("themeOverrides"))
    org = org_settings or {}

    compiler = Compiler(document, resolved, org_settings=org, reusable=reusable)
    body_html = compiler.render_body()

    auto_appended: list[str] = []
    required = {
        "unsubscribe": bool(org.get("require_unsubscribe", True)),
        "address": bool(org.get("require_organization_address", False)),
        "view_in_browser": bool(org.get("require_view_in_browser", False)),
    }
    if org.get("auto_append_compliance_footer", True):
        lowered = body_html.lower()
        missing = {
            "unsubscribe": required["unsubscribe"] and SYSTEM_LINK_TOKENS["unsubscribe"] not in body_html,
            "address": required["address"] and not _has_address(document, resolved),
            "view_in_browser": required["view_in_browser"] and SYSTEM_LINK_TOKENS["view_in_browser"] not in body_html,
        }
        if any(missing.values()):
            footer = _compliance_footer(resolved, missing)
            if footer:
                body_html += footer
                auto_appended = [key for key, value in missing.items() if value]
        del lowered

    settings = document.get("settings") or {}
    page_bg = _background_css(settings.get("outerBackground"), inherit_color=resolved["pageBackground"])
    content_bg = _background_css(settings.get("background"), inherit_color=resolved["contentBackground"])
    body_css = {
        "margin": "0",
        "padding": "0",
        "width": "100%",
        "font-family": resolved["bodyFont"],
        "font-size": _px(resolved["bodyFontSize"]),
        "color": resolved["bodyTextColor"],
        "line-height": resolved["lineHeight"],
        **page_bg,
    }
    wrapper_css = {"border-collapse": "collapse", **page_bg}
    inner_css = {"border-collapse": "collapse", **content_bg}
    width = int(doc_model._num(settings.get("contentWidth"), 640))
    lang = settings.get("lang") or "en"
    direction = settings.get("direction") or "ltr"

    html_out = f"""<!DOCTYPE html>
<html lang="{esc(lang)}" dir="{esc(direction)}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>{esc(subject)}</title>
<!-- Resets and the responsive media query must stay in the head: data-premailer="ignore" keeps the inliner from flattening them onto elements. -->
<style type="text/css" data-premailer="ignore">
{_head_styles(resolved)}
</style>
</head>
<body style="{_style(body_css)}">
{_preheader_html(preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="{_style(wrapper_css)}">
<tr><td align="center" valign="top">
<table role="presentation" class="cn-container" width="{width}" cellpadding="0" cellspacing="0" border="0" style="{_style({**inner_css, 'width': _px(width), 'max-width': _px(width)})}">
<tr><td>
{body_html}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""

    return CompileResult(
        html=html_out,
        warnings=compiler.warnings,
        unresolved=[node for node in compiler.unresolved if node],
        auto_appended=auto_appended,
    )


def _has_address(document: dict, tokens: dict) -> bool:
    for block, *_ in doc_model.iter_blocks(document):
        if block.get("type") == "contactInfo":
            if block.get("useThemeAddress"):
                brand = tokens.get("brand") or {}
                if brand.get("organizationAddress"):
                    return True
            if any(str(line).strip() for line in block.get("addressLines") or []):
                return True
    return False
