"""
Composer administration settings and the permission catalog.

Stored in the existing app_settings table under two keys so nothing about the
current settings API changes: `composer_settings` and `composer_permissions`.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settings_model import AppSettings

logger = logging.getLogger(__name__)

SETTINGS_KEY = "composer_settings"
PERMISSIONS_KEY = "composer_permissions"

# ── permissions (spec 29) ─────────────────────────────────────────────────────

PERMISSIONS: dict[str, str] = {
    "view_templates": "View templates",
    "create_templates": "Create templates",
    "edit_own_templates": "Edit own templates",
    "edit_all_templates": "Edit all templates",
    "clone_templates": "Clone templates",
    "publish_templates": "Publish templates",
    "archive_templates": "Archive templates",
    "delete_templates": "Delete templates",
    "use_custom_html": "Use custom HTML",
    "insert_raw_html": "Insert raw HTML blocks",
    "manage_themes": "Manage themes",
    "manage_reusable_blocks": "Manage reusable blocks",
    "manage_assets": "Manage assets",
    "send_test_emails": "Send test emails",
    "override_validation_warnings": "Override validation warnings",
    "manage_merge_fields": "Manage merge-field definitions",
}

DEFAULT_PERMISSIONS: dict[str, list[str]] = {
    "view_templates": ["admin", "user"],
    "create_templates": ["admin", "user"],
    "edit_own_templates": ["admin", "user"],
    "edit_all_templates": ["admin", "user"],
    "clone_templates": ["admin", "user"],
    "publish_templates": ["admin", "user"],
    "archive_templates": ["admin", "user"],
    "delete_templates": ["admin", "user"],
    "use_custom_html": ["admin", "user"],
    "insert_raw_html": ["admin"],
    "manage_themes": ["admin"],
    "manage_reusable_blocks": ["admin"],
    "manage_assets": ["admin"],
    "send_test_emails": ["admin", "user"],
    "override_validation_warnings": ["admin"],
    "manage_merge_fields": ["admin", "user"],
}

# ── settings (spec 28) ────────────────────────────────────────────────────────

DEFAULT_SETTINGS: dict[str, Any] = {
    # Canvas
    "default_email_width": 640,
    "min_email_width": 320,
    "max_email_width": 900,
    # Typography and brand
    "allowed_fonts": [],  # empty means "all email-safe stacks"
    "organization_fonts": [],
    "brand_colors": [],
    "default_theme_code": "THM-BASE",
    # Required content
    "require_unsubscribe": True,
    "require_organization_address": False,
    "require_view_in_browser": False,
    "require_plain_text": True,
    "auto_append_compliance_footer": True,
    # Markup allowlists (empty means "use the built-in allowlist")
    "allowed_html_tags": [],
    "allowed_html_attributes": {},
    "allowed_css_properties": [],
    # Media
    "allowed_image_formats": ["png", "jpg", "jpeg", "gif", "webp", "svg"],
    "max_image_size_kb": 5120,
    "max_total_image_size_kb": 10240,
    # Attachments
    "max_attachment_size_kb": 10240,
    "max_total_attachment_size_kb": 20480,
    "max_attachment_count": 5,
    "allowed_attachment_types": ["pdf", "png", "jpg", "jpeg", "csv", "xlsx", "docx", "txt", "zip"],
    "blocked_attachment_types": ["exe", "dll", "bat", "cmd", "js", "vbs", "scr", "msi", "jar", "ps1"],
    "require_attachment_scan": False,
    # Delivery thresholds
    "max_html_size_kb": 102,
    "max_external_resources": 30,
    # Personalization
    "missing_required_policy": "block_campaign",  # block_campaign | skip_recipient | use_default | send_empty
    "allow_raw_html_merge_fields": False,
    # Validation policy
    "validation_gates": {
        "save": {"blocker": True, "error": False, "warning": False},
        "publish": {"blocker": True, "error": True, "warning": False},
        "test_send": {"blocker": True, "error": False, "warning": False},
        "launch": {"blocker": True, "error": True, "warning": False},
    },
    "severity_overrides": {},
    "non_dismissible_codes": [
        "content.empty_body",
        "security.script_element",
        "security.event_handler",
        "security.unsafe_url",
        "security.form_element",
        "security.iframe_element",
        "personalization.required_unmapped",
        "compliance.missing_unsubscribe",
    ],
    # Autosave / revisions
    "autosave_idle_ms": 2000,
    "preview_debounce_ms": 600,
    "max_revisions_kept": 50,
}

GATE_NAMES = ("save", "publish", "test_send", "launch")


async def _read_setting(db: AsyncSession, key: str) -> Optional[dict]:
    result = await db.execute(select(AppSettings).where(AppSettings.key == key))
    row = result.scalar_one_or_none()
    if not row or row.value is None:
        return None
    try:
        parsed = json.loads(row.value) if isinstance(row.value, str) else row.value
    except (json.JSONDecodeError, TypeError):
        return None
    return parsed if isinstance(parsed, dict) else None


async def _write_setting(db: AsyncSession, key: str, value: dict, description: str) -> None:
    result = await db.execute(select(AppSettings).where(AppSettings.key == key))
    row = result.scalar_one_or_none()
    payload = json.dumps(value)
    if row:
        row.value = payload
    else:
        db.add(AppSettings(key=key, value=payload, description=description))
    await db.commit()


def merge_settings(stored: Optional[dict]) -> dict:
    settings = json.loads(json.dumps(DEFAULT_SETTINGS))
    if not stored:
        return settings
    for key, value in stored.items():
        if key not in settings:
            continue
        if key == "validation_gates" and isinstance(value, dict):
            for gate in GATE_NAMES:
                if isinstance(value.get(gate), dict):
                    settings["validation_gates"][gate].update(
                        {k: bool(v) for k, v in value[gate].items() if k in ("blocker", "error", "warning")}
                    )
        elif isinstance(settings[key], dict) and isinstance(value, dict):
            settings[key].update(value)
        else:
            settings[key] = value
    return settings


async def get_composer_settings(db: AsyncSession) -> dict:
    return merge_settings(await _read_setting(db, SETTINGS_KEY))


async def save_composer_settings(db: AsyncSession, patch: dict) -> dict:
    current = await get_composer_settings(db)
    merged = merge_settings({**current, **(patch or {})})
    await _write_setting(db, SETTINGS_KEY, merged, "Composer administration settings")
    return merged


async def get_permission_map(db: AsyncSession) -> dict[str, list[str]]:
    stored = await _read_setting(db, PERMISSIONS_KEY) or {}
    permissions = {key: list(roles) for key, roles in DEFAULT_PERMISSIONS.items()}
    for key, roles in stored.items():
        if key in permissions and isinstance(roles, list):
            permissions[key] = [str(role) for role in roles]
    return permissions


async def save_permission_map(db: AsyncSession, patch: dict) -> dict[str, list[str]]:
    current = await get_permission_map(db)
    for key, roles in (patch or {}).items():
        if key in current and isinstance(roles, list):
            current[key] = [str(role) for role in roles]
    await _write_setting(db, PERMISSIONS_KEY, current, "Composer permission catalog")
    return current


async def resolve_permissions(db: AsyncSession, role: str) -> dict[str, bool]:
    permission_map = await get_permission_map(db)
    return {key: role in roles for key, roles in permission_map.items()}


def sanitizer_allowlists(settings: dict) -> dict[str, Any]:
    """Translate admin settings into sanitizer arguments (empty = built-in defaults)."""
    from app.services.composer.sanitize import (
        DEFAULT_ALLOWED_ATTRIBUTES,
        DEFAULT_ALLOWED_CSS,
        DEFAULT_ALLOWED_TAGS,
    )

    tags = settings.get("allowed_html_tags") or DEFAULT_ALLOWED_TAGS
    attributes = settings.get("allowed_html_attributes") or DEFAULT_ALLOWED_ATTRIBUTES
    css = settings.get("allowed_css_properties") or DEFAULT_ALLOWED_CSS
    return {"allowed_tags": tags, "allowed_attributes": attributes, "allowed_css": css}
