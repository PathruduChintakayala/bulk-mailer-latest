"""
Golden fixtures: document.json -> expected.html.

Run directly (`python tests/composer/test_golden.py`) or via pytest. Pass
`--update` to regenerate the expected output after an intentional compiler change.
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from app.services.composer import document as doc_model  # noqa: E402
from app.services.composer.pipeline import build_output  # noqa: E402
from app.services.composer.settings import DEFAULT_SETTINGS  # noqa: E402
from app.services.composer.theme import DEFAULT_THEME_TOKENS  # noqa: E402

FIXTURE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
CASES = ["starter"]


def _load(name: str) -> dict:
    with open(os.path.join(FIXTURE_DIR, f"{name}.document.json"), encoding="utf-8") as handle:
        return json.load(handle)


def compile_fixture(name: str) -> str:
    document = _load(name)
    result = build_output(
        kind="visual",
        document=document,
        subject="Welcome to Example",
        preheader="Everything you need to get started",
        theme_tokens=dict(DEFAULT_THEME_TOKENS),
        org_settings={**DEFAULT_SETTINGS, "auto_append_compliance_footer": False},
        run_validation=False,
    )
    return result.compiled_html


def check(name: str, update: bool = False) -> bool:
    expected_path = os.path.join(FIXTURE_DIR, f"{name}.expected.html")
    actual = compile_fixture(name)
    if update or not os.path.exists(expected_path):
        with open(expected_path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(actual)
        print(f"[{name}] expected output written ({len(actual)} bytes)")
        return True
    with open(expected_path, encoding="utf-8") as handle:
        expected = handle.read()
    if expected.strip() == actual.strip():
        print(f"[{name}] matches golden output")
        return True
    print(f"[{name}] MISMATCH with golden output")
    for index, (a, b) in enumerate(zip(expected.splitlines(), actual.splitlines())):
        if a != b:
            print(f"  first difference at line {index + 1}")
            print(f"  expected: {a[:200]}")
            print(f"  actual  : {b[:200]}")
            break
    return False


def test_golden_documents():
    for name in CASES:
        assert check(name), f"{name} does not match its golden output"


def test_normalization_is_stable():
    """Normalizing twice must be a no-op, otherwise saves would churn."""
    document = _load("starter")
    once = doc_model.normalize_document(document)
    twice = doc_model.normalize_document(once)
    assert once == twice


def test_structure_is_preserved():
    document = doc_model.normalize_document(_load("starter"))
    assert len(document["sections"]) == 4
    blocks = [block["type"] for block, *_ in doc_model.iter_blocks(document)]
    assert "button" in blocks and "table" in blocks and "unsubscribe" in blocks
    assert not doc_model.document_is_empty(document)


def test_merge_tokens_survive_compilation():
    html = compile_fixture("starter")
    assert '{{ first_name | default: "there" }}' in html
    assert "{{unsubscribe_url}}" in html


def test_no_unsafe_content():
    html = compile_fixture("starter")
    lowered = html.lower()
    for forbidden in ("<script", "javascript:", "onclick=", "<iframe", "<form"):
        assert forbidden not in lowered


def main() -> int:
    update = "--update" in sys.argv
    ok = all(check(name, update) for name in CASES)
    try:
        test_normalization_is_stable()
        test_structure_is_preserved()
        test_merge_tokens_survive_compilation()
        test_no_unsafe_content()
        print("structural assertions passed")
    except AssertionError as exc:
        print(f"assertion failed: {exc}")
        ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
