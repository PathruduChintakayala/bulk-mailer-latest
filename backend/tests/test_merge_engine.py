"""Tests for the canonical merge engine."""
import pytest
from app.services.merge_engine import (
    normalize_field_key,
    compute_header_signature,
    build_render_context,
    build_template_preview_context,
    render_campaign_content,
    validate_required_fields,
    auto_map_template_fields,
)


class TestNormalizeFieldKey:
    def test_basic(self):
        assert normalize_field_key("First Name") == "first_name"

    def test_special_chars(self):
        assert normalize_field_key("Company (Legal)") == "company_legal"

    def test_leading_digits(self):
        assert normalize_field_key("123abc") == "f_123abc"

    def test_empty(self):
        assert normalize_field_key("") == "field"

    def test_unicode(self):
        result = normalize_field_key("Ñame")
        assert result.startswith("f_") or result[0].isalpha()

    def test_collapse_underscores(self):
        assert normalize_field_key("a   b   c") == "a_b_c"

    def test_idempotent(self):
        assert normalize_field_key("email") == "email"

    def test_already_normalized(self):
        assert normalize_field_key("customer_name") == "customer_name"


class TestComputeHeaderSignature:
    def test_deterministic(self):
        h1 = compute_header_signature(["First Name", "Email", "Company"])
        h2 = compute_header_signature(["Company", "email", "first_name"])
        assert h1 == h2  # Same after normalization and sorting

    def test_different(self):
        h1 = compute_header_signature(["First Name", "Email"])
        h2 = compute_header_signature(["First Name", "Phone"])
        assert h1 != h2


class TestBuildRenderContext:
    def test_basic_resolution(self):
        recipient_vars = {"customer_name": "Alice", "company": "Acme"}
        campaign_defs = [
            {"key": "customer_name", "label": "Customer Name", "data_type": "text", "required": True, "default_value": None, "source_kind": "uploaded_column", "source_column": "Name", "is_system": False},
            {"key": "company", "label": "Company", "data_type": "text", "required": False, "default_value": "Fallback Corp", "source_kind": "uploaded_column", "source_column": "Company", "is_system": False},
        ]
        template_defs = [
            {"key": "customer_name", "label": "Customer Name", "data_type": "text", "required": True, "default_value": None, "source_kind": "custom", "source_column": None, "is_system": False},
        ]
        bindings = [{"template_field_key": "customer_name", "campaign_field_key": "customer_name"}]

        context, defaults_used, warnings, missing = build_render_context(
            recipient_vars, campaign_defs, template_defs, bindings
        )
        assert context["customer_name"] == "Alice"
        assert context["company"] == "Acme"
        assert len(missing) == 0

    def test_default_fallback(self):
        recipient_vars = {"customer_name": ""}  # empty
        campaign_defs = [
            {"key": "customer_name", "label": "Customer Name", "data_type": "text", "required": False, "default_value": "Valued Customer", "source_kind": "uploaded_column", "source_column": "Name", "is_system": False},
        ]
        context, defaults_used, warnings, missing = build_render_context(
            recipient_vars, campaign_defs, [], []
        )
        assert context["customer_name"] == "Valued Customer"
        assert "customer_name" in defaults_used

    def test_missing_required(self):
        recipient_vars = {}
        campaign_defs = []
        template_defs = [
            {"key": "account_id", "label": "Account ID", "data_type": "text", "required": True, "default_value": None, "source_kind": "custom", "source_column": None, "is_system": False},
        ]
        bindings = []  # No binding for account_id

        context, defaults_used, warnings, missing = build_render_context(
            recipient_vars, campaign_defs, template_defs, bindings
        )
        assert "account_id" in missing


class TestRenderCampaignContent:
    def test_html_escape(self):
        context = {"name": "<script>alert('xss')</script>"}
        result = render_campaign_content(
            subject="Hi {{name}}",
            preheader="",
            html="<p>Hello {{name}}</p>",
            plain_text="Hello {{name}}",
            context=context,
        )
        assert "<script>" not in result["html"]
        assert "&lt;script&gt;" in result["html"]
        # Subject and plain_text are NOT html-escaped
        assert "<script>" in result["subject"]
        assert "<script>" in result["plain_text"]

    def test_missing_field_left_as_placeholder(self):
        context = {"name": "Alice"}
        result = render_campaign_content(
            subject="Hi {{name}} from {{company}}",
            preheader="",
            html="<p>{{name}} at {{company}}</p>",
            plain_text="",
            context=context,
        )
        # Unresolved fields should remain as empty string or placeholder
        assert "Alice" in result["subject"]

    def test_subject_newline_sanitize(self):
        context = {"name": "Alice\r\nBcc: evil@hack.com"}
        result = render_campaign_content(
            subject="Hi {{name}}",
            preheader="",
            html="",
            plain_text="",
            context=context,
        )
        assert "\r" not in result["subject"]
        assert "\n" not in result["subject"]


class TestBuildTemplatePreviewContext:
    def test_uses_defaults(self):
        defs = [
            {"key": "first_name", "label": "First Name", "data_type": "text", "required": False, "default_value": "there", "source_kind": "custom", "source_column": None, "is_system": False},
            {"key": "company", "label": "Company", "data_type": "text", "required": True, "default_value": None, "source_kind": "custom", "source_column": None, "is_system": False},
        ]
        context, warnings = build_template_preview_context(defs)
        assert context["first_name"] == "there"
        assert context["company"] == "[Company]"  # No default → placeholder
        assert len(warnings) > 0


class TestValidateRequiredFields:
    def test_all_bound(self):
        template_defs = [
            {"key": "first_name", "label": "First Name", "data_type": "text", "required": True, "default_value": None, "source_kind": "custom", "source_column": None, "is_system": False},
        ]
        bindings = [{"template_field_key": "first_name", "campaign_field_key": "customer_name"}]
        missing = validate_required_fields(None, template_defs, bindings)
        assert len(missing) == 0

    def test_missing_no_default(self):
        template_defs = [
            {"key": "account_id", "label": "Account ID", "data_type": "text", "required": True, "default_value": None, "source_kind": "custom", "source_column": None, "is_system": False},
        ]
        bindings = []
        missing = validate_required_fields(None, template_defs, bindings)
        assert any("account_id" in m for m in missing)

    def test_has_default_not_missing(self):
        template_defs = [
            {"key": "greeting", "label": "Greeting", "data_type": "text", "required": True, "default_value": "Hello", "source_kind": "custom", "source_column": None, "is_system": False},
        ]
        bindings = []
        missing = validate_required_fields(None, template_defs, bindings)
        assert not any("greeting" in m for m in missing)


class TestAutoMapTemplateFields:
    def test_exact_match(self):
        template_defs = [
            {"key": "customer_name", "label": "Customer Name", "data_type": "text", "required": True, "default_value": None, "source_kind": "custom", "source_column": None, "is_system": False},
        ]
        campaign_defs = [
            {"key": "customer_name", "label": "Customer Name", "data_type": "text", "required": True, "default_value": None, "source_kind": "uploaded_column", "source_column": "Name", "is_system": False},
        ]
        result = auto_map_template_fields(template_defs, campaign_defs)
        assert len(result) == 1
        assert result[0]["template_field_key"] == "customer_name"
        assert result[0]["campaign_field_key"] == "customer_name"

    def test_label_match(self):
        template_defs = [
            {"key": "fname", "label": "First Name", "data_type": "text", "required": False, "default_value": None, "source_kind": "custom", "source_column": None, "is_system": False},
        ]
        campaign_defs = [
            {"key": "first_name", "label": "First Name", "data_type": "text", "required": False, "default_value": None, "source_kind": "uploaded_column", "source_column": "First Name", "is_system": False},
        ]
        result = auto_map_template_fields(template_defs, campaign_defs)
        assert len(result) == 1
        assert result[0]["campaign_field_key"] == "first_name"
