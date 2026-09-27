"""
Plain-text generation.

Merge tokens must survive untouched, links become readable URLs, and decorative
markup is dropped while heading/list structure is preserved.
"""
from __future__ import annotations

import html as html_module
import re
from typing import Optional

_MERGE_TOKEN_RE = re.compile(r"\{\{.*?\}\}", re.DOTALL)
_BLOCK_END_TAGS = (
    "p", "div", "tr", "table", "h1", "h2", "h3", "h4", "h5", "h6",
    "li", "ul", "ol", "blockquote", "pre", "section", "header", "footer",
)


def _protect_merge_tokens(html: str) -> tuple[str, list[str]]:
    tokens: list[str] = []

    def replace(match: re.Match[str]) -> str:
        tokens.append(match.group(0))
        return f"\x00MERGE{len(tokens) - 1}\x00"

    return _MERGE_TOKEN_RE.sub(replace, html or ""), tokens


def _restore_merge_tokens(text: str, tokens: list[str]) -> str:
    for index, token in enumerate(tokens):
        text = text.replace(f"\x00MERGE{index}\x00", token)
    return text


def html_to_text(html: str, *, include_link_urls: bool = True) -> str:
    """Convert HTML into readable plain text without touching merge tokens."""
    source, tokens = _protect_merge_tokens(html or "")

    # Drop non-content elements entirely.
    source = re.sub(r"<(script|style|head|title)\b[^>]*>.*?</\1>", "", source, flags=re.IGNORECASE | re.DOTALL)
    source = re.sub(r"<!--.*?-->", "", source, flags=re.DOTALL)

    # Preheader and other hidden containers should not appear in the text part.
    source = re.sub(
        r"<div[^>]*style=\"[^\"]*display\s*:\s*none[^\"]*\"[^>]*>.*?</div>",
        "",
        source,
        flags=re.IGNORECASE | re.DOTALL,
    )

    # Headings become underlined lines.
    def heading(match: re.Match[str]) -> str:
        return f"\n\n{match.group(2).strip()}\n"

    source = re.sub(r"<h([1-6])[^>]*>(.*?)</h\1>", heading, source, flags=re.IGNORECASE | re.DOTALL)

    # List items become dashes.
    source = re.sub(r"<li[^>]*>", "\n- ", source, flags=re.IGNORECASE)

    # Links keep their target when it is a real URL.
    if include_link_urls:
        def anchor(match: re.Match[str]) -> str:
            href = (match.group(1) or "").strip()
            label = re.sub(r"<[^>]+>", "", match.group(2) or "").strip()
            label = html_module.unescape(label)
            if not href or href.startswith("#"):
                return label
            if href.startswith("mailto:"):
                target = href[7:]
                return label if label == target else f"{label} <{target}>"
            if label and label.rstrip("/") == href.rstrip("/"):
                return href
            return f"{label} <{href}>" if label else href

        source = re.sub(
            r"<a\b[^>]*href=[\"']([^\"']*)[\"'][^>]*>(.*?)</a>",
            anchor,
            source,
            flags=re.IGNORECASE | re.DOTALL,
        )

    # Images fall back to their alternative text.
    def image(match: re.Match[str]) -> str:
        alt_match = re.search(r"alt=[\"']([^\"']*)[\"']", match.group(0), re.IGNORECASE)
        alt = (alt_match.group(1) if alt_match else "").strip()
        return f"[{alt}]" if alt else ""

    source = re.sub(r"<img\b[^>]*>", image, source, flags=re.IGNORECASE)

    source = re.sub(r"<br\s*/?>", "\n", source, flags=re.IGNORECASE)
    source = re.sub(r"<hr\s*/?>", "\n----------\n", source, flags=re.IGNORECASE)
    for tag in _BLOCK_END_TAGS:
        source = re.sub(rf"</{tag}\s*>", "\n", source, flags=re.IGNORECASE)
    source = re.sub(r"<(td|th)\b[^>]*>", " ", source, flags=re.IGNORECASE)
    source = re.sub(r"</(td|th)\s*>", " ", source, flags=re.IGNORECASE)
    source = re.sub(r"<[^>]+>", "", source)

    text = html_module.unescape(source)
    text = text.replace("\u00a0", " ").replace("\u200c", "").replace("\u0347", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = _restore_merge_tokens(text, tokens)
    return text.strip()


def generate_plain_text(
    compiled_html: str,
    *,
    preheader: Optional[str] = None,
    footer: Optional[str] = None,
) -> str:
    body = html_to_text(compiled_html)
    parts = []
    if preheader and preheader.strip():
        parts.append(preheader.strip())
    if body:
        parts.append(body)
    if footer and footer.strip():
        parts.append(footer.strip())
    return "\n\n".join(parts).strip()
