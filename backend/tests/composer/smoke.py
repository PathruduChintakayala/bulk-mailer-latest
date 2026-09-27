"""Ad-hoc smoke run for the compile + validation pipeline (not a pytest module)."""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from app.services.composer.pipeline import build_output
from app.services.composer.settings import DEFAULT_SETTINGS
from app.services.composer.theme import DEFAULT_THEME_TOKENS

FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")

FIELDS = [
    {"key": "first_name", "label": "First name", "data_type": "text", "required": True, "default_value": "there"},
    {"key": "plan_price", "label": "Plan price", "data_type": "number"},
]

BAD_HTML = (
    '<html><body><div style="position:absolute;width:900px">'
    "<script>alert(1)</script>"
    '<a href="javascript:alert(1)">click here</a>'
    '<img src="http://insecure.example.com/y.png">'
    "<form><input></form>"
    '<iframe src="https://x"></iframe>'
    "<p>Hello {{ unknown_field }} and {{ first_name | default }}</p>"
    "<div><span>unclosed"
)


def main() -> int:
    with open(os.path.join(FIXTURES, "starter.document.json"), encoding="utf-8") as handle:
        document = json.load(handle)

    good = build_output(
        kind="visual",
        document=document,
        subject="Welcome",
        preheader="Start here",
        theme_tokens=dict(DEFAULT_THEME_TOKENS),
        org_settings=dict(DEFAULT_SETTINGS),
        merge_field_definitions=FIELDS,
    )
    print("visual summary:", good.validation["summary"])
    for issue in good.validation["issues"]:
        print("  ", issue["severity"], issue["code"], "|", issue["message"][:80])
    print("plain text:")
    print(good.plain_text[:240])

    print("\n=== unsafe custom html ===")
    bad = build_output(
        kind="custom_html",
        html_source=BAD_HTML,
        subject="",
        preheader="",
        org_settings=dict(DEFAULT_SETTINGS),
        merge_field_definitions=FIELDS,
    )
    print("summary:", bad.validation["summary"], "blocks:", bad.validation["blocks"])
    for issue in bad.validation["issues"]:
        print("  ", issue["severity"], issue["code"], "line", issue["line"], "|", issue["message"][:70])
    lowered = bad.compiled_html.lower()
    print("script stripped:", "<script" not in lowered)
    print("js url stripped:", "javascript:" not in lowered)
    print("iframe stripped:", "<iframe" not in lowered)
    print("form stripped:", "<form" not in lowered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
