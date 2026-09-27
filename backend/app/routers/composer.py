"""
Composer API (/api/composer/*).

Additive by design: no existing endpoint changes shape, so the current composer
keeps working while the new one is validated.
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.campaign import Campaign, CampaignAttachment, Recipient
from app.models.composer import (
    AuditLog,
    CampaignTemplateSnapshot,
    EditorPreference,
    ReusableBlock,
    TemplateRevision,
    Theme,
    ValidationReportRecord,
)
from app.models.sender_identity import SenderIdentity
from app.models.template import Template
from app.models.user import User
from app.schemas.composer import (
    AttachmentListResponse,
    AttachmentResponse,
    BootstrapResponse,
    CompileRequest,
    CompileResponse,
    DismissIssueRequest,
    ForkHtmlRequest,
    MergeFieldContextResponse,
    MergeFieldMappingRow,
    PreferencesRequest,
    PreferencesResponse,
    PublishRequest,
    RecipientPreviewRequest,
    RecipientPreviewResponse,
    RevisionContent,
    RevisionSummary,
    SaveMappingRequest,
    SaveRevisionRequest,
    SaveRevisionResponse,
    TargetResponse,
    TestSendRequest,
    TestSendResponse,
    TestSendResult,
    ThemeResponse,
)
from app.services import merge_engine
from app.services.composer import document as doc_model
from app.services.composer.pipeline import build_output
from app.services.composer.settings import (
    PERMISSIONS,
    get_composer_settings,
    resolve_permissions,
)
from app.services.composer.theme import DEFAULT_THEME_TOKENS, resolve_tokens
from app.services.email_sender import get_email_sender
from app.services.public_codes import PREFIXES, generate_unique_public_code
from app.utils.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/composer", tags=["composer"])

SYSTEM_MERGE_FIELDS = [
    {"key": "email", "label": "Recipient email", "data_type": "email", "description": "The recipient address.", "is_system": True},
    {"key": "first_name", "label": "First name", "data_type": "text", "description": "Recipient first name when uploaded.", "is_system": True},
    {"key": "last_name", "label": "Last name", "data_type": "text", "description": "Recipient last name when uploaded.", "is_system": True},
    {"key": "unsubscribe_url", "label": "Unsubscribe URL", "data_type": "url", "description": "Per-recipient unsubscribe link.", "is_system": True},
    {"key": "preferences_url", "label": "Preferences URL", "data_type": "url", "description": "Per-recipient preference centre link.", "is_system": True},
    {"key": "view_in_browser_url", "label": "View in browser URL", "data_type": "url", "description": "Hosted version of the email.", "is_system": True},
    {"key": "campaign_name", "label": "Campaign name", "data_type": "text", "description": "Name of the sending campaign.", "is_system": True},
    {"key": "current_year", "label": "Current year", "data_type": "text", "description": "Year at send time.", "is_system": True},
]

EMAIL_SAFE_FONTS = [
    {"label": "Arial", "stack": "Arial, Helvetica, sans-serif"},
    {"label": "Helvetica", "stack": "Helvetica, Arial, sans-serif"},
    {"label": "Verdana", "stack": "Verdana, Geneva, sans-serif"},
    {"label": "Tahoma", "stack": "Tahoma, Verdana, sans-serif"},
    {"label": "Trebuchet MS", "stack": "'Trebuchet MS', Tahoma, sans-serif"},
    {"label": "Georgia", "stack": "Georgia, 'Times New Roman', serif"},
    {"label": "Times New Roman", "stack": "'Times New Roman', Times, serif"},
    {"label": "Courier New", "stack": "'Courier New', Courier, monospace"},
    {"label": "Lucida Sans", "stack": "'Lucida Sans Unicode', 'Lucida Grande', sans-serif"},
    {"label": "Palatino", "stack": "'Palatino Linotype', 'Book Antiqua', Palatino, serif"},
    {"label": "System UI", "stack": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif"},
]

ATTACHMENT_DIR = "./uploads/attachments"


# ── helpers ───────────────────────────────────────────────────────────────────

def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


async def require_permission(db: AsyncSession, user: User, permission: str) -> None:
    granted = await resolve_permissions(db, user.role)
    if not granted.get(permission, False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You do not have permission to {PERMISSIONS.get(permission, permission).lower()}.",
        )


async def write_audit(
    db: AsyncSession,
    user: Optional[User],
    action: str,
    *,
    object_type: Optional[str] = None,
    object_code: Optional[str] = None,
    revision_no: Optional[int] = None,
    summary: Optional[str] = None,
    request_id: Optional[str] = None,
    commit: bool = True,
) -> None:
    db.add(
        AuditLog(
            user_id=user.id if user else None,
            user_email=user.email if user else None,
            action=action,
            object_type=object_type,
            object_code=object_code,
            revision_no=revision_no,
            summary=summary,
            request_id=request_id or uuid.uuid4().hex[:12],
        )
    )
    if commit:
        await db.commit()


async def _load_template(db: AsyncSession, code: str) -> Template:
    result = await db.execute(select(Template).where(Template.public_code == code))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


async def _load_campaign(db: AsyncSession, code: str) -> Campaign:
    result = await db.execute(select(Campaign).where(Campaign.public_code == code))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


async def _theme_tokens(db: AsyncSession, theme_code: Optional[str]) -> tuple[dict, Optional[str]]:
    """Resolve theme tokens by code, falling back to the organization default."""
    query = select(Theme).where(Theme.archived_at.is_(None))
    if theme_code:
        result = await db.execute(query.where(Theme.public_code == theme_code))
        theme = result.scalar_one_or_none()
        if theme:
            return resolve_tokens(theme.tokens_json or {}), theme.public_code
    result = await db.execute(query.where(Theme.is_org_default.is_(True)).limit(1))
    theme = result.scalar_one_or_none()
    if theme:
        return resolve_tokens(theme.tokens_json or {}), theme.public_code
    return dict(DEFAULT_THEME_TOKENS), None


async def _reusable_map(db: AsyncSession, document: Optional[dict]) -> dict[str, Any]:
    """Load fragments for every reusable block referenced by the document."""
    if not document:
        return {}
    codes = {
        block.get("reusableCode")
        for block, *_ in doc_model.iter_blocks(document)
        if block.get("type") == "reusable" and block.get("reusableCode")
    }
    if not codes:
        return {}
    result = await db.execute(select(ReusableBlock).where(ReusableBlock.public_code.in_(codes)))
    fragments: dict[str, Any] = {}
    for block in result.scalars().all():
        fragment = block.fragment_json or {}
        if block.fragment_kind == "section":
            fragments[block.public_code] = {"section": fragment.get("section") or fragment}
        else:
            fragments[block.public_code] = {"blocks": fragment.get("blocks") or []}
    return fragments


def _revision_summary(revision: TemplateRevision, author: Optional[User] = None, usage: int = 0) -> RevisionSummary:
    return RevisionSummary(
        public_code=revision.public_code or "",
        revision_no=revision.revision_no or 1,
        status=revision.status or "draft",
        kind=revision.kind or "visual",
        subject=revision.subject,
        preheader=revision.preheader,
        change_summary=revision.change_summary,
        author_name=author.full_name if author else None,
        author_email=author.email if author else None,
        validation_summary=revision.validation_summary,
        theme_code=revision.theme_code,
        created_at=_iso(revision.created_at),
        updated_at=_iso(revision.updated_at),
        published_at=_iso(revision.published_at),
        campaign_usage=usage,
    )


def _revision_content(revision: TemplateRevision, author: Optional[User] = None) -> RevisionContent:
    summary = _revision_summary(revision, author)
    return RevisionContent(
        **summary.model_dump(),
        document=revision.document_json,
        html_source=revision.html_source,
        compiled_html=revision.compiled_html,
        plain_text=revision.plain_text,
        plain_text_mode=revision.plain_text_mode or "generated",
        theme_overrides=(revision.document_json or {}).get("themeOverrides") if revision.document_json else None,
        merge_field_definitions=revision.merge_defs_json or [],
    )


async def _authors_for(db: AsyncSession, revisions: list[TemplateRevision]) -> dict[int, User]:
    ids = {r.author_id for r in revisions if r.author_id}
    if not ids:
        return {}
    result = await db.execute(select(User).where(User.id.in_(ids)))
    return {user.id: user for user in result.scalars().all()}


async def _revisions_for_target(
    db: AsyncSession,
    *,
    template_id: Optional[int] = None,
    campaign_id: Optional[int] = None,
) -> list[TemplateRevision]:
    query = select(TemplateRevision)
    if campaign_id is not None:
        query = query.where(TemplateRevision.campaign_id == campaign_id)
    else:
        query = query.where(
            TemplateRevision.template_id == template_id,
            TemplateRevision.campaign_id.is_(None),
        )
    result = await db.execute(query.order_by(TemplateRevision.revision_no.desc()))
    return list(result.scalars().all())


def _pick_draft(revisions: list[TemplateRevision]) -> Optional[TemplateRevision]:
    for revision in revisions:
        if revision.status == "draft":
            return revision
    return None


def _pick_published(revisions: list[TemplateRevision]) -> Optional[TemplateRevision]:
    published = [r for r in revisions if r.status == "published"]
    if not published:
        return None
    return max(published, key=lambda r: (r.published_at or datetime.min.replace(tzinfo=timezone.utc), r.revision_no))


# ── bootstrap ─────────────────────────────────────────────────────────────────

@router.get("/bootstrap", response_model=BootstrapResponse)
async def bootstrap(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """One call that boots the editor: settings, permissions, themes, prefs."""
    settings_data = await get_composer_settings(db)
    permissions = await resolve_permissions(db, current_user.role)

    result = await db.execute(
        select(Theme).where(Theme.archived_at.is_(None)).order_by(Theme.is_builtin.desc(), Theme.name)
    )
    themes = [
        ThemeResponse(
            public_code=t.public_code or "",
            name=t.name,
            description=t.description,
            tokens=resolve_tokens(t.tokens_json or {}),
            is_builtin=bool(t.is_builtin),
            is_org_default=bool(t.is_org_default),
            is_locked=bool(t.is_locked),
            archived_at=_iso(t.archived_at),
            created_at=_iso(t.created_at),
            updated_at=_iso(t.updated_at),
        )
        for t in result.scalars().all()
    ]

    pref_result = await db.execute(select(EditorPreference).where(EditorPreference.user_id == current_user.id))
    preference = pref_result.scalar_one_or_none()

    allowed = settings_data.get("allowed_fonts") or []
    fonts = [f for f in EMAIL_SAFE_FONTS if not allowed or f["label"] in allowed]
    for extra in settings_data.get("organization_fonts") or []:
        if isinstance(extra, dict) and extra.get("stack"):
            fonts.append({"label": extra.get("label") or extra["stack"], "stack": extra["stack"]})

    from app.services.composer.inline import inliner_available
    from app.services.composer.sanitize import sanitizer_available

    return BootstrapResponse(
        settings=settings_data,
        permissions=permissions,
        themes=themes,
        fonts=fonts,
        system_fields=SYSTEM_MERGE_FIELDS,
        prefs=preference.prefs_json or {} if preference else {},
        capabilities={
            "sanitizer": sanitizer_available(),
            "css_inliner": inliner_available(),
            "user_role": current_user.role,
            "user_code": current_user.public_code,
        },
    )


# ── preferences ───────────────────────────────────────────────────────────────

@router.get("/preferences", response_model=PreferencesResponse)
async def get_preferences(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(EditorPreference).where(EditorPreference.user_id == current_user.id))
    preference = result.scalar_one_or_none()
    return PreferencesResponse(prefs=preference.prefs_json or {} if preference else {})


@router.put("/preferences", response_model=PreferencesResponse)
async def save_preferences(
    payload: PreferencesRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(EditorPreference).where(EditorPreference.user_id == current_user.id))
    preference = result.scalar_one_or_none()
    merged = {**((preference.prefs_json or {}) if preference else {}), **(payload.prefs or {})}
    if preference:
        preference.prefs_json = merged
    else:
        db.add(EditorPreference(user_id=current_user.id, prefs_json=merged))
    await db.commit()
    return PreferencesResponse(prefs=merged)


# ── compile ───────────────────────────────────────────────────────────────────

@router.post("/compile", response_model=CompileResponse)
async def compile_content(
    payload: CompileRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Compile a document or HTML source into the exact output that will be sent.

    The preview iframe renders this response, so preview and delivery cannot drift.
    """
    settings_data = await get_composer_settings(db)
    tokens, _code = await _theme_tokens(db, payload.theme_code)
    if payload.theme_overrides:
        tokens = resolve_tokens(tokens, payload.theme_overrides)

    document = payload.document
    reusable = await _reusable_map(db, doc_model.normalize_document(document) if document else None)

    mapped_keys: set[str] = set()
    missing_counts: dict[str, int] = {}
    invalid_counts: dict[str, int] = {}
    attachment_count = 0
    attachment_total_kb = 0

    if payload.target_type == "campaign" and payload.target_code:
        campaign = await _load_campaign(db, payload.target_code)
        mapped_keys, missing_counts, invalid_counts = await _mapping_stats(
            db, campaign, payload.merge_field_definitions
        )
        attach_result = await db.execute(
            select(CampaignAttachment).where(CampaignAttachment.campaign_id == campaign.id)
        )
        attachments = list(attach_result.scalars().all())
        attachment_count = len(attachments)
        attachment_total_kb = int(
            sum(os.path.getsize(a.file_path) for a in attachments if a.file_path and os.path.exists(a.file_path)) / 1024
        )
    else:
        mapped_keys = {
            d.get("key")
            for d in payload.merge_field_definitions
            if d.get("key") and (d.get("default_value") or d.get("source_kind") == "system")
        }

    result = build_output(
        kind=payload.kind,
        document=document,
        html_source=payload.html_source,
        subject=payload.subject,
        preheader=payload.preheader,
        theme_tokens=tokens,
        org_settings=settings_data,
        reusable=reusable,
        merge_field_definitions=payload.merge_field_definitions,
        mapped_field_keys=mapped_keys,
        missing_value_counts=missing_counts,
        invalid_value_counts=invalid_counts,
        plain_text_override=payload.plain_text,
        plain_text_mode=payload.plain_text_mode,
        attachment_count=attachment_count,
        attachment_total_kb=attachment_total_kb,
        run_validation=payload.run_validation,
    )
    return CompileResponse(**result.to_dict())


async def _mapping_stats(
    db: AsyncSession,
    campaign: Campaign,
    definitions: list[dict],
) -> tuple[set[str], dict[str, int], dict[str, int]]:
    """Which fields resolve to real data, and how many rows are missing/invalid."""
    keys = [d.get("key") for d in definitions if d.get("key")]
    if not keys:
        return set(), {}, {}

    campaign_defs = campaign.campaign_field_definitions_json or []
    bindings = campaign.template_field_bindings_json or []
    binding_map = {
        b.get("template_field_key"): b.get("campaign_field_key")
        for b in bindings
        if isinstance(b, dict) and b.get("template_field_key")
    }
    campaign_keys = {d.get("key") for d in campaign_defs if d.get("key")}

    mapped: set[str] = set()
    for definition in definitions:
        key = definition.get("key")
        if not key:
            continue
        if binding_map.get(key) or key in campaign_keys or definition.get("source_kind") == "system":
            mapped.add(key)
        elif definition.get("default_value"):
            mapped.add(key)

    result = await db.execute(
        select(Recipient.merge_data)
        .where(Recipient.campaign_id == campaign.id, Recipient.is_included.is_(True))
        .limit(2000)
    )
    rows = [row[0] or {} for row in result.fetchall()]
    if not rows:
        return mapped, {}, {}

    missing: dict[str, int] = {}
    invalid: dict[str, int] = {}
    types = {d.get("key"): d.get("data_type", "text") for d in definitions if d.get("key")}
    for key in keys:
        source_key = binding_map.get(key) or key
        for row in rows:
            value = str(row.get(source_key) or "").strip()
            if not value:
                missing[key] = missing.get(key, 0) + 1
                continue
            data_type = types.get(key, "text")
            if data_type == "email" and "@" not in value:
                invalid[key] = invalid.get(key, 0) + 1
            elif data_type == "number":
                try:
                    float(value.replace(",", ""))
                except ValueError:
                    invalid[key] = invalid.get(key, 0) + 1
            elif data_type == "url" and not value.lower().startswith(("http://", "https://")):
                invalid[key] = invalid.get(key, 0) + 1
    return mapped, {k: v for k, v in missing.items() if v}, {k: v for k, v in invalid.items() if v}


# ── target loading ────────────────────────────────────────────────────────────

@router.get("/targets/{target_type}/{target_code}", response_model=TargetResponse)
async def load_target(
    target_type: str,
    target_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Load a template or campaign together with its draft, published revision and history."""
    await require_permission(db, current_user, "view_templates")
    if target_type not in ("template", "campaign"):
        raise HTTPException(status_code=400, detail="Unsupported target type")

    if target_type == "template":
        template = await _load_template(db, target_code)
        revisions = await _revisions_for_target(db, template_id=template.id)
        draft = _pick_draft(revisions)
        published = _pick_published(revisions)
        authors = await _authors_for(db, revisions)

        can_edit = True
        locked_reason = None
        permissions = await resolve_permissions(db, current_user.role)
        if template.created_by != current_user.id and not permissions.get("edit_all_templates"):
            can_edit = False
            locked_reason = "You can only edit templates you created."

        if not draft and not revisions:
            draft = await _seed_first_revision(db, template, current_user)
            revisions = [draft]

        return TargetResponse(
            target_type="template",
            target_code=template.public_code or target_code,
            name=template.name,
            description=template.description,
            status="published" if published else "draft",
            subject=(draft or published).subject if (draft or published) else None,
            preheader=(draft or published).preheader if (draft or published) else None,
            breadcrumb=[
                {"label": "Templates", "to": "/templates"},
                {"label": template.name, "to": None},
            ],
            draft=_revision_content(draft, authors.get(draft.author_id)) if draft else None,
            published=_revision_summary(published, authors.get(published.author_id)) if published else None,
            revisions=[_revision_summary(r, authors.get(r.author_id)) for r in revisions],
            merge_field_definitions=template.merge_field_definitions_json or [],
            theme_code=(draft or published).theme_code if (draft or published) else None,
            can_edit=can_edit,
            locked_reason=locked_reason,
        )

    campaign = await _load_campaign(db, target_code)
    revisions = await _revisions_for_target(db, campaign_id=campaign.id)
    draft = _pick_draft(revisions)
    published = _pick_published(revisions)
    authors = await _authors_for(db, revisions)

    if not draft and not revisions:
        draft = await _seed_campaign_revision(db, campaign, current_user)
        revisions = [draft]

    count_result = await db.execute(
        select(func.count()).select_from(Recipient).where(
            Recipient.campaign_id == campaign.id, Recipient.is_included.is_(True)
        )
    )
    recipient_count = count_result.scalar() or 0

    sender = None
    if campaign.sender_identity_id:
        sender_result = await db.execute(
            select(SenderIdentity).where(SenderIdentity.id == campaign.sender_identity_id)
        )
        identity = sender_result.scalar_one_or_none()
        if identity:
            sender = {
                "code": identity.public_code,
                "from_email": identity.from_email,
                "from_name": identity.from_name,
                "reply_to": identity.reply_to,
            }
    if sender is None:
        sender = {
            "code": None,
            "from_email": campaign.from_email,
            "from_name": campaign.from_name,
            "reply_to": campaign.reply_to,
        }

    editable = campaign.status in ("draft", "scheduled", "paused")
    return TargetResponse(
        target_type="campaign",
        target_code=campaign.public_code or target_code,
        name=campaign.name,
        description=None,
        status=campaign.status or "draft",
        subject=campaign.subject,
        preheader=campaign.preheader,
        breadcrumb=[
            {"label": "Campaigns", "to": "/campaigns"},
            {"label": campaign.name, "to": f"/campaigns/{campaign.public_code}"},
            {"label": "Content", "to": None},
        ],
        draft=_revision_content(draft, authors.get(draft.author_id)) if draft else None,
        published=_revision_summary(published, authors.get(published.author_id)) if published else None,
        revisions=[_revision_summary(r, authors.get(r.author_id)) for r in revisions],
        merge_field_definitions=campaign.campaign_field_definitions_json or [],
        theme_code=(draft or published).theme_code if (draft or published) else None,
        sender=sender,
        recipient_count=recipient_count,
        can_edit=editable,
        locked_reason=None if editable else f"This campaign is {campaign.status} and its content is frozen.",
    )


async def _seed_first_revision(db: AsyncSession, template: Template, user: User) -> TemplateRevision:
    """Create the first composer revision for a template, importing existing content."""
    existing_html = template.html_output or ""
    document = doc_model.parse_document(template.content_json)
    kind = "visual" if document else ("custom_html" if existing_html.strip() else "visual")
    if not document and kind == "visual":
        document = doc_model.empty_document()

    revision = TemplateRevision(
        public_code=await generate_unique_public_code(db, TemplateRevision, PREFIXES["revision"]),
        template_id=template.id,
        revision_no=1,
        status="draft",
        kind=kind,
        document_json=document,
        html_source=existing_html if kind == "custom_html" else None,
        subject=None,
        preheader=None,
        merge_defs_json=template.merge_field_definitions_json or [],
        change_summary="Imported existing template content",
        author_id=user.id,
        plain_text_mode="generated",
    )
    db.add(revision)
    await db.commit()
    await db.refresh(revision)
    await write_audit(
        db, user, "revision.created",
        object_type="template", object_code=template.public_code, revision_no=1,
        summary="First composer revision created from existing template content",
    )
    return revision


async def _seed_campaign_revision(db: AsyncSession, campaign: Campaign, user: User) -> TemplateRevision:
    document = doc_model.parse_document(campaign.content_json)
    existing_html = campaign.html_body or ""
    kind = "visual" if document else ("custom_html" if existing_html.strip() else "visual")
    if not document and kind == "visual":
        document = doc_model.empty_document()

    revision = TemplateRevision(
        public_code=await generate_unique_public_code(db, TemplateRevision, PREFIXES["revision"]),
        campaign_id=campaign.id,
        template_id=campaign.selected_template_id,
        revision_no=1,
        status="draft",
        kind=kind,
        document_json=document,
        html_source=existing_html if kind == "custom_html" else None,
        subject=campaign.subject,
        preheader=campaign.preheader,
        merge_defs_json=campaign.campaign_field_definitions_json or [],
        change_summary="Imported existing campaign content",
        author_id=user.id,
    )
    db.add(revision)
    await db.commit()
    await db.refresh(revision)
    return revision


# ── revisions ─────────────────────────────────────────────────────────────────

@router.post("/revisions", response_model=SaveRevisionResponse)
async def save_revision(
    payload: SaveRevisionRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Save the working draft.

    Optimistic concurrency: `base_revision_code` must be the draft the client
    loaded. When a newer draft exists, a 409 is returned with its author and time.
    """
    settings_data = await get_composer_settings(db)
    permissions = await resolve_permissions(db, current_user.role)

    if payload.kind == "custom_html" and not permissions.get("use_custom_html"):
        raise HTTPException(status_code=403, detail="You do not have permission to use custom HTML.")
    if payload.document and not permissions.get("insert_raw_html"):
        normalized = doc_model.normalize_document(payload.document)
        if any(block.get("type") == "rawHtml" for block, *_ in doc_model.iter_blocks(normalized)):
            raise HTTPException(status_code=403, detail="You do not have permission to insert raw HTML blocks.")

    template: Optional[Template] = None
    campaign: Optional[Campaign] = None
    if payload.target_type == "template":
        template = await _load_template(db, payload.target_code)
        if template.created_by != current_user.id and not permissions.get("edit_all_templates"):
            raise HTTPException(status_code=403, detail="You can only edit templates you created.")
        revisions = await _revisions_for_target(db, template_id=template.id)
    else:
        campaign = await _load_campaign(db, payload.target_code)
        if campaign.status not in ("draft", "scheduled", "paused"):
            raise HTTPException(
                status_code=409,
                detail=f"This campaign is {campaign.status}; its content can no longer be edited.",
            )
        revisions = await _revisions_for_target(db, campaign_id=campaign.id)

    draft = _pick_draft(revisions)
    if draft and payload.base_revision_code and draft.public_code != payload.base_revision_code:
        authors = await _authors_for(db, [draft])
        raise HTTPException(
            status_code=409,
            detail={
                "message": "A newer version of this content was saved by someone else.",
                "latest_revision": _revision_summary(draft, authors.get(draft.author_id)).model_dump(),
            },
        )

    tokens, theme_code = await _theme_tokens(db, payload.theme_code)
    document = doc_model.normalize_document(payload.document) if payload.document is not None else None
    reusable = await _reusable_map(db, document)
    merge_defs = payload.merge_field_definitions
    if merge_defs is None:
        merge_defs = (draft.merge_defs_json if draft else None) or []

    mapped_keys: set[str] = set()
    if campaign:
        mapped_keys, missing, invalid = await _mapping_stats(db, campaign, merge_defs)
    else:
        missing, invalid = {}, {}
        mapped_keys = {d.get("key") for d in merge_defs if d.get("key") and d.get("default_value")}

    output = build_output(
        kind=payload.kind,
        document=document,
        html_source=payload.html_source,
        subject=payload.subject or "",
        preheader=payload.preheader or "",
        theme_tokens=tokens,
        org_settings=settings_data,
        reusable=reusable,
        merge_field_definitions=merge_defs,
        mapped_field_keys=mapped_keys,
        missing_value_counts=missing,
        invalid_value_counts=invalid,
        plain_text_override=payload.plain_text,
        plain_text_mode=payload.plain_text_mode,
    )

    blocked = bool((output.validation.get("blocks") or {}).get("save"))
    if blocked and not permissions.get("override_validation_warnings"):
        raise HTTPException(
            status_code=422,
            detail={
                "message": "This content cannot be saved until blocking issues are resolved.",
                "validation": output.validation,
            },
        )

    if draft:
        revision = draft
    else:
        next_no = (max((r.revision_no or 0) for r in revisions) + 1) if revisions else 1
        revision = TemplateRevision(
            public_code=await generate_unique_public_code(db, TemplateRevision, PREFIXES["revision"]),
            template_id=template.id if template else (campaign.selected_template_id if campaign else None),
            campaign_id=campaign.id if campaign else None,
            revision_no=next_no,
            status="draft",
            parent_revision_id=_pick_published(revisions).id if _pick_published(revisions) else None,
        )
        db.add(revision)

    revision.kind = payload.kind
    revision.document_json = document
    revision.html_source = payload.html_source
    revision.compiled_html = output.compiled_html
    revision.plain_text = output.plain_text
    revision.plain_text_mode = payload.plain_text_mode
    revision.subject = payload.subject
    revision.preheader = payload.preheader
    revision.theme_code = payload.theme_code or theme_code
    revision.theme_snapshot_json = tokens
    revision.merge_defs_json = merge_defs
    revision.change_summary = payload.change_summary
    revision.validation_summary = output.validation.get("summary")
    revision.author_id = current_user.id

    if template and payload.name:
        template.name = payload.name
    if template and payload.description is not None:
        template.description = payload.description
    if campaign:
        if payload.subject:
            campaign.subject = payload.subject
        if payload.preheader is not None:
            campaign.preheader = payload.preheader

    await db.commit()
    await db.refresh(revision)

    await _store_validation_report(db, revision, output.validation)
    await write_audit(
        db, current_user, "revision.saved",
        object_type=payload.target_type,
        object_code=payload.target_code,
        revision_no=revision.revision_no,
        summary=payload.change_summary or "Draft saved",
        request_id=request.headers.get("x-request-id"),
    )

    return SaveRevisionResponse(
        revision=_revision_content(revision, current_user),
        validation=output.validation,
        warnings=output.warnings,
        blocked=blocked,
    )


async def _store_validation_report(db: AsyncSession, revision: TemplateRevision, validation: dict) -> None:
    if not validation:
        return
    result = await db.execute(
        select(ValidationReportRecord).where(ValidationReportRecord.revision_id == revision.id)
    )
    record = result.scalar_one_or_none()
    if record:
        record.issues_json = validation.get("issues") or []
        record.summary_json = validation.get("summary") or {}
    else:
        db.add(
            ValidationReportRecord(
                revision_id=revision.id,
                issues_json=validation.get("issues") or [],
                summary_json=validation.get("summary") or {},
                dismissals_json=[],
            )
        )
    await db.commit()


@router.get("/revisions/{revision_code}", response_model=RevisionContent)
async def get_revision(
    revision_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(TemplateRevision).where(TemplateRevision.public_code == revision_code))
    revision = result.scalar_one_or_none()
    if not revision:
        raise HTTPException(status_code=404, detail="Revision not found")
    authors = await _authors_for(db, [revision])
    return _revision_content(revision, authors.get(revision.author_id))


@router.post("/revisions/{revision_code}/publish", response_model=SaveRevisionResponse)
async def publish_revision(
    revision_code: str,
    payload: PublishRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Publish a draft. Published revisions are immutable; a new draft is created on the next edit."""
    await require_permission(db, current_user, "publish_templates")
    result = await db.execute(select(TemplateRevision).where(TemplateRevision.public_code == revision_code))
    revision = result.scalar_one_or_none()
    if not revision:
        raise HTTPException(status_code=404, detail="Revision not found")
    if revision.status == "published":
        raise HTTPException(status_code=409, detail="This revision is already published.")

    settings_data = await get_composer_settings(db)
    permissions = await resolve_permissions(db, current_user.role)
    tokens, _code = await _theme_tokens(db, revision.theme_code)
    reusable = await _reusable_map(db, revision.document_json)

    output = build_output(
        kind=revision.kind or "visual",
        document=revision.document_json,
        html_source=revision.html_source,
        subject=revision.subject or "",
        preheader=revision.preheader or "",
        theme_tokens=tokens,
        org_settings=settings_data,
        reusable=reusable,
        merge_field_definitions=revision.merge_defs_json or [],
        mapped_field_keys={
            d.get("key") for d in (revision.merge_defs_json or []) if d.get("key") and d.get("default_value")
        },
        plain_text_override=revision.plain_text,
        plain_text_mode=revision.plain_text_mode or "generated",
    )
    if (output.validation.get("blocks") or {}).get("publish") and not (
        permissions.get("override_validation_warnings") and payload.override_reason
    ):
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Resolve the blocking issues before publishing.",
                "validation": output.validation,
            },
        )

    revision.status = "published"
    revision.published_at = datetime.now(timezone.utc)
    revision.compiled_html = output.compiled_html
    revision.plain_text = output.plain_text
    revision.validation_summary = output.validation.get("summary")
    if payload.change_summary:
        revision.change_summary = payload.change_summary

    # Keep the legacy Template row in step so the existing composer and sends work.
    if revision.template_id:
        template_result = await db.execute(select(Template).where(Template.id == revision.template_id))
        template = template_result.scalar_one_or_none()
        if template:
            template.html_output = output.compiled_html
            template.content_json = json.dumps(revision.document_json) if revision.document_json else template.content_json
            template.merge_field_definitions_json = revision.merge_defs_json or template.merge_field_definitions_json
    if revision.campaign_id:
        campaign_result = await db.execute(select(Campaign).where(Campaign.id == revision.campaign_id))
        campaign = campaign_result.scalar_one_or_none()
        if campaign:
            campaign.html_body = output.compiled_html
            campaign.content_json = json.dumps(revision.document_json) if revision.document_json else campaign.content_json

    await db.commit()
    await db.refresh(revision)

    if payload.override_reason:
        await write_audit(
            db, current_user, "validation.warning_overridden",
            object_type="revision", object_code=revision.public_code,
            revision_no=revision.revision_no, summary=payload.override_reason, commit=False,
        )
    await write_audit(
        db, current_user, "revision.published",
        object_type="revision", object_code=revision.public_code,
        revision_no=revision.revision_no, summary=payload.change_summary or "Revision published",
    )

    return SaveRevisionResponse(
        revision=_revision_content(revision, current_user),
        validation=output.validation,
        warnings=output.warnings,
        blocked=False,
    )


@router.post("/revisions/{revision_code}/restore", response_model=SaveRevisionResponse)
async def restore_revision(
    revision_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Copy an older revision's content into a new draft, leaving history intact."""
    result = await db.execute(select(TemplateRevision).where(TemplateRevision.public_code == revision_code))
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Revision not found")

    revisions = await _revisions_for_target(
        db, template_id=source.template_id, campaign_id=source.campaign_id
    )
    draft = _pick_draft(revisions)
    next_no = (max((r.revision_no or 0) for r in revisions) + 1) if revisions else 1

    if draft:
        target = draft
    else:
        target = TemplateRevision(
            public_code=await generate_unique_public_code(db, TemplateRevision, PREFIXES["revision"]),
            template_id=source.template_id,
            campaign_id=source.campaign_id,
            revision_no=next_no,
            status="draft",
        )
        db.add(target)

    target.kind = source.kind
    target.document_json = source.document_json
    target.html_source = source.html_source
    target.compiled_html = source.compiled_html
    target.plain_text = source.plain_text
    target.plain_text_mode = source.plain_text_mode
    target.subject = source.subject
    target.preheader = source.preheader
    target.theme_code = source.theme_code
    target.theme_snapshot_json = source.theme_snapshot_json
    target.merge_defs_json = source.merge_defs_json
    target.change_summary = f"Restored from revision {source.revision_no}"
    target.parent_revision_id = source.id
    target.author_id = current_user.id

    await db.commit()
    await db.refresh(target)
    await write_audit(
        db, current_user, "revision.restored",
        object_type="revision", object_code=target.public_code,
        revision_no=target.revision_no, summary=f"Restored content from revision {source.revision_no}",
    )
    return SaveRevisionResponse(
        revision=_revision_content(target, current_user),
        validation={},
        warnings=[],
        blocked=False,
    )


@router.post("/revisions/{revision_code}/fork-html", response_model=SaveRevisionResponse)
async def fork_to_custom_html(
    revision_code: str,
    payload: ForkHtmlRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Convert a visual revision into an editable custom-HTML revision.

    The visual revision is preserved so the structured document can be restored;
    the new revision's HTML becomes canonical and visual editing is unavailable.
    """
    await require_permission(db, current_user, "use_custom_html")
    result = await db.execute(select(TemplateRevision).where(TemplateRevision.public_code == revision_code))
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Revision not found")
    if source.kind == "custom_html":
        raise HTTPException(status_code=409, detail="This revision already uses custom HTML.")

    settings_data = await get_composer_settings(db)
    tokens, _code = await _theme_tokens(db, source.theme_code)
    reusable = await _reusable_map(db, source.document_json)
    generated = build_output(
        kind="visual",
        document=source.document_json,
        subject=source.subject or "",
        preheader=source.preheader or "",
        theme_tokens=tokens,
        org_settings=settings_data,
        reusable=reusable,
        merge_field_definitions=source.merge_defs_json or [],
        run_validation=False,
    )

    revisions = await _revisions_for_target(db, template_id=source.template_id, campaign_id=source.campaign_id)
    next_no = (max((r.revision_no or 0) for r in revisions) + 1) if revisions else 1

    # Freeze the visual revision so the structured document can be restored later.
    if source.status == "draft":
        source.status = "archived"
        source.change_summary = (source.change_summary or "") + " (kept as the last visual revision)"

    forked = TemplateRevision(
        public_code=await generate_unique_public_code(db, TemplateRevision, PREFIXES["revision"]),
        template_id=source.template_id,
        campaign_id=source.campaign_id,
        revision_no=next_no,
        status="draft",
        kind="custom_html",
        document_json=source.document_json,
        html_source=generated.compiled_html,
        compiled_html=generated.compiled_html,
        plain_text=generated.plain_text,
        plain_text_mode=source.plain_text_mode or "generated",
        subject=source.subject,
        preheader=source.preheader,
        theme_code=source.theme_code,
        theme_snapshot_json=tokens,
        merge_defs_json=source.merge_defs_json,
        change_summary=payload.change_summary or "Switched to custom HTML",
        parent_revision_id=source.id,
        author_id=current_user.id,
    )
    db.add(forked)
    await db.commit()
    await db.refresh(forked)
    await write_audit(
        db, current_user, "custom_html.enabled",
        object_type="revision", object_code=forked.public_code,
        revision_no=forked.revision_no,
        summary=f"Forked from visual revision {source.revision_no}",
    )
    return SaveRevisionResponse(
        revision=_revision_content(forked, current_user),
        validation={},
        warnings=["Visual editing is unavailable for custom HTML revisions."],
        blocked=False,
    )


@router.post("/revisions/{revision_code}/dismiss-issue")
async def dismiss_issue(
    revision_code: str,
    payload: DismissIssueRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record a policy-permitted dismissal with its reason."""
    await require_permission(db, current_user, "override_validation_warnings")
    settings_data = await get_composer_settings(db)
    if payload.code in (settings_data.get("non_dismissible_codes") or []):
        raise HTTPException(status_code=422, detail="This issue cannot be dismissed by policy.")

    result = await db.execute(select(TemplateRevision).where(TemplateRevision.public_code == revision_code))
    revision = result.scalar_one_or_none()
    if not revision:
        raise HTTPException(status_code=404, detail="Revision not found")

    report_result = await db.execute(
        select(ValidationReportRecord).where(ValidationReportRecord.revision_id == revision.id)
    )
    record = report_result.scalar_one_or_none()
    entry = {
        "code": payload.code,
        "nodeId": payload.node_id,
        "line": payload.line,
        "reason": payload.reason,
        "user": current_user.email,
        "at": datetime.now(timezone.utc).isoformat(),
    }
    if record:
        record.dismissals_json = [*(record.dismissals_json or []), entry]
    else:
        db.add(
            ValidationReportRecord(
                revision_id=revision.id, issues_json=[], summary_json={}, dismissals_json=[entry]
            )
        )
    await db.commit()
    await write_audit(
        db, current_user, "validation.warning_overridden",
        object_type="revision", object_code=revision.public_code,
        revision_no=revision.revision_no, summary=f"{payload.code}: {payload.reason}",
    )
    return {"dismissals": (record.dismissals_json if record else [entry])}


@router.get("/revisions/{revision_code}/dismissals")
async def list_dismissals(
    revision_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(TemplateRevision).where(TemplateRevision.public_code == revision_code))
    revision = result.scalar_one_or_none()
    if not revision:
        raise HTTPException(status_code=404, detail="Revision not found")
    report_result = await db.execute(
        select(ValidationReportRecord).where(ValidationReportRecord.revision_id == revision.id)
    )
    record = report_result.scalar_one_or_none()
    return {"dismissals": (record.dismissals_json or []) if record else []}


# ── merge fields and mapping ──────────────────────────────────────────────────

@router.get("/targets/{target_type}/{target_code}/merge-fields", response_model=MergeFieldContextResponse)
async def merge_field_context(
    target_type: str,
    target_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Definitions, available columns, mapping rows and example resolved values."""
    if target_type == "template":
        template = await _load_template(db, target_code)
        definitions = template.merge_field_definitions_json or []
        mapping = [
            MergeFieldMappingRow(
                key=d.get("key", ""),
                label=d.get("label") or d.get("key", ""),
                description=d.get("description"),
                data_type=d.get("data_type", "text"),
                required=bool(d.get("required")),
                template_default=d.get("default_value"),
                source="template_default" if d.get("default_value") else "unmapped",
                example_value=d.get("default_value") or f"[{d.get('label') or d.get('key')}]",
            )
            for d in definitions
            if d.get("key")
        ]
        return MergeFieldContextResponse(
            definitions=definitions,
            system_fields=SYSTEM_MERGE_FIELDS,
            available_columns=[],
            mapping=mapping,
            sample_values={
                d.get("key"): d.get("default_value") or f"[{d.get('label') or d.get('key')}]"
                for d in definitions
                if d.get("key")
            },
            complete=all(not d.get("required") or d.get("default_value") for d in definitions),
        )

    campaign = await _load_campaign(db, target_code)
    campaign_defs = campaign.campaign_field_definitions_json or []
    bindings = campaign.template_field_bindings_json or []
    binding_map = {
        b.get("template_field_key"): b.get("campaign_field_key")
        for b in bindings
        if isinstance(b, dict) and b.get("template_field_key")
    }

    template_defs: list[dict] = []
    if campaign.selected_template_id:
        template_result = await db.execute(select(Template).where(Template.id == campaign.selected_template_id))
        template = template_result.scalar_one_or_none()
        if template:
            template_defs = template.merge_field_definitions_json or []

    definitions = template_defs or campaign_defs
    available_columns = sorted(
        {
            d.get("source_column") or d.get("key")
            for d in campaign_defs
            if d.get("source_column") or d.get("key")
        }
    )

    sample_result = await db.execute(
        select(Recipient)
        .where(Recipient.campaign_id == campaign.id, Recipient.is_included.is_(True))
        .order_by(Recipient.row_index, Recipient.id)
        .limit(1)
    )
    sample = sample_result.scalar_one_or_none()
    sample_data = (sample.merge_data or {}) if sample else {}

    count_result = await db.execute(
        select(func.count()).select_from(Recipient).where(
            Recipient.campaign_id == campaign.id, Recipient.is_included.is_(True)
        )
    )
    total = count_result.scalar() or 0

    _mapped, missing, invalid = await _mapping_stats(db, campaign, definitions)

    rows: list[MergeFieldMappingRow] = []
    for definition in definitions:
        key = definition.get("key")
        if not key:
            continue
        bound = binding_map.get(key)
        source = "unmapped"
        mapped_column = None
        static_value = None
        if definition.get("source_kind") == "system":
            source = "system"
        elif bound:
            source = "column"
            mapped_column = bound
        elif key in {d.get("key") for d in campaign_defs}:
            source = "column"
            mapped_column = key
        elif definition.get("static_value"):
            source = "static"
            static_value = definition.get("static_value")
        elif definition.get("default_value"):
            source = "template_default"

        example = ""
        if mapped_column:
            example = str(sample_data.get(mapped_column) or "")
        if not example:
            example = static_value or definition.get("default_value") or ""
        if not example:
            example = f"[{definition.get('label') or key}]"

        rows.append(
            MergeFieldMappingRow(
                key=key,
                label=definition.get("label") or key,
                description=definition.get("description"),
                data_type=definition.get("data_type", "text"),
                required=bool(definition.get("required")),
                template_default=definition.get("default_value"),
                mapped_column=mapped_column,
                static_value=static_value,
                source=source,
                example_value=example,
                missing_count=missing.get(key, 0),
                invalid_count=invalid.get(key, 0),
            )
        )

    sample_values = {row.key: row.example_value or "" for row in rows}
    complete = all(
        row.source != "unmapped" or not row.required for row in rows
    )
    return MergeFieldContextResponse(
        definitions=definitions,
        system_fields=SYSTEM_MERGE_FIELDS,
        available_columns=available_columns,
        mapping=rows,
        sample_values=sample_values,
        total_recipients=total,
        complete=complete,
    )


@router.put("/targets/{target_type}/{target_code}/merge-fields")
async def save_merge_fields(
    target_type: str,
    target_code: str,
    payload: SaveMappingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Persist definitions and, for campaigns, the column/static mapping."""
    await require_permission(db, current_user, "manage_merge_fields")
    if target_type == "template":
        template = await _load_template(db, target_code)
        if payload.definitions is not None:
            template.merge_field_definitions_json = payload.definitions
        await db.commit()
        await write_audit(
            db, current_user, "merge_fields.updated",
            object_type="template", object_code=template.public_code,
            summary=f"{len(payload.definitions or [])} field definition(s) saved",
        )
        return {"definitions": template.merge_field_definitions_json or []}

    campaign = await _load_campaign(db, target_code)
    if payload.definitions is not None:
        campaign.campaign_field_definitions_json = payload.definitions
    if payload.mapping is not None:
        bindings = []
        for row in payload.mapping:
            key = row.get("key")
            if not key:
                continue
            bindings.append(
                {
                    "template_field_key": key,
                    "campaign_field_key": row.get("mapped_column") if row.get("source") == "column" else None,
                }
            )
        campaign.template_field_bindings_json = bindings
    await db.commit()
    await write_audit(
        db, current_user, "merge_fields.mapped",
        object_type="campaign", object_code=campaign.public_code,
        summary=f"{len(payload.mapping or [])} mapping row(s) saved",
    )
    return {
        "definitions": campaign.campaign_field_definitions_json or [],
        "bindings": campaign.template_field_bindings_json or [],
    }


# ── recipient-aware preview ───────────────────────────────────────────────────

def _system_link_values(campaign: Optional[Campaign], recipient: Optional[Recipient]) -> dict[str, str]:
    base = "#"
    return {
        "unsubscribe_url": base,
        "preferences_url": base,
        "view_in_browser_url": base,
        "campaign_name": campaign.name if campaign else "",
        "current_year": str(datetime.now(timezone.utc).year),
        "email": recipient.email if recipient else "",
    }


@router.post("/preview/recipient", response_model=RecipientPreviewResponse)
async def preview_with_recipient(
    payload: RecipientPreviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Compile the draft, then resolve merge fields against a real recipient row."""
    settings_data = await get_composer_settings(db)
    tokens, _code = await _theme_tokens(db, payload.theme_code)
    document = doc_model.normalize_document(payload.document) if payload.document else None
    reusable = await _reusable_map(db, document)

    output = build_output(
        kind=payload.kind,
        document=document,
        html_source=payload.html_source,
        subject=payload.subject,
        preheader=payload.preheader,
        theme_tokens=tokens,
        org_settings=settings_data,
        reusable=reusable,
        merge_field_definitions=payload.merge_field_definitions,
        plain_text_override=payload.plain_text,
        plain_text_mode=payload.plain_text_mode,
        run_validation=False,
    )

    campaign: Optional[Campaign] = None
    recipient: Optional[Recipient] = None
    total = 0
    index = payload.recipient_index or 0

    if payload.target_type == "campaign":
        campaign = await _load_campaign(db, payload.target_code)
        count_result = await db.execute(
            select(func.count()).select_from(Recipient).where(
                Recipient.campaign_id == campaign.id, Recipient.is_included.is_(True)
            )
        )
        total = count_result.scalar() or 0
        if total:
            index = max(0, min(index, total - 1))
            row_result = await db.execute(
                select(Recipient)
                .where(Recipient.campaign_id == campaign.id, Recipient.is_included.is_(True))
                .order_by(Recipient.row_index, Recipient.id)
                .offset(index)
                .limit(1)
            )
            recipient = row_result.scalar_one_or_none()

    campaign_defs = (campaign.campaign_field_definitions_json if campaign else None) or []
    bindings = (campaign.template_field_bindings_json if campaign else None) or []
    recipient_vars = dict(recipient.merge_data or {}) if recipient else {}
    recipient_vars.update(payload.sample_overrides or {})

    if recipient or campaign:
        context, defaults_used, warnings, missing = merge_engine.build_render_context(
            recipient_vars, campaign_defs, payload.merge_field_definitions, bindings
        )
    else:
        context, warnings = merge_engine.build_template_preview_context(payload.merge_field_definitions)
        defaults_used = [
            d.get("key") for d in payload.merge_field_definitions if d.get("key") and d.get("default_value")
        ]
        missing = [
            d.get("key")
            for d in payload.merge_field_definitions
            if d.get("required") and not d.get("default_value")
        ]

    context.update(_system_link_values(campaign, recipient))
    rendered = merge_engine.render_campaign_content(
        payload.subject, payload.preheader, output.compiled_html, output.plain_text, context
    )

    return RecipientPreviewResponse(
        subject=rendered["subject"],
        preheader=rendered["preheader"],
        html=rendered["html"],
        plain_text=rendered["plain_text"],
        resolved_values={k: str(v) for k, v in context.items()},
        defaults_used=[k for k in defaults_used if k],
        missing_fields=[k for k in missing if k],
        warnings=[*output.warnings, *warnings],
        recipient=(
            {
                "code": recipient.public_code,
                "email": recipient.email,
                "index": index,
                "display_index": index + 1,
                "variables": recipient.merge_data or {},
            }
            if recipient
            else None
        ),
        has_previous=bool(recipient) and index > 0,
        has_next=bool(recipient) and index + 1 < total,
        total=total,
    )


# ── test send ─────────────────────────────────────────────────────────────────

@router.post("/test-send", response_model=TestSendResponse)
async def test_send(
    payload: TestSendRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Compile the current draft, validate it, then send to the given addresses."""
    await require_permission(db, current_user, "send_test_emails")
    if not payload.recipients:
        raise HTTPException(status_code=400, detail="Add at least one test recipient.")
    if len(payload.recipients) > 10:
        raise HTTPException(status_code=400, detail="Send tests to at most 10 addresses at a time.")

    settings_data = await get_composer_settings(db)
    permissions = await resolve_permissions(db, current_user.role)
    tokens, _code = await _theme_tokens(db, payload.theme_code)
    document = doc_model.normalize_document(payload.document) if payload.document else None
    reusable = await _reusable_map(db, document)

    campaign: Optional[Campaign] = None
    if payload.target_type == "campaign":
        campaign = await _load_campaign(db, payload.target_code)

    subject = payload.subject or (campaign.subject if campaign else "") or "(no subject)"
    preheader = payload.preheader or (campaign.preheader if campaign else "") or ""

    output = build_output(
        kind=payload.kind,
        document=document,
        html_source=payload.html_source,
        subject=subject,
        preheader=preheader,
        theme_tokens=tokens,
        org_settings=settings_data,
        reusable=reusable,
        merge_field_definitions=payload.merge_field_definitions,
        plain_text_override=payload.plain_text,
        plain_text_mode=payload.plain_text_mode,
    )
    if (output.validation.get("blocks") or {}).get("test_send") and not (
        permissions.get("override_validation_warnings") and payload.override_reason
    ):
        return TestSendResponse(
            results=[],
            validation=output.validation,
            blocked=True,
            message="Resolve the blocking issues before sending a test.",
        )

    # Sample data for merge resolution
    context: dict[str, Any] = {}
    if payload.sample_source == "custom":
        context.update(payload.custom_sample or {})
    elif payload.sample_source in ("recipient", "first_valid") and campaign:
        query = (
            select(Recipient)
            .where(Recipient.campaign_id == campaign.id, Recipient.is_included.is_(True))
            .order_by(Recipient.row_index, Recipient.id)
        )
        if payload.sample_source == "recipient" and payload.recipient_index:
            query = query.offset(max(0, payload.recipient_index))
        row_result = await db.execute(query.limit(1))
        recipient = row_result.scalar_one_or_none()
        if recipient:
            resolved, _defaults, _warnings, _missing = merge_engine.build_render_context(
                recipient.merge_data or {},
                campaign.campaign_field_definitions_json or [],
                payload.merge_field_definitions,
                campaign.template_field_bindings_json or [],
            )
            context.update(resolved)
    if not context:
        template_context, _warnings = merge_engine.build_template_preview_context(payload.merge_field_definitions)
        context.update(template_context)
    context.update(_system_link_values(campaign, None))

    rendered = merge_engine.render_campaign_content(
        subject, preheader, output.compiled_html, output.plain_text, context
    )

    # Sender identity
    from_email = campaign.from_email if campaign else None
    from_name = campaign.from_name if campaign else None
    reply_to = payload.reply_to or (campaign.reply_to if campaign else None)
    if payload.sender_identity_code:
        identity_result = await db.execute(
            select(SenderIdentity).where(SenderIdentity.public_code == payload.sender_identity_code)
        )
        identity = identity_result.scalar_one_or_none()
        if identity:
            from_email, from_name = identity.from_email, identity.from_name
            reply_to = reply_to or identity.reply_to
    if not from_email:
        default_result = await db.execute(
            select(SenderIdentity).where(SenderIdentity.is_default.is_(True), SenderIdentity.is_active.is_(True)).limit(1)
        )
        identity = default_result.scalar_one_or_none()
        if identity:
            from_email, from_name = identity.from_email, identity.from_name
            reply_to = reply_to or identity.reply_to
    if not from_email:
        raise HTTPException(
            status_code=400,
            detail="No sender address is configured. Add a sender identity before sending a test.",
        )

    attachments: list[dict] = []
    if payload.include_attachments and campaign:
        attach_result = await db.execute(
            select(CampaignAttachment).where(CampaignAttachment.campaign_id == campaign.id)
        )
        for record in attach_result.scalars().all():
            if record.file_path and os.path.exists(record.file_path):
                with open(record.file_path, "rb") as handle:
                    attachments.append(
                        {
                            "filename": record.filename,
                            "content": handle.read(),
                            "content_id": record.content_id,
                        }
                    )

    test_subject = f"[TEST] {rendered['subject']}" if payload.mark_as_test else rendered["subject"]
    sender_client = get_email_sender()
    results: list[TestSendResult] = []
    for address in payload.recipients:
        target = address.strip()
        if not target or "@" not in target:
            results.append(
                TestSendResult(
                    recipient=address,
                    status="failed",
                    error="Not a valid email address.",
                    timestamp=datetime.now(timezone.utc).isoformat(),
                )
            )
            continue
        try:
            response = await sender_client.send_email(
                to_email=target,
                subject=test_subject,
                html_body=rendered["html"] if payload.include_html else "",
                plain_body=rendered["plain_text"] if payload.include_plain_text else None,
                from_email=from_email,
                from_name=from_name,
                reply_to=reply_to,
                attachments=attachments or None,
                custom_headers={"X-Composer-Test": "true"} if payload.mark_as_test else None,
            )
            results.append(
                TestSendResult(
                    recipient=target,
                    status="sent" if response.get("success") else "failed",
                    provider_response=str(response.get("message_id") or "")[:200] or None,
                    error=response.get("error"),
                    timestamp=datetime.now(timezone.utc).isoformat(),
                )
            )
        except Exception as exc:  # pragma: no cover - provider failure path
            logger.exception("Composer test send failed")
            results.append(
                TestSendResult(
                    recipient=target,
                    status="failed",
                    error=str(exc),
                    timestamp=datetime.now(timezone.utc).isoformat(),
                )
            )
    await sender_client.close()

    revisions = await _revisions_for_target(
        db,
        template_id=(await _load_template(db, payload.target_code)).id if payload.target_type == "template" else None,
        campaign_id=campaign.id if campaign else None,
    )
    draft = _pick_draft(revisions)
    await write_audit(
        db, current_user, "test.sent",
        object_type=payload.target_type,
        object_code=payload.target_code,
        revision_no=draft.revision_no if draft else None,
        summary=f"Test sent to {', '.join(payload.recipients[:5])}",
    )

    return TestSendResponse(
        results=results,
        revision_code=draft.public_code if draft else None,
        validation=output.validation,
        blocked=False,
        message=None,
    )


# ── campaign attachments ──────────────────────────────────────────────────────

@router.get("/campaigns/{campaign_code}/attachments", response_model=AttachmentListResponse)
async def list_attachments(
    campaign_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    campaign = await _load_campaign(db, campaign_code)
    settings_data = await get_composer_settings(db)
    result = await db.execute(select(CampaignAttachment).where(CampaignAttachment.campaign_id == campaign.id))
    records = list(result.scalars().all())
    items: list[AttachmentResponse] = []
    total = 0
    for record in records:
        size = os.path.getsize(record.file_path) if record.file_path and os.path.exists(record.file_path) else 0
        total += size
        items.append(
            AttachmentResponse(
                id=record.id,
                filename=record.filename,
                content_type=record.content_type,
                size=size,
                is_inline=bool(record.is_inline),
                content_id=record.content_id,
                download_url=f"/api/composer/campaigns/{campaign_code}/attachments/{record.id}",
            )
        )
    return AttachmentListResponse(
        attachments=items,
        total_size=total,
        max_total_size_kb=int(settings_data.get("max_total_attachment_size_kb", 20480)),
        max_count=int(settings_data.get("max_attachment_count", 5)),
    )


@router.post("/campaigns/{campaign_code}/attachments", response_model=AttachmentResponse)
async def upload_attachment(
    campaign_code: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    campaign = await _load_campaign(db, campaign_code)
    settings_data = await get_composer_settings(db)

    extension = (os.path.splitext(file.filename or "")[1] or "").lstrip(".").lower()
    blocked = [e.lower() for e in settings_data.get("blocked_attachment_types") or []]
    allowed = [e.lower() for e in settings_data.get("allowed_attachment_types") or []]
    if extension in blocked or (allowed and extension not in allowed):
        raise HTTPException(status_code=400, detail=f"'{extension or 'unknown'}' files are not allowed as attachments.")

    existing_result = await db.execute(
        select(CampaignAttachment).where(CampaignAttachment.campaign_id == campaign.id)
    )
    existing = list(existing_result.scalars().all())
    max_count = int(settings_data.get("max_attachment_count", 5))
    if len(existing) >= max_count:
        raise HTTPException(status_code=400, detail=f"At most {max_count} attachments are allowed.")
    if any(a.filename == file.filename for a in existing):
        raise HTTPException(status_code=409, detail="An attachment with this name already exists.")

    content = await file.read()
    size_kb = len(content) / 1024
    if size_kb > float(settings_data.get("max_attachment_size_kb", 10240)):
        raise HTTPException(
            status_code=400,
            detail=f"This file is {size_kb / 1024:.1f}MB, above the per-file limit.",
        )
    existing_total = sum(
        os.path.getsize(a.file_path) for a in existing if a.file_path and os.path.exists(a.file_path)
    )
    if (existing_total + len(content)) / 1024 > float(settings_data.get("max_total_attachment_size_kb", 20480)):
        raise HTTPException(status_code=400, detail="Adding this file exceeds the total attachment size limit.")

    os.makedirs(ATTACHMENT_DIR, exist_ok=True)
    stored_name = f"{campaign.id}_{uuid.uuid4().hex[:8]}_{os.path.basename(file.filename or 'file')}"
    path = os.path.join(ATTACHMENT_DIR, stored_name)
    with open(path, "wb") as handle:
        handle.write(content)

    record = CampaignAttachment(
        campaign_id=campaign.id,
        filename=file.filename or stored_name,
        file_path=path,
        content_type=file.content_type,
        is_inline=False,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    await write_audit(
        db, current_user, "attachment.added",
        object_type="campaign", object_code=campaign.public_code,
        summary=f"{record.filename} ({len(content) / 1024:.0f}KB)",
    )
    return AttachmentResponse(
        id=record.id,
        filename=record.filename,
        content_type=record.content_type,
        size=len(content),
        is_inline=False,
        content_id=record.content_id,
        download_url=f"/api/composer/campaigns/{campaign_code}/attachments/{record.id}",
    )


@router.get("/campaigns/{campaign_code}/attachments/{attachment_id}")
async def download_attachment(
    campaign_code: str,
    attachment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    campaign = await _load_campaign(db, campaign_code)
    result = await db.execute(
        select(CampaignAttachment).where(
            CampaignAttachment.id == attachment_id, CampaignAttachment.campaign_id == campaign.id
        )
    )
    record = result.scalar_one_or_none()
    if not record or not record.file_path or not os.path.exists(record.file_path):
        raise HTTPException(status_code=404, detail="Attachment not found")
    with open(record.file_path, "rb") as handle:
        data = handle.read()
    return Response(
        content=data,
        media_type=record.content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{record.filename}"'},
    )


@router.delete("/campaigns/{campaign_code}/attachments/{attachment_id}")
async def delete_attachment(
    campaign_code: str,
    attachment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    campaign = await _load_campaign(db, campaign_code)
    result = await db.execute(
        select(CampaignAttachment).where(
            CampaignAttachment.id == attachment_id, CampaignAttachment.campaign_id == campaign.id
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Attachment not found")
    filename = record.filename
    if record.file_path and os.path.exists(record.file_path):
        try:
            os.remove(record.file_path)
        except OSError:
            logger.warning("Could not delete attachment file %s", record.file_path)
    await db.delete(record)
    await db.commit()
    await write_audit(
        db, current_user, "attachment.removed",
        object_type="campaign", object_code=campaign.public_code, summary=filename,
    )
    return {"success": True}


# ── snapshots ─────────────────────────────────────────────────────────────────

@router.get("/campaigns/{campaign_code}/snapshot")
async def get_snapshot(
    campaign_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The frozen content a campaign is sending, when one exists."""
    campaign = await _load_campaign(db, campaign_code)
    result = await db.execute(
        select(CampaignTemplateSnapshot)
        .where(CampaignTemplateSnapshot.campaign_id == campaign.id)
        .order_by(CampaignTemplateSnapshot.id.desc())
        .limit(1)
    )
    snapshot = result.scalar_one_or_none()
    if not snapshot:
        return {"snapshot": None}
    return {
        "snapshot": {
            "public_code": snapshot.public_code,
            "kind": snapshot.kind,
            "subject": snapshot.subject,
            "preheader": snapshot.preheader,
            "compiled_html": snapshot.compiled_html,
            "plain_text": snapshot.plain_text,
            "created_at": _iso(snapshot.created_at),
            "attachment_refs": snapshot.attachment_refs_json or [],
        }
    }


@router.post("/campaigns/{campaign_code}/snapshot")
async def create_snapshot_endpoint(
    campaign_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    campaign = await _load_campaign(db, campaign_code)
    snapshot = await create_campaign_snapshot(db, campaign, current_user)
    if not snapshot:
        raise HTTPException(status_code=422, detail="There is no composer content to snapshot for this campaign.")
    return {"snapshot_code": snapshot.public_code}


async def create_campaign_snapshot(
    db: AsyncSession,
    campaign: Campaign,
    user: Optional[User] = None,
) -> Optional[CampaignTemplateSnapshot]:
    """
    Freeze the campaign's composer content so later template edits cannot change
    an in-flight or completed campaign. Called when sending starts.
    """
    revisions = await _revisions_for_target(db, campaign_id=campaign.id)
    revision = _pick_published(revisions) or _pick_draft(revisions)
    if not revision and campaign.selected_template_id:
        template_revisions = await _revisions_for_target(db, template_id=campaign.selected_template_id)
        revision = _pick_published(template_revisions)
    if not revision or not revision.compiled_html:
        return None

    attach_result = await db.execute(
        select(CampaignAttachment).where(CampaignAttachment.campaign_id == campaign.id)
    )
    attachment_refs = [
        {"id": a.id, "filename": a.filename, "path": a.file_path, "content_id": a.content_id}
        for a in attach_result.scalars().all()
    ]

    snapshot = CampaignTemplateSnapshot(
        public_code=await generate_unique_public_code(db, CampaignTemplateSnapshot, PREFIXES["snapshot"]),
        campaign_id=campaign.id,
        revision_id=revision.id,
        template_id=revision.template_id,
        kind=revision.kind,
        document_json=revision.document_json,
        html_source=revision.html_source,
        compiled_html=revision.compiled_html,
        plain_text=revision.plain_text,
        subject=revision.subject or campaign.subject,
        preheader=revision.preheader or campaign.preheader,
        theme_snapshot_json=revision.theme_snapshot_json,
        merge_defs_json=revision.merge_defs_json,
        field_bindings_json=campaign.template_field_bindings_json,
        attachment_refs_json=attachment_refs,
    )
    db.add(snapshot)
    await db.commit()
    await db.refresh(snapshot)
    await write_audit(
        db, user, "snapshot.created",
        object_type="campaign", object_code=campaign.public_code,
        revision_no=revision.revision_no,
        summary=f"Content frozen from revision {revision.revision_no}",
    )
    return snapshot
