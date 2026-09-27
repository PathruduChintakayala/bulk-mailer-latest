"""
Composer validation rule engine.

Implements the Review categories (spec 19.2-19.7) and the HTML diagnostics
(spec 14.5). This is the authoritative pass; the browser runs a fast subset for
latency only. Issues carry either a document node id (visual navigation) or a
line/column (HTML navigation).
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any, Iterable, Optional

from app.services.composer import document as doc_model
from app.services.composer.sanitize import is_safe_url
from app.services.composer.settings import DEFAULT_SETTINGS, GATE_NAMES
from app.services.composer.theme import heading_size, resolve_tokens

SEVERITIES = ("blocker", "error", "warning", "info")

PLACEHOLDER_PATTERNS = (
    r"lorem ipsum",
    r"\btodo\b",
    r"\btbd\b",
    r"\bfixme\b",
    r"xxxx+",
    r"write your message here",
    r"your name",
    r"a clear, benefit-led headline",
    r"supporting copy",
    r"one or two sentences that expand on the headline",
    r"column content",
    r"quoted text",
)

NON_DESCRIPTIVE_LINK_TEXT = (
    "click here", "here", "read more", "more", "link", "this link",
    "learn more", "click", "this", "download",
)

UNSUPPORTED_TAGS = (
    "script", "iframe", "object", "embed", "form", "input", "button", "select",
    "textarea", "video", "audio", "canvas", "svg", "math", "applet", "frame",
    "frameset", "noscript", "base", "link",
)

RISKY_CSS_PROPERTIES = (
    "position", "float-if-flex", "display:flex", "display:grid", "display:inline-flex",
    "transform", "transition", "animation", "box-shadow", "text-shadow", "filter",
    "flex", "grid", "gap", "z-index", "clip-path", "backdrop-filter", "object-fit",
)

WEB_SAFE_FAMILIES = (
    "arial", "helvetica", "verdana", "tahoma", "trebuchet", "georgia", "times",
    "courier", "lucida", "palatino", "sans-serif", "serif", "monospace",
    "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto", "system-ui",
)

MERGE_TOKEN_RE = re.compile(r"\{\{\s*([^}|]+?)\s*(\|[^}]*)?\}\}")
SYSTEM_MERGE_KEYS = {
    "unsubscribe_url", "preferences_url", "view_in_browser_url",
    "email", "first_name", "last_name", "name", "campaign_name", "current_year",
}


@dataclass
class Issue:
    code: str
    severity: str
    category: str
    message: str
    expected: Optional[str] = None
    node_id: Optional[str] = None
    element: Optional[str] = None
    line: Optional[int] = None
    column: Optional[int] = None
    compatibility: Optional[str] = None
    dismissible: bool = True

    def to_dict(self) -> dict:
        data = asdict(self)
        return {
            "code": data["code"],
            "severity": data["severity"],
            "category": data["category"],
            "message": data["message"],
            "expected": data["expected"],
            "nodeId": data["node_id"],
            "element": data["element"],
            "line": data["line"],
            "column": data["column"],
            "compatibility": data["compatibility"],
            "dismissible": data["dismissible"],
        }


@dataclass
class ValidationContext:
    """Everything the rule engine needs. All fields optional so partial runs work."""
    document: Optional[dict] = None
    html_source: Optional[str] = None
    compiled_html: str = ""
    plain_text: str = ""
    subject: str = ""
    preheader: str = ""
    kind: str = "visual"  # visual | custom_html
    tokens: dict = field(default_factory=dict)
    settings: dict = field(default_factory=lambda: dict(DEFAULT_SETTINGS))
    merge_field_definitions: list[dict] = field(default_factory=list)
    mapped_field_keys: set[str] = field(default_factory=set)
    missing_value_counts: dict[str, int] = field(default_factory=dict)
    invalid_value_counts: dict[str, int] = field(default_factory=dict)
    attachment_total_kb: int = 0
    attachment_count: int = 0
    plain_text_mode: str = "generated"


# ── colour helpers ────────────────────────────────────────────────────────────

def _parse_color(value: Optional[str]) -> Optional[tuple[int, int, int]]:
    if not value or not isinstance(value, str):
        return None
    text = value.strip().lower()
    if text in ("transparent", "inherit", "initial", "none"):
        return None
    match = re.fullmatch(r"#([0-9a-f]{3})", text)
    if match:
        digits = match.group(1)
        return tuple(int(ch * 2, 16) for ch in digits)  # type: ignore[return-value]
    match = re.fullmatch(r"#([0-9a-f]{6})", text)
    if match:
        digits = match.group(1)
        return (int(digits[0:2], 16), int(digits[2:4], 16), int(digits[4:6], 16))
    match = re.fullmatch(r"rgba?\(([^)]+)\)", text)
    if match:
        parts = [p.strip() for p in match.group(1).split(",")]
        try:
            return (int(float(parts[0])), int(float(parts[1])), int(float(parts[2])))
        except (ValueError, IndexError):
            return None
    named = {
        "white": (255, 255, 255), "black": (0, 0, 0), "red": (255, 0, 0),
        "gray": (128, 128, 128), "grey": (128, 128, 128), "silver": (192, 192, 192),
    }
    return named.get(text)


def _relative_luminance(rgb: tuple[int, int, int]) -> float:
    def channel(value: int) -> float:
        srgb = value / 255
        return srgb / 12.92 if srgb <= 0.03928 else ((srgb + 0.055) / 1.055) ** 2.4

    r, g, b = (channel(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(foreground: Optional[str], background: Optional[str]) -> Optional[float]:
    fg = _parse_color(foreground)
    bg = _parse_color(background)
    if not fg or not bg:
        return None
    l1, l2 = _relative_luminance(fg), _relative_luminance(bg)
    lighter, darker = max(l1, l2), min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


# ── source position helpers ───────────────────────────────────────────────────

def _line_col(source: str, index: int) -> tuple[int, int]:
    prefix = source[:index]
    line = prefix.count("\n") + 1
    column = index - (prefix.rfind("\n") + 1) + 1
    return line, column


class Validator:
    def __init__(self, ctx: ValidationContext) -> None:
        self.ctx = ctx
        self.settings = ctx.settings or dict(DEFAULT_SETTINGS)
        self.tokens = resolve_tokens(ctx.tokens, (ctx.document or {}).get("themeOverrides"))
        self.issues: list[Issue] = []
        self.source = ctx.html_source or ""
        self.compiled = ctx.compiled_html or ""

    def add(
        self,
        code: str,
        severity: str,
        category: str,
        message: str,
        *,
        expected: Optional[str] = None,
        node_id: Optional[str] = None,
        element: Optional[str] = None,
        line: Optional[int] = None,
        column: Optional[int] = None,
        compatibility: Optional[str] = None,
    ) -> None:
        overrides = self.settings.get("severity_overrides") or {}
        resolved = overrides.get(code, severity)
        if resolved not in SEVERITIES:
            resolved = severity
        non_dismissible = set(self.settings.get("non_dismissible_codes") or [])
        self.issues.append(
            Issue(
                code=code,
                severity=resolved,
                category=category,
                message=message,
                expected=expected,
                node_id=node_id,
                element=element,
                line=line,
                column=column,
                compatibility=compatibility,
                dismissible=code not in non_dismissible,
            )
        )

    # ── entry point ──────────────────────────────────────────────────────────

    def run(self) -> list[Issue]:
        self.check_content()
        self.check_personalization()
        self.check_accessibility()
        self.check_compatibility()
        self.check_delivery()
        self.check_compliance()
        self.check_html()
        self.check_links()
        self.check_security()
        return self.issues

    # ── content (19.2) ───────────────────────────────────────────────────────

    def check_content(self) -> None:
        document = self.ctx.document
        body_text = doc_model.strip_html(
            re.sub(r"<(head|style|title)\b.*?</\1>", "", self.compiled, flags=re.IGNORECASE | re.DOTALL)
        )
        empty = (document is not None and doc_model.document_is_empty(document)) or (
            document is None and len(body_text) < 2
        )
        if empty:
            self.add(
                "content.empty_body",
                "blocker",
                "content",
                "The email body is empty.",
                expected="Add at least one content block or some HTML before saving or sending.",
            )

        if not (self.ctx.subject or "").strip():
            self.add(
                "content.subject_missing",
                "error",
                "content",
                "The subject line is not configured.",
                expected="Set a subject in the message header.",
            )
        if not (self.ctx.preheader or "").strip():
            self.add(
                "content.preheader_missing",
                "warning",
                "content",
                "No preheader is configured.",
                expected="Add a preheader so inbox previews are meaningful.",
            )
        if self.settings.get("require_plain_text", True) and not (self.ctx.plain_text or "").strip():
            self.add(
                "content.plain_text_missing",
                "warning",
                "content",
                "The plain-text alternative is empty.",
                expected="Generate or write a plain-text version.",
            )

        lowered = body_text.lower()
        for pattern in PLACEHOLDER_PATTERNS:
            if re.search(pattern, lowered):
                self.add(
                    "content.placeholder_text",
                    "warning",
                    "content",
                    "The email still contains placeholder text.",
                    expected="Replace starter copy with real content.",
                )
                break

        if not document:
            return

        for index, section in enumerate(document.get("sections") or []):
            has_content = any(
                column.get("blocks")
                for row in section.get("rows") or []
                for column in row.get("columns") or []
            )
            if not has_content:
                self.add(
                    "content.empty_section",
                    "warning",
                    "content",
                    f"Section {index + 1} has no content blocks.",
                    expected="Add content or remove the section.",
                    node_id=section.get("id"),
                    element=doc_model.section_label(document, section.get("id", "")),
                )

        seen_html: dict[str, str] = {}
        content_width = int(doc_model._num((document.get("settings") or {}).get("contentWidth"), 640))
        spacer_run = 0

        for block, section, _row, _column in doc_model.iter_blocks(document):
            block_type = block.get("type")
            element = doc_model.describe_block(document, block.get("id", ""))

            if block_type == "spacer":
                spacer_run += 1
                if doc_model._num(block.get("height"), 0) > 200:
                    self.add(
                        "content.excessive_spacing",
                        "warning",
                        "content",
                        "A spacer is taller than 200px.",
                        expected="Reduce the spacer height.",
                        node_id=block.get("id"),
                        element=element,
                    )
                if spacer_run >= 3:
                    self.add(
                        "content.excessive_spacing",
                        "warning",
                        "content",
                        "Three or more spacers appear in a row.",
                        expected="Replace stacked spacers with padding on the surrounding block.",
                        node_id=block.get("id"),
                        element=element,
                    )
            else:
                spacer_run = 0

            if block_type == "heading" and not doc_model.strip_html(block.get("html", "")):
                self.add(
                    "content.empty_heading",
                    "error",
                    "content",
                    "A heading block is empty.",
                    expected="Add heading text or delete the block.",
                    node_id=block.get("id"),
                    element=element,
                )
            if block_type == "button":
                if not (block.get("text") or "").strip():
                    self.add(
                        "content.empty_button",
                        "error",
                        "content",
                        "A button has no label.",
                        expected="Add button text.",
                        node_id=block.get("id"),
                        element=element,
                    )
                link = block.get("link") or {}
                if link.get("type") in ("url", "email", "tel", "merge") and not (link.get("value") or "").strip():
                    self.add(
                        "content.button_missing_link",
                        "error",
                        "content",
                        "A button has no destination.",
                        expected="Set a link for the button.",
                        node_id=block.get("id"),
                        element=element,
                    )
            if block_type in ("text", "heading", "quote"):
                normalized = doc_model.strip_html(block.get("html", "")).lower()
                if len(normalized) > 25:
                    if normalized in seen_html and seen_html[normalized] != block.get("id"):
                        self.add(
                            "content.duplicate_block",
                            "info",
                            "content",
                            "Two blocks contain identical content.",
                            expected="Remove the duplicate or vary the copy.",
                            node_id=block.get("id"),
                            element=element,
                        )
                    else:
                        seen_html[normalized] = block.get("id", "")

            width = block.get("width")
            if width and doc_model._num(width, 0) > content_width:
                self.add(
                    "content.outside_canvas",
                    "warning",
                    "content",
                    f"An element is {int(doc_model._num(width, 0))}px wide, wider than the {content_width}px canvas.",
                    expected="Reduce the element width or increase the email content width.",
                    node_id=block.get("id"),
                    element=element,
                )

    # ── personalization (19.3) ───────────────────────────────────────────────

    def check_personalization(self) -> None:
        definitions = {d.get("key"): d for d in self.ctx.merge_field_definitions if d.get("key")}
        used: set[str] = set()

        haystacks: list[tuple[str, Optional[str]]] = [
            (self.ctx.subject or "", "subject"),
            (self.ctx.preheader or "", "preheader"),
        ]
        if self.source:
            haystacks.append((self.source, "source"))
        else:
            haystacks.append((self.compiled, None))

        for text, origin in haystacks:
            for match in MERGE_TOKEN_RE.finditer(text):
                key = match.group(1).strip()
                filters = match.group(2) or ""
                used.add(key)
                line = column = None
                if origin == "source":
                    line, column = _line_col(self.source, match.start())
                if key not in definitions and key not in SYSTEM_MERGE_KEYS:
                    self.add(
                        "personalization.unknown_field",
                        "error",
                        "personalization",
                        f"Merge field '{key}' is not declared for this template.",
                        expected="Declare the field or correct the field key.",
                        line=line,
                        column=column,
                    )
                if filters:
                    for piece in filters.lstrip("|").split("|"):
                        name = piece.strip().split(":")[0].strip()
                        if name and name not in ("default", "format", "upper", "lower", "title", "trim"):
                            self.add(
                                "personalization.invalid_format",
                                "error",
                                "personalization",
                                f"Merge filter '{name}' is not supported.",
                                expected="Use default, format, upper, lower, title or trim.",
                                line=line,
                                column=column,
                            )
                        if name == "default" and ":" not in piece:
                            self.add(
                                "personalization.invalid_syntax",
                                "error",
                                "personalization",
                                "The default filter requires a value, for example: default: \"Customer\".",
                                expected='Write {{ field | default: "value" }}.',
                                line=line,
                                column=column,
                            )

        # Unbalanced braces
        for text, origin in haystacks:
            opens = len(re.findall(r"\{\{", text))
            closes = len(re.findall(r"\}\}", text))
            if opens != closes:
                self.add(
                    "personalization.invalid_syntax",
                    "error",
                    "personalization",
                    "Merge field braces are unbalanced.",
                    expected="Every {{ must be closed by }}.",
                )
                break

        for key, definition in definitions.items():
            if definition.get("required"):
                mapped = key in self.ctx.mapped_field_keys
                has_default = bool(definition.get("default_value"))
                if not mapped and not has_default:
                    self.add(
                        "personalization.required_unmapped",
                        "blocker",
                        "personalization",
                        f"Required field '{definition.get('label') or key}' is not mapped and has no default.",
                        expected="Map the field to a column or static value, or set a template default.",
                    )
                elif not mapped and has_default:
                    self.add(
                        "personalization.required_using_default",
                        "warning",
                        "personalization",
                        f"Required field '{definition.get('label') or key}' falls back to its template default for every recipient.",
                        expected="Map the field to uploaded data if per-recipient values are expected.",
                    )
                elif not has_default:
                    self.add(
                        "personalization.missing_default",
                        "info",
                        "personalization",
                        f"Required field '{definition.get('label') or key}' has no default value.",
                        expected="Add a default so recipients with missing data still receive valid content.",
                    )
            if key in used and definition.get("data_type") == "url":
                if re.search(rf'href\s*=\s*["\'][^"\']*\{{\{{\s*{re.escape(key)}\b[^}}]*\}}\}}', self.compiled):
                    self.add(
                        "personalization.url_encoding",
                        "warning",
                        "personalization",
                        f"URL field '{key}' is used inside a link without explicit encoding.",
                        expected="Ensure the stored value is a complete, encoded URL.",
                    )

        for key, count in (self.ctx.missing_value_counts or {}).items():
            if count:
                definition = definitions.get(key) or {}
                severity = "error" if definition.get("required") else "warning"
                self.add(
                    "personalization.missing_values",
                    severity,
                    "personalization",
                    f"{count} recipient(s) have no value for '{definition.get('label') or key}'.",
                    expected="Provide data, a campaign value, or a default.",
                )
        for key, count in (self.ctx.invalid_value_counts or {}).items():
            if count:
                definition = definitions.get(key) or {}
                self.add(
                    "personalization.type_mismatch",
                    "error",
                    "personalization",
                    f"{count} recipient(s) have a value for '{definition.get('label') or key}' that is not a valid {definition.get('data_type', 'value')}.",
                    expected="Correct the uploaded data or relax the field type.",
                )

        declared_unused = [key for key in definitions if key not in used]
        if declared_unused:
            self.add(
                "personalization.declared_unused",
                "info",
                "personalization",
                f"{len(declared_unused)} declared field(s) are not used in this email: {', '.join(sorted(declared_unused)[:6])}.",
                expected="Remove unused fields or insert them where needed.",
            )

    # ── accessibility (19.4) ─────────────────────────────────────────────────

    def check_accessibility(self) -> None:
        document = self.ctx.document
        settings = (document or {}).get("settings") or {}
        if document is not None and not (settings.get("lang") or "").strip():
            self.add(
                "a11y.missing_lang",
                "warning",
                "accessibility",
                "The document language is not set.",
                expected="Set a language in document properties.",
            )
        elif document is None and not re.search(r"<html[^>]+lang=", self.compiled, re.IGNORECASE):
            self.add(
                "a11y.missing_lang",
                "warning",
                "accessibility",
                "The <html> element has no lang attribute.",
                expected='Add lang="en" (or the correct language) to the html element.',
            )

        # Images
        if document:
            for block, _section, _row, _column in doc_model.iter_blocks(document):
                element = doc_model.describe_block(document, block.get("id", ""))
                if block.get("type") in ("image", "logo", "videoThumb"):
                    src = block.get("src") or block.get("thumbnailUrl") or ""
                    alt = (block.get("alt") or "").strip()
                    if src and not alt:
                        meaningful = bool(block.get("link")) or block.get("type") != "image"
                        self.add(
                            "a11y.image_missing_alt",
                            "error" if meaningful else "warning",
                            "accessibility",
                            "An image has no alternative text.",
                            expected="Describe the image, or mark it decorative with empty alt text intentionally.",
                            node_id=block.get("id"),
                            element=element,
                        )
                if block.get("type") == "table" and not block.get("headerRow"):
                    self.add(
                        "a11y.table_missing_header",
                        "warning",
                        "accessibility",
                        "A data table has no header row.",
                        expected="Enable the header row so screen readers can announce columns.",
                        node_id=block.get("id"),
                        element=element,
                    )
                self._check_block_contrast(block, element)
        else:
            for match in re.finditer(r"<img\b[^>]*>", self.compiled, re.IGNORECASE):
                tag = match.group(0)
                if not re.search(r"\balt\s*=", tag, re.IGNORECASE):
                    line, column = _line_col(self.source or self.compiled, match.start())
                    self.add(
                        "a11y.image_missing_alt",
                        "error",
                        "accessibility",
                        "An image has no alt attribute.",
                        expected='Add alt="..." to every image.',
                        line=line if self.source else None,
                        column=column if self.source else None,
                    )

        # Heading order
        levels: list[tuple[int, Optional[str]]] = []
        if document:
            for block, *_ in doc_model.iter_blocks(document):
                if block.get("type") == "heading":
                    levels.append((int(block.get("level", 2)), block.get("id")))
        else:
            for match in re.finditer(r"<h([1-6])\b", self.compiled, re.IGNORECASE):
                levels.append((int(match.group(1)), None))
        previous = 0
        for level, node_id in levels:
            if previous and level > previous + 1:
                self.add(
                    "a11y.heading_order",
                    "warning",
                    "accessibility",
                    f"Heading level jumps from h{previous} to h{level}.",
                    expected="Use heading levels in order without skipping.",
                    node_id=node_id,
                )
            previous = level

        # Links
        for match in re.finditer(r"<a\b([^>]*)>(.*?)</a>", self.compiled, re.IGNORECASE | re.DOTALL):
            attrs, inner = match.group(1), match.group(2)
            text = doc_model.strip_html(inner).lower()
            has_image = "<img" in inner.lower()
            aria = re.search(r"aria-label\s*=\s*[\"']([^\"']*)", attrs, re.IGNORECASE)
            if not text and not has_image and not aria:
                self.add(
                    "a11y.empty_link",
                    "error",
                    "accessibility",
                    "A link has no visible text or accessible label.",
                    expected="Add link text or an aria-label.",
                )
            elif text in NON_DESCRIPTIVE_LINK_TEXT:
                self.add(
                    "a11y.non_descriptive_link",
                    "info",
                    "accessibility",
                    f"Link text '{text}' does not describe its destination.",
                    expected="Use text that says where the link goes.",
                )

        # Small text. Hidden elements (preheader, spacers) legitimately use 0-1px.
        for attr in re.finditer(r'style\s*=\s*"([^"]*)"', self.compiled, re.IGNORECASE):
            declarations = attr.group(1).lower()
            if "display:none" in declarations.replace(" ", "") or "mso-hide" in declarations:
                continue
            if "line-height:0" in declarations.replace(" ", ""):
                continue
            size_match = re.search(r"font-size\s*:\s*(\d+(?:\.\d+)?)px", declarations)
            if not size_match:
                continue
            size = float(size_match.group(1))
            if 0 < size < 12:
                self.add(
                    "a11y.small_text",
                    "warning",
                    "accessibility",
                    f"Text is set to {size_match.group(1)}px, which is hard to read.",
                    expected="Use at least 12px, ideally 14px or more.",
                )
                break

    def _resolve_block_background(self, block: dict) -> str:
        background = block.get("background") or {}
        if background.get("mode") == "color" and background.get("color"):
            return background["color"]
        settings = (self.ctx.document or {}).get("settings") or {}
        doc_bg = settings.get("background") or {}
        if doc_bg.get("mode") == "color" and doc_bg.get("color"):
            return doc_bg["color"]
        return self.tokens["contentBackground"]

    def _check_block_contrast(self, block: dict, element: str) -> None:
        block_type = block.get("type")
        background = self._resolve_block_background(block)
        if block_type == "button":
            fg = block.get("textColor") or self.tokens["buttonTextColor"]
            bg = block.get("backgroundColor") or self.tokens["buttonBackground"]
            ratio = contrast_ratio(fg, bg)
            if ratio is not None and ratio < 4.5:
                self.add(
                    "a11y.low_button_contrast",
                    "warning",
                    "accessibility",
                    f"Button text contrast is {ratio:.1f}:1 against its background.",
                    expected="Use at least 4.5:1 for button labels.",
                    node_id=block.get("id"),
                    element=element,
                )
            return
        if block_type not in ("text", "heading", "quote", "list", "signature", "preformatted", "mergeField"):
            return
        style = block.get("style") or {}
        if block_type == "heading":
            fg = style.get("color") or self.tokens["headingColor"]
            size = style.get("fontSize") or heading_size(self.tokens, int(block.get("level", 2)))
        else:
            fg = style.get("color") or self.tokens["bodyTextColor"]
            size = style.get("fontSize") or self.tokens["bodyFontSize"]
        ratio = contrast_ratio(fg, background)
        if ratio is None:
            return
        large = float(doc_model._num(size, 16)) >= 24 or (
            float(doc_model._num(size, 16)) >= 18.66 and int(doc_model._num(style.get("fontWeight"), 400)) >= 700
        )
        threshold = 3.0 if large else 4.5
        if ratio < threshold:
            self.add(
                "a11y.low_text_contrast",
                "warning",
                "accessibility",
                f"Text contrast is {ratio:.1f}:1, below the {threshold:.1f}:1 minimum.",
                expected="Darken the text or lighten the background.",
                node_id=block.get("id"),
                element=element,
            )

    # ── compatibility (19.5) ─────────────────────────────────────────────────

    def check_compatibility(self) -> None:
        haystack = self.source or self.compiled
        use_positions = bool(self.source)

        for tag in UNSUPPORTED_TAGS:
            for match in re.finditer(rf"<\s*{tag}\b", haystack, re.IGNORECASE):
                line, column = _line_col(haystack, match.start()) if use_positions else (None, None)
                self.add(
                    "compat.unsupported_tag",
                    "error",
                    "compatibility",
                    f"<{tag}> is not supported by email clients.",
                    expected="Remove the element or replace it with table-based markup.",
                    line=line,
                    column=column,
                    compatibility="Unsupported markup",
                )
                break

        risky_found: set[str] = set()
        for prop in ("position", "transform", "animation", "box-shadow", "text-shadow", "filter", "z-index", "object-fit"):
            match = re.search(rf"[^-a-z]{prop}\s*:", haystack, re.IGNORECASE)
            if match:
                risky_found.add(prop)
                line, column = _line_col(haystack, match.start()) if use_positions else (None, None)
                severity = "error" if prop == "position" and re.search(r"position\s*:\s*(absolute|fixed)", haystack, re.IGNORECASE) else "warning"
                self.add(
                    "compat.risky_css" if severity == "warning" else "compat.absolute_positioning",
                    severity,
                    "compatibility",
                    f"CSS '{prop}' has limited or no support in major email clients.",
                    expected="Use table layout, padding and inline styles instead.",
                    line=line,
                    column=column,
                    compatibility="Unsupported CSS",
                )
        for value in ("flex", "grid"):
            match = re.search(rf"display\s*:\s*(inline-)?{value}", haystack, re.IGNORECASE)
            if match:
                line, column = _line_col(haystack, match.start()) if use_positions else (None, None)
                self.add(
                    "compat.unsupported_css",
                    "error",
                    "compatibility",
                    f"display:{value} does not render in Outlook and several other clients.",
                    expected="Rebuild the layout with rows and columns.",
                    line=line,
                    column=column,
                    compatibility="Unsupported CSS",
                )

        if re.search(r"<style[^>]*>(?:(?!</style>).)*?[.#][a-z][\w-]*\s*[,{]", haystack, re.IGNORECASE | re.DOTALL):
            if not re.search(r"@media", haystack, re.IGNORECASE):
                self.add(
                    "compat.limited_selector",
                    "warning",
                    "compatibility",
                    "Class and id selectors in <style> are stripped by several clients.",
                    expected="Rely on inline styles; keep <style> for media queries only.",
                    compatibility="CSS support",
                )

        document = self.ctx.document
        if document:
            settings = document.get("settings") or {}
            width = doc_model._num(settings.get("contentWidth"), 640)
            if width > 700:
                self.add(
                    "compat.excessive_width",
                    "warning",
                    "compatibility",
                    f"The content width is {int(width)}px; above 700px many clients scroll horizontally.",
                    expected="Use 600-640px for the best compatibility.",
                    compatibility="Layout",
                )
            for block, section, row, _column in doc_model.iter_blocks(document):
                element = doc_model.describe_block(document, block.get("id", ""))
                if block.get("type") == "image":
                    if block.get("src") and not block.get("width"):
                        self.add(
                            "compat.image_missing_dimensions",
                            "warning",
                            "compatibility",
                            "An image has no explicit width.",
                            expected="Set a width so clients reserve the right space before loading.",
                            node_id=block.get("id"),
                            element=element,
                            compatibility="Images",
                        )
                background = block.get("background") or {}
                if background.get("mode") == "image" and not background.get("fallbackColor"):
                    self.add(
                        "compat.background_image_risk",
                        "warning",
                        "compatibility",
                        "A background image has no fallback colour.",
                        expected="Set a fallback colour for clients that drop background images.",
                        node_id=block.get("id"),
                        element=element,
                        compatibility="Backgrounds",
                    )
                style = block.get("style") or {}
                family = (style.get("fontFamily") or "").lower()
                if family and not any(safe in family for safe in WEB_SAFE_FAMILIES):
                    self.add(
                        "compat.webfont_without_fallback",
                        "warning",
                        "compatibility",
                        f"Font stack '{style.get('fontFamily')}' has no email-safe fallback.",
                        expected="Append a generic family such as Arial, Helvetica, sans-serif.",
                        node_id=block.get("id"),
                        element=element,
                        compatibility="Fonts",
                    )

            for section in document.get("sections") or []:
                for row in section.get("rows") or []:
                    columns = row.get("columns") or []
                    if len(columns) >= 3 and not row.get("stackOnMobile"):
                        self.add(
                            "compat.mobile_layout_risk",
                            "warning",
                            "compatibility",
                            f"A row with {len(columns)} columns does not stack on mobile.",
                            expected="Enable mobile stacking or reduce the column count.",
                            node_id=row.get("id"),
                            element="Row",
                            compatibility="Layout",
                        )
                    if any(c.get("keepSideBySideOnMobile") for c in columns) and len(columns) > 2:
                        self.add(
                            "compat.mobile_layout_risk",
                            "warning",
                            "compatibility",
                            "More than two columns are kept side by side on mobile.",
                            expected="Keep at most two columns side by side on small screens.",
                            node_id=row.get("id"),
                            element="Row",
                            compatibility="Layout",
                        )

        if re.search(r"<table\b[^>]*>\s*<(?!thead|tbody|tfoot|tr|caption|colgroup)", haystack, re.IGNORECASE):
            self.add(
                "compat.invalid_table_nesting",
                "warning",
                "compatibility",
                "A table contains an element other than a row directly inside it.",
                expected="Place <tr> elements (or tbody/thead) directly inside <table>.",
                compatibility="Tables",
            )

    # ── delivery (19.6) ──────────────────────────────────────────────────────

    def check_delivery(self) -> None:
        size_kb = len(self.compiled.encode("utf-8")) / 1024
        limit = float(self.settings.get("max_html_size_kb", 102) or 102)
        if size_kb > limit:
            self.add(
                "delivery.html_too_large",
                "error" if size_kb > limit * 1.5 else "warning",
                "delivery",
                f"The compiled HTML is {size_kb:.0f}KB; Gmail clips messages above about {limit:.0f}KB.",
                expected="Reduce inline content, shorten the email, or move content to a landing page.",
            )

        urls = re.findall(r'(?:src|background)\s*=\s*["\']([^"\']+)["\']', self.compiled, re.IGNORECASE)
        external = [u for u in urls if u.startswith("http://") or u.startswith("https://")]
        max_external = int(self.settings.get("max_external_resources", 30) or 30)
        if len(external) > max_external:
            self.add(
                "delivery.too_many_resources",
                "warning",
                "delivery",
                f"The email references {len(external)} external resources (limit {max_external}).",
                expected="Combine or remove images to reduce load failures.",
            )
        for url in urls:
            if url.startswith("http://"):
                self.add(
                    "delivery.insecure_resource",
                    "error",
                    "delivery",
                    f"Resource '{url[:70]}' is loaded over plain HTTP.",
                    expected="Serve all assets over HTTPS.",
                )
                break
        for url in urls:
            if url.startswith("data:image/"):
                encoded = url.split(",", 1)[-1]
                if len(encoded) / 1024 > 40:
                    self.add(
                        "delivery.embedded_image_too_large",
                        "warning",
                        "delivery",
                        "An embedded (data URL) image is larger than 40KB.",
                        expected="Upload the image to the asset library and link to it instead.",
                    )
                    break
            elif not url.startswith("http") and not url.startswith("cid:") and not url.startswith("{{"):
                self.add(
                    "delivery.broken_image_url",
                    "error",
                    "delivery",
                    f"Resource '{url[:70]}' is not an absolute URL and will not load in email clients.",
                    expected="Use a full https:// URL.",
                )
                break

        if self.ctx.attachment_count:
            max_count = int(self.settings.get("max_attachment_count", 5) or 5)
            max_total = float(self.settings.get("max_total_attachment_size_kb", 20480) or 20480)
            if self.ctx.attachment_count > max_count:
                self.add(
                    "delivery.attachment_count",
                    "error",
                    "delivery",
                    f"{self.ctx.attachment_count} attachments exceed the limit of {max_count}.",
                    expected="Remove attachments or link to the files instead.",
                )
            if self.ctx.attachment_total_kb > max_total:
                self.add(
                    "delivery.attachment_size",
                    "error",
                    "delivery",
                    f"Attachments total {self.ctx.attachment_total_kb}KB, above the {max_total:.0f}KB limit.",
                    expected="Compress or remove attachments.",
                )

    # ── compliance (19.6/19.2) ───────────────────────────────────────────────

    def check_compliance(self) -> None:
        body = self.compiled
        if self.settings.get("require_unsubscribe", True):
            if "{{unsubscribe_url}}" not in body and not re.search(r"unsubscribe", body, re.IGNORECASE):
                self.add(
                    "compliance.missing_unsubscribe",
                    "blocker",
                    "compliance",
                    "The email has no unsubscribe link.",
                    expected="Add the unsubscribe block or an {{unsubscribe_url}} link.",
                )
        if self.settings.get("require_organization_address", False):
            has_address = False
            if self.ctx.document:
                for block, *_ in doc_model.iter_blocks(self.ctx.document):
                    if block.get("type") == "contactInfo":
                        has_address = True
                        break
            brand = (self.tokens.get("brand") or {}).get("organizationAddress")
            if not has_address and not brand:
                self.add(
                    "compliance.missing_address",
                    "error",
                    "compliance",
                    "The organization postal address is missing.",
                    expected="Add a contact information block or set the address in the theme.",
                )
        if self.settings.get("require_view_in_browser", False):
            if "{{view_in_browser_url}}" not in body:
                self.add(
                    "compliance.missing_view_in_browser",
                    "warning",
                    "compliance",
                    "No view-in-browser link is present.",
                    expected="Add the view-in-browser block.",
                )

    # ── html structure (14.5) ────────────────────────────────────────────────

    def check_html(self) -> None:
        haystack = self.source or self.compiled
        use_positions = bool(self.source)

        if self.ctx.kind == "custom_html" and self.source:
            for required, label in (("<html", "<html>"), ("<body", "<body>")):
                if required not in self.source.lower():
                    self.add(
                        "html.missing_element",
                        "error",
                        "html",
                        f"The document is missing {label}.",
                        expected="Wrap the markup in a complete HTML document.",
                    )
            if "<!doctype" not in self.source.lower():
                self.add(
                    "html.missing_doctype",
                    "warning",
                    "html",
                    "The document has no DOCTYPE declaration.",
                    expected="Start the document with <!DOCTYPE html>.",
                )

        void_tags = {
            "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
            "meta", "param", "source", "track", "wbr",
        }
        stack: list[tuple[str, int]] = []
        reported_nesting = False
        for match in re.finditer(r"<\s*(/?)\s*([a-zA-Z][a-zA-Z0-9:-]*)([^>]*?)(/?)\s*>", haystack):
            closing, tag, attrs, self_closing = match.group(1), match.group(2).lower(), match.group(3), match.group(4)
            if tag == "tr" and not closing and not reported_nesting:
                open_tags = {name for name, _pos in stack}
                if not open_tags & {"table", "thead", "tbody", "tfoot"}:
                    reported_nesting = True
                    line, column = _line_col(haystack, match.start()) if use_positions else (None, None)
                    self.add(
                        "html.invalid_nesting",
                        "warning",
                        "html",
                        "A <tr> element appears outside a table.",
                        expected="Place rows inside a table.",
                        line=line,
                        column=column,
                    )
            if tag in void_tags or self_closing == "/":
                continue
            if closing:
                for index in range(len(stack) - 1, -1, -1):
                    if stack[index][0] == tag:
                        del stack[index:]
                        break
                else:
                    line, column = _line_col(haystack, match.start()) if use_positions else (None, None)
                    self.add(
                        "html.stray_close_tag",
                        "error",
                        "html",
                        f"Closing tag </{tag}> has no matching opening tag.",
                        expected="Remove the stray closing tag.",
                        line=line,
                        column=column,
                    )
            else:
                stack.append((tag, match.start()))

        for tag, position in stack[:5]:
            line, column = _line_col(haystack, position) if use_positions else (None, None)
            self.add(
                "html.unclosed_tag",
                "error",
                "html",
                f"<{tag}> is never closed.",
                expected=f"Add a matching </{tag}>.",
                line=line,
                column=column,
            )

        ids: dict[str, int] = {}
        for match in re.finditer(r'\sid\s*=\s*["\']([^"\']+)["\']', haystack, re.IGNORECASE):
            value = match.group(1)
            ids[value] = ids.get(value, 0) + 1
            if ids[value] == 2:
                line, column = _line_col(haystack, match.start()) if use_positions else (None, None)
                self.add(
                    "html.duplicate_id",
                    "warning",
                    "html",
                    f"The id '{value}' is used more than once.",
                    expected="Make ids unique.",
                    line=line,
                    column=column,
                )

    # ── links (11) ───────────────────────────────────────────────────────────

    def check_links(self) -> None:
        haystack = self.source or self.compiled
        use_positions = bool(self.source)
        seen: set[str] = set()
        for match in re.finditer(r'<a\b[^>]*href\s*=\s*(["\'])(.*?)\1', haystack, re.IGNORECASE | re.DOTALL):
            href = match.group(2).strip()
            line, column = _line_col(haystack, match.start()) if use_positions else (None, None)
            key = href[:120]
            if key in seen:
                continue
            seen.add(key)
            if not href or href == "#":
                self.add(
                    "links.empty_url",
                    "error",
                    "links",
                    "A link has no destination.",
                    expected="Set a URL or remove the link.",
                    line=line,
                    column=column,
                )
                continue
            if href.startswith("{{"):
                continue
            if re.search(r"\s", href) and not href.startswith("mailto:"):
                self.add(
                    "links.malformed_url",
                    "error",
                    "links",
                    f"URL '{href[:60]}' contains whitespace.",
                    expected="Remove spaces or encode them as %20.",
                    line=line,
                    column=column,
                )
            scheme_match = re.match(r"^([a-zA-Z][a-zA-Z0-9+.-]*):", href)
            if scheme_match:
                scheme = scheme_match.group(1).lower()
                if scheme not in ("http", "https", "mailto", "tel", "cid"):
                    self.add(
                        "links.unsupported_protocol",
                        "error",
                        "links",
                        f"Protocol '{scheme}:' is not allowed in email links.",
                        expected="Use https, mailto or tel.",
                        line=line,
                        column=column,
                    )
                elif scheme == "http":
                    self.add(
                        "links.insecure_http",
                        "warning",
                        "links",
                        f"Link '{href[:60]}' uses plain HTTP.",
                        expected="Use https where available.",
                        line=line,
                        column=column,
                    )
            elif not href.startswith("#") and not href.startswith("/"):
                self.add(
                    "links.malformed_url",
                    "warning",
                    "links",
                    f"URL '{href[:60]}' has no protocol.",
                    expected="Use a full URL starting with https://.",
                    line=line,
                    column=column,
                )

    # ── security (19.7) ──────────────────────────────────────────────────────

    def check_security(self) -> None:
        haystack = self.source or self.compiled
        use_positions = bool(self.source)

        checks = (
            (r"<\s*script\b", "security.script_element", "A <script> element is present.", "Remove all scripts; email clients block them and they are a security risk."),
            (r"<\s*iframe\b", "security.iframe_element", "An <iframe> is present.", "Remove the iframe."),
            (r"<\s*form\b", "security.form_element", "A <form> element is present.", "Remove the form and link to a hosted page instead."),
            (r"<\s*(object|embed|applet)\b", "security.object_embed", "An object/embed element is present.", "Remove embedded objects."),
            (r"\son[a-z]+\s*=", "security.event_handler", "An inline event handler attribute is present.", "Remove on* attributes."),
            (r"javascript\s*:", "security.unsafe_url", "A javascript: URL is present.", "Use a normal https URL."),
            (r"vbscript\s*:", "security.unsafe_url", "A vbscript: URL is present.", "Use a normal https URL."),
            (r"@import", "security.external_stylesheet", "An @import rule is present.", "Inline the styles instead."),
            (r"<\s*link\b[^>]*rel\s*=\s*[\"']?stylesheet", "security.external_stylesheet", "An external stylesheet is linked.", "Inline the styles instead."),
            (r"expression\s*\(", "security.risky_css", "A CSS expression() is present.", "Remove the expression."),
            (r"data:text/html", "security.unsafe_url", "A data:text/html URL is present.", "Remove the data URL."),
        )
        for pattern, code, message, expected in checks:
            match = re.search(pattern, haystack, re.IGNORECASE)
            if match:
                line, column = _line_col(haystack, match.start()) if use_positions else (None, None)
                self.add(
                    code,
                    "blocker",
                    "security",
                    message,
                    expected=expected,
                    line=line,
                    column=column,
                )

        # Merge fields must not be able to inject markup.
        if not self.settings.get("allow_raw_html_merge_fields", False):
            for match in re.finditer(r"\{\{\s*([^}|]+?)\s*(\|[^}]*)?\}\}", haystack):
                filters = (match.group(2) or "").lower()
                if "raw" in filters or "safe" in filters:
                    line, column = _line_col(haystack, match.start()) if use_positions else (None, None)
                    self.add(
                        "security.merge_injection",
                        "blocker",
                        "security",
                        f"Merge field '{match.group(1).strip()}' requests raw HTML output.",
                        expected="Raw HTML merge fields require administrator permission.",
                        line=line,
                        column=column,
                    )


def summarize(issues: Iterable[dict]) -> dict:
    summary = {"blockers": 0, "errors": 0, "warnings": 0, "info": 0, "passed": True}
    for issue in issues:
        severity = issue.get("severity")
        if severity == "blocker":
            summary["blockers"] += 1
        elif severity == "error":
            summary["errors"] += 1
        elif severity == "warning":
            summary["warnings"] += 1
        else:
            summary["info"] += 1
    summary["passed"] = summary["blockers"] == 0 and summary["errors"] == 0
    return summary


def resolve_gates(summary: dict, settings: dict) -> dict:
    gates = (settings or {}).get("validation_gates") or DEFAULT_SETTINGS["validation_gates"]
    resolved: dict[str, bool] = {}
    for gate in GATE_NAMES:
        rules = gates.get(gate) or {}
        resolved[gate] = bool(
            (rules.get("blocker") and summary["blockers"])
            or (rules.get("error") and summary["errors"])
            or (rules.get("warning") and summary["warnings"])
        )
    return resolved


def validate(ctx: ValidationContext) -> dict:
    """Run every rule and return a serialized validation report."""
    issues = [issue.to_dict() for issue in Validator(ctx).run()]
    order = {"blocker": 0, "error": 1, "warning": 2, "info": 3}
    issues.sort(key=lambda i: (order.get(i["severity"], 9), i.get("line") or 0, i["code"]))
    summary = summarize(issues)
    return {
        "issues": issues,
        "summary": summary,
        "blocks": resolve_gates(summary, ctx.settings or {}),
    }
