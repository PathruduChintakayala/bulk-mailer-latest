import re
import hashlib
from typing import Optional
from html import escape as html_escape
from dataclasses import dataclass, field


# ─── Field key normalization ─────────────────────────────────────────────

def normalize_field_key(label: str) -> str:
    """Normalize a display label or column name into a valid merge-field key.
    
    Rules:
    - Lowercase
    - Replace non-alphanumeric with underscore
    - Collapse consecutive underscores
    - Strip leading/trailing underscores
    - Must start with a letter
    """
    key = label.lower().strip()
    key = re.sub(r"[^a-z0-9]", "_", key)
    key = re.sub(r"_+", "_", key)
    key = key.strip("_")
    # Ensure starts with letter
    if key and not key[0].isalpha():
        key = "f_" + key
    return key or "field"


def compute_header_signature(headers: list[str]) -> str:
    """Compute a deterministic signature from CSV/Excel headers for mapping reuse."""
    normalized = sorted(normalize_field_key(h) for h in headers if h.strip())
    joined = "|".join(normalized)
    return hashlib.sha256(joined.encode()).hexdigest()[:16]


# ─── Render context building ─────────────────────────────────────────────

@dataclass
class RenderResult:
    subject: str = ""
    preheader: str = ""
    html: str = ""
    plain_text: str = ""
    resolved_values: dict = field(default_factory=dict)
    defaults_used: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    missing_required_fields: list = field(default_factory=list)


def build_render_context(
    recipient_variables: dict,
    campaign_field_definitions: list[dict] | None,
    template_field_definitions: list[dict] | None,
    template_bindings: list[dict] | None,
) -> tuple[dict, list[str], list[str], list[str]]:
    """Build the merged render context from recipient data + definitions + bindings.
    
    Returns:
        (context_dict, defaults_used, warnings, missing_required_fields)
    """
    context = {}
    defaults_used = []
    warnings = []
    missing_required = []

    campaign_defs = campaign_field_definitions or []
    template_defs = template_field_definitions or []
    bindings = template_bindings or []
    
    # Build binding map: template_field_key → campaign_field_key
    binding_map = {}
    for b in bindings:
        if isinstance(b, dict) and b.get("template_field_key") and b.get("campaign_field_key"):
            binding_map[b["template_field_key"]] = b["campaign_field_key"]

    # Step 1: Resolve campaign fields directly
    for fdef in campaign_defs:
        key = fdef.get("key", "")
        if not key:
            continue
        value = recipient_variables.get(key, "")
        if value:
            context[key] = str(value)
        elif fdef.get("default_value"):
            context[key] = fdef["default_value"]
            defaults_used.append(key)
        elif fdef.get("required"):
            missing_required.append(key)
            context[key] = ""
        else:
            context[key] = ""

    # Step 2: Resolve template fields via bindings
    for tdef in template_defs:
        tkey = tdef.get("key", "")
        if not tkey:
            continue
        
        # Check if bound to a campaign field
        campaign_key = binding_map.get(tkey)
        if campaign_key:
            value = recipient_variables.get(campaign_key, "")
            if value:
                context[tkey] = str(value)
            elif tdef.get("default_value"):
                context[tkey] = tdef["default_value"]
                defaults_used.append(tkey)
            elif tdef.get("required"):
                missing_required.append(tkey)
                context[tkey] = ""
            else:
                context[tkey] = ""
        else:
            # Not bound - use default or report
            if tdef.get("default_value"):
                context[tkey] = tdef["default_value"]
                defaults_used.append(tkey)
            elif tdef.get("required"):
                missing_required.append(tkey)
                context[tkey] = ""
            else:
                context[tkey] = ""
                if tkey not in context:
                    warnings.append(f"Template field '{tkey}' has no binding and no default")

    # Also include any recipient variables not in definitions (backward compat)
    for key, value in recipient_variables.items():
        if key not in context:
            context[key] = str(value) if value else ""

    return context, defaults_used, warnings, missing_required


def build_template_preview_context(template_field_definitions: list[dict] | None) -> tuple[dict, list[str]]:
    """Build context for template preview using only default values.
    
    Returns: (context_dict, warnings_for_fields_without_defaults)
    """
    context = {}
    warnings = []
    for fdef in (template_field_definitions or []):
        key = fdef.get("key", "")
        if not key:
            continue
        if fdef.get("default_value"):
            context[key] = fdef["default_value"]
        else:
            context[key] = f"[{fdef.get('label', key)}]"
            warnings.append(f"Field '{key}' has no default value — showing placeholder")
    return context, warnings


# ─── Rendering ─────────────────────────────────────────────────────────

MERGE_FIELD_PATTERN = re.compile(r"\{\{\s*([A-Za-z_]\w*)\s*((?:\|[^}]*)?)\}\}")

SUPPORTED_FILTERS = ("default", "format", "upper", "lower", "title", "trim")

_FILTER_ARG_RE = re.compile(r'^\s*(\w+)\s*(?::\s*(.*?))?\s*$', re.DOTALL)


def _parse_filters(raw: str) -> list[tuple[str, str]]:
    """Parse `| default: "Customer" | upper` into [(name, arg), ...]."""
    filters: list[tuple[str, str]] = []
    if not raw:
        return filters
    for piece in raw.lstrip("|").split("|"):
        match = _FILTER_ARG_RE.match(piece)
        if not match:
            continue
        name = match.group(1).lower()
        arg = (match.group(2) or "").strip()
        if len(arg) >= 2 and arg[0] == arg[-1] and arg[0] in ("'", '"'):
            arg = arg[1:-1].replace('\\"', '"').replace("\\'", "'")
        filters.append((name, arg))
    return filters


def _apply_format(value: str, spec: str) -> str:
    """Apply a type-aware formatting rule. Unknown specs pass the value through."""
    if not value:
        return value
    kind, _, argument = spec.partition(":")
    kind = kind.strip().lower()
    argument = argument.strip()
    try:
        if kind == "currency":
            symbol = argument or "$"
            return f"{symbol}{float(value):,.2f}"
        if kind == "number":
            decimals = int(argument) if argument else 0
            return f"{float(value):,.{decimals}f}"
        if kind == "percent":
            decimals = int(argument) if argument else 0
            return f"{float(value):.{decimals}f}%"
        if kind in ("date", "datetime"):
            from datetime import datetime

            pattern = argument or ("%Y-%m-%d" if kind == "date" else "%Y-%m-%d %H:%M")
            for candidate in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
                try:
                    return datetime.strptime(value[:19], candidate).strftime(pattern)
                except ValueError:
                    continue
            return value
    except (TypeError, ValueError):
        return value
    return value


def _render_text(template_str: str, context: dict, escape_html: bool = False) -> str:
    """
    Replace merge placeholders with values from context.

    Supports the bare `{{field}}` form plus filters:
    `{{ field | default: "Customer" | upper }}`.
    """
    def replace_field(match: re.Match) -> str:
        field_name = match.group(1).strip()
        filters = _parse_filters(match.group(2) or "")
        value = context.get(field_name, "")
        value = "" if value is None else str(value)

        for name, argument in filters:
            if name == "default":
                if not value:
                    value = argument
            elif name == "format":
                value = _apply_format(value, argument)
            elif name == "upper":
                value = value.upper()
            elif name == "lower":
                value = value.lower()
            elif name == "title":
                value = value.title()
            elif name == "trim":
                value = value.strip()

        if escape_html:
            return html_escape(value) if value else ""
        return value

    return MERGE_FIELD_PATTERN.sub(replace_field, template_str)


def _sanitize_header_value(value: str) -> str:
    """Reject header newline injection in subject/from-name/reply-to."""
    return re.sub(r"[\r\n]", " ", value).strip()


def render_campaign_content(
    subject: str,
    preheader: str,
    html: str,
    plain_text: str,
    context: dict,
) -> dict:
    """Render all campaign content fields using the merged context.
    HTML body values are HTML-escaped. Subject/preheader are sanitized against header injection.
    """
    rendered_subject = _sanitize_header_value(_render_text(subject or "", context, escape_html=False))
    rendered_preheader = _sanitize_header_value(_render_text(preheader or "", context, escape_html=False))
    rendered_html = _render_text(html or "", context, escape_html=True)
    rendered_plain = _render_text(plain_text or "", context, escape_html=False)
    
    return {
        "subject": rendered_subject,
        "preheader": rendered_preheader,
        "html": rendered_html,
        "plain_text": rendered_plain,
    }


def validate_required_fields(
    campaign_field_definitions: list[dict] | None,
    template_field_definitions: list[dict] | None,
    template_bindings: list[dict] | None,
) -> list[str]:
    """Check for required template fields without bindings or defaults."""
    errors = []
    bindings = template_bindings or []
    binding_map = {b["template_field_key"]: b.get("campaign_field_key") for b in bindings if isinstance(b, dict)}

    for tdef in (template_field_definitions or []):
        if tdef.get("required"):
            tkey = tdef.get("key", "")
            has_binding = bool(binding_map.get(tkey))
            has_default = bool(tdef.get("default_value"))
            if not has_binding and not has_default:
                errors.append(f"Required template field '{tkey}' has no binding and no default")
    return errors


def auto_map_template_fields(
    template_field_definitions: list[dict] | None,
    campaign_field_definitions: list[dict] | None,
) -> list[dict]:
    """Auto-map template fields to campaign fields using priority matching.
    
    Priority:
    1. Exact key match
    2. Case-insensitive key match
    3. Normalized key match
    4. Source column name match
    5. Normalized label match
    """
    bindings = []
    template_defs = template_field_definitions or []
    campaign_defs = campaign_field_definitions or []
    
    if not template_defs or not campaign_defs:
        return bindings

    # Build lookup structures for campaign fields
    campaign_keys = {f["key"]: f["key"] for f in campaign_defs if f.get("key")}
    campaign_keys_lower = {f["key"].lower(): f["key"] for f in campaign_defs if f.get("key")}
    campaign_normalized = {normalize_field_key(f.get("key", "")): f["key"] for f in campaign_defs if f.get("key")}
    campaign_source_cols = {}
    campaign_labels_normalized = {}
    for f in campaign_defs:
        if f.get("source_column"):
            campaign_source_cols[normalize_field_key(f["source_column"])] = f["key"]
        if f.get("label"):
            campaign_labels_normalized[normalize_field_key(f["label"])] = f["key"]

    for tdef in template_defs:
        tkey = tdef.get("key", "")
        if not tkey:
            continue
        
        matched_key = None
        
        # Priority 1: Exact key match
        if tkey in campaign_keys:
            matched_key = campaign_keys[tkey]
        # Priority 2: Case-insensitive
        elif tkey.lower() in campaign_keys_lower:
            matched_key = campaign_keys_lower[tkey.lower()]
        # Priority 3: Normalized key match
        elif normalize_field_key(tkey) in campaign_normalized:
            matched_key = campaign_normalized[normalize_field_key(tkey)]
        # Priority 4: Source column name match
        elif normalize_field_key(tkey) in campaign_source_cols:
            matched_key = campaign_source_cols[normalize_field_key(tkey)]
        # Priority 5: Normalized label match
        elif normalize_field_key(tdef.get("label", "")) in campaign_labels_normalized:
            matched_key = campaign_labels_normalized[normalize_field_key(tdef.get("label", ""))]
        
        bindings.append({
            "template_field_key": tkey,
            "campaign_field_key": matched_key,
        })

    return bindings


# ─── Legacy compatibility wrappers ─────────────────────────────────────

def render_merge_fields(html_body: str, merge_data: dict, field_defaults: Optional[dict] = None) -> str:
    """Legacy: Render merge fields in the HTML body.
    Now delegates to the canonical pipeline for consistency.
    """
    defaults = field_defaults or {}
    # Build a simple context from merge_data + defaults
    context = {}
    for key, val in defaults.items():
        context[key] = val
    for key, val in merge_data.items():
        if val:
            context[key] = str(val)
    return _render_text(html_body, context, escape_html=True)


def build_field_defaults(merge_fields_config: list | None) -> dict:
    """Build a {field_name: default_value} dict from stored field definitions."""
    if not merge_fields_config:
        return {}
    defaults = {}
    for field in merge_fields_config:
        if isinstance(field, dict) and field.get("defaultValue"):
            defaults[field["name"]] = field["defaultValue"]
    return defaults


def extract_merge_fields(html_body: str) -> list[str]:
    """Extract all merge field names from the HTML body."""
    return list({match.group(1) for match in MERGE_FIELD_PATTERN.finditer(html_body or "")})
