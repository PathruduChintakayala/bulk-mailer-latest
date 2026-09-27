"""
The compile pipeline: document or HTML source -> sanitize -> inline CSS ->
compiled HTML + plain text + validation report.

Everything that previews, test-sends, publishes or sends goes through
`build_output` so the preview cannot drift from what is delivered.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Optional

from app.services.composer import document as doc_model
from app.services.composer.compiler import compile_document
from app.services.composer.inline import inline_css
from app.services.composer.plaintext import generate_plain_text
from app.services.composer.sanitize import sanitize_html, sanitizer_available
from app.services.composer.settings import DEFAULT_SETTINGS, sanitizer_allowlists
from app.services.composer.theme import resolve_tokens
from app.services.composer.validate import ValidationContext, validate

_DOCTYPE_RE = re.compile(r"^\s*<!DOCTYPE[^>]*>", re.IGNORECASE)


@dataclass
class BuildResult:
    compiled_html: str
    plain_text: str
    warnings: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)
    validation: dict = field(default_factory=dict)
    sanitized: bool = True
    inlined: bool = False
    auto_appended: list[str] = field(default_factory=list)
    size_bytes: int = 0

    def to_dict(self) -> dict:
        return {
            "compiled_html": self.compiled_html,
            "plain_text": self.plain_text,
            "warnings": self.warnings,
            "removed": self.removed,
            "validation": self.validation,
            "sanitized": self.sanitized,
            "inlined": self.inlined,
            "auto_appended": self.auto_appended,
            "size_bytes": self.size_bytes,
        }


def _sanitize_document_source(html: str, allowlists: dict[str, Any]) -> tuple[str, list[str]]:
    """Sanitize a full HTML document while preserving the DOCTYPE."""
    source = html or ""
    doctype = ""
    match = _DOCTYPE_RE.match(source)
    if match:
        doctype = match.group(0).strip()
        source = source[match.end():]
    result = sanitize_html(source, strip_comments=False, **allowlists)
    combined = f"{doctype}\n{result.html}" if doctype else result.html
    return combined, result.removed


def build_output(
    *,
    kind: str,
    document: Optional[dict] = None,
    html_source: Optional[str] = None,
    subject: str = "",
    preheader: str = "",
    theme_tokens: Optional[dict] = None,
    org_settings: Optional[dict] = None,
    reusable: Optional[dict[str, Any]] = None,
    merge_field_definitions: Optional[list[dict]] = None,
    mapped_field_keys: Optional[set[str]] = None,
    missing_value_counts: Optional[dict[str, int]] = None,
    invalid_value_counts: Optional[dict[str, int]] = None,
    plain_text_override: Optional[str] = None,
    plain_text_mode: str = "generated",
    attachment_total_kb: int = 0,
    attachment_count: int = 0,
    run_validation: bool = True,
) -> BuildResult:
    settings = org_settings or dict(DEFAULT_SETTINGS)
    allowlists = sanitizer_allowlists(settings)
    tokens = resolve_tokens(theme_tokens, (document or {}).get("themeOverrides"))
    warnings: list[str] = []
    removed: list[str] = []
    auto_appended: list[str] = []

    if kind == "custom_html":
        compiled, removed = _sanitize_document_source(html_source or "", allowlists)
        if removed:
            warnings.append("Unsupported or unsafe markup was removed during compilation.")
        normalized_document = None
    else:
        normalized_document = doc_model.normalize_document(document or {})
        result = compile_document(
            normalized_document,
            tokens=tokens,
            subject=subject,
            preheader=preheader,
            org_settings=settings,
            reusable=reusable,
        )
        compiled = result.html
        warnings.extend(result.warnings)
        auto_appended = result.auto_appended

    if not sanitizer_available():
        warnings.append(
            "The HTML sanitizer library is not installed on the server; a reduced fallback was used."
        )

    inline_result = inline_css(compiled, keep_style_tags=True)
    if inline_result.warning:
        warnings.append(inline_result.warning)
    compiled = inline_result.html

    if plain_text_override is not None and plain_text_mode == "manual":
        plain_text = plain_text_override
    else:
        plain_text = generate_plain_text(compiled, preheader=preheader)

    validation: dict = {}
    if run_validation:
        validation = validate(
            ValidationContext(
                document=normalized_document,
                html_source=html_source if kind == "custom_html" else None,
                compiled_html=compiled,
                plain_text=plain_text,
                subject=subject,
                preheader=preheader,
                kind=kind,
                tokens=theme_tokens or {},
                settings=settings,
                merge_field_definitions=merge_field_definitions or [],
                mapped_field_keys=mapped_field_keys or set(),
                missing_value_counts=missing_value_counts or {},
                invalid_value_counts=invalid_value_counts or {},
                attachment_total_kb=attachment_total_kb,
                attachment_count=attachment_count,
                plain_text_mode=plain_text_mode,
            )
        )

    return BuildResult(
        compiled_html=compiled,
        plain_text=plain_text,
        warnings=[w for w in dict.fromkeys(warnings)],
        removed=removed,
        validation=validation,
        sanitized=sanitizer_available(),
        inlined=inline_result.inlined,
        auto_appended=auto_appended,
        size_bytes=len(compiled.encode("utf-8")),
    )
