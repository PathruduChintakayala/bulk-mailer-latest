"""Pydantic schemas for the composer API (/api/composer/*)."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

TargetType = Literal["template", "campaign"]
RevisionKind = Literal["visual", "custom_html"]
RevisionStatus = Literal["draft", "published", "archived"]
PlainTextMode = Literal["generated", "manual"]


# ── revisions ─────────────────────────────────────────────────────────────────

class RevisionSummary(BaseModel):
    public_code: str
    revision_no: int
    status: RevisionStatus
    kind: RevisionKind
    subject: Optional[str] = None
    preheader: Optional[str] = None
    change_summary: Optional[str] = None
    author_name: Optional[str] = None
    author_email: Optional[str] = None
    validation_summary: Optional[dict] = None
    theme_code: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    published_at: Optional[str] = None
    parent_revision_code: Optional[str] = None
    campaign_usage: int = 0


class RevisionContent(RevisionSummary):
    document: Optional[dict] = None
    html_source: Optional[str] = None
    compiled_html: Optional[str] = None
    plain_text: Optional[str] = None
    plain_text_mode: PlainTextMode = "generated"
    theme_overrides: Optional[dict] = None
    merge_field_definitions: list[dict] = Field(default_factory=list)


class SaveRevisionRequest(BaseModel):
    target_type: TargetType
    target_code: str
    base_revision_code: Optional[str] = None
    kind: RevisionKind = "visual"
    document: Optional[dict] = None
    html_source: Optional[str] = None
    plain_text: Optional[str] = None
    plain_text_mode: PlainTextMode = "generated"
    subject: Optional[str] = None
    preheader: Optional[str] = None
    theme_code: Optional[str] = None
    merge_field_definitions: Optional[list[dict]] = None
    change_summary: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None


class SaveRevisionResponse(BaseModel):
    revision: RevisionContent
    validation: dict
    warnings: list[str] = Field(default_factory=list)
    blocked: bool = False


class ConflictResponse(BaseModel):
    detail: str
    latest_revision: RevisionSummary


class PublishRequest(BaseModel):
    change_summary: Optional[str] = None
    override_reason: Optional[str] = None


class ForkHtmlRequest(BaseModel):
    change_summary: Optional[str] = None


# ── compile ───────────────────────────────────────────────────────────────────

class CompileRequest(BaseModel):
    kind: RevisionKind = "visual"
    document: Optional[dict] = None
    html_source: Optional[str] = None
    subject: str = ""
    preheader: str = ""
    theme_code: Optional[str] = None
    theme_overrides: Optional[dict] = None
    merge_field_definitions: list[dict] = Field(default_factory=list)
    plain_text: Optional[str] = None
    plain_text_mode: PlainTextMode = "generated"
    target_type: Optional[TargetType] = None
    target_code: Optional[str] = None
    run_validation: bool = True


class CompileResponse(BaseModel):
    compiled_html: str
    plain_text: str
    warnings: list[str] = Field(default_factory=list)
    removed: list[str] = Field(default_factory=list)
    validation: dict = Field(default_factory=dict)
    sanitized: bool = True
    inlined: bool = False
    auto_appended: list[str] = Field(default_factory=list)
    size_bytes: int = 0


# ── preferences ───────────────────────────────────────────────────────────────

class PreferencesResponse(BaseModel):
    prefs: dict = Field(default_factory=dict)


class PreferencesRequest(BaseModel):
    prefs: dict = Field(default_factory=dict)


# ── themes ────────────────────────────────────────────────────────────────────

class ThemeResponse(BaseModel):
    public_code: str
    name: str
    description: Optional[str] = None
    tokens: dict = Field(default_factory=dict)
    is_builtin: bool = False
    is_org_default: bool = False
    is_locked: bool = False
    archived_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ThemeCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    tokens: dict = Field(default_factory=dict)


class ThemeUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tokens: Optional[dict] = None
    is_locked: Optional[bool] = None


# ── reusable blocks ───────────────────────────────────────────────────────────

class ReusableBlockResponse(BaseModel):
    public_code: str
    name: str
    description: Optional[str] = None
    category: str = "general"
    tags: list[str] = Field(default_factory=list)
    thumbnail: Optional[str] = None
    fragment_kind: str = "blocks"
    scope: str = "private"
    is_locked: bool = False
    owner_name: Optional[str] = None
    usage_count: int = 0
    archived_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ReusableBlockDetail(ReusableBlockResponse):
    fragment: dict = Field(default_factory=dict)


class ReusableBlockCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    category: str = "general"
    tags: list[str] = Field(default_factory=list)
    fragment: dict
    fragment_kind: Literal["blocks", "section"] = "blocks"
    scope: Literal["private", "shared"] = "private"
    is_locked: bool = False
    thumbnail: Optional[str] = None


class ReusableBlockUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[list[str]] = None
    fragment: Optional[dict] = None
    scope: Optional[Literal["private", "shared"]] = None
    is_locked: Optional[bool] = None
    thumbnail: Optional[str] = None


# ── merge fields & mapping ────────────────────────────────────────────────────

class MergeFieldMappingRow(BaseModel):
    key: str
    label: str
    description: Optional[str] = None
    data_type: str = "text"
    required: bool = False
    template_default: Optional[str] = None
    mapped_column: Optional[str] = None
    static_value: Optional[str] = None
    source: Literal["column", "static", "template_default", "system", "unmapped"] = "unmapped"
    example_value: Optional[str] = None
    missing_count: int = 0
    invalid_count: int = 0


class MergeFieldContextResponse(BaseModel):
    definitions: list[dict] = Field(default_factory=list)
    system_fields: list[dict] = Field(default_factory=list)
    available_columns: list[str] = Field(default_factory=list)
    mapping: list[MergeFieldMappingRow] = Field(default_factory=list)
    sample_values: dict[str, str] = Field(default_factory=dict)
    total_recipients: int = 0
    complete: bool = True


class SaveMappingRequest(BaseModel):
    definitions: Optional[list[dict]] = None
    mapping: Optional[list[dict]] = None


# ── recipient preview ─────────────────────────────────────────────────────────

class RecipientPreviewRequest(BaseModel):
    target_type: TargetType
    target_code: str
    recipient_index: Optional[int] = None
    kind: RevisionKind = "visual"
    document: Optional[dict] = None
    html_source: Optional[str] = None
    subject: str = ""
    preheader: str = ""
    theme_code: Optional[str] = None
    merge_field_definitions: list[dict] = Field(default_factory=list)
    plain_text: Optional[str] = None
    plain_text_mode: PlainTextMode = "generated"
    sample_overrides: dict[str, str] = Field(default_factory=dict)


class RecipientPreviewResponse(BaseModel):
    subject: str
    preheader: str
    html: str
    plain_text: str
    resolved_values: dict[str, str] = Field(default_factory=dict)
    defaults_used: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    recipient: Optional[dict] = None
    has_previous: bool = False
    has_next: bool = False
    total: int = 0


# ── test send ─────────────────────────────────────────────────────────────────

class TestSendRequest(BaseModel):
    target_type: TargetType
    target_code: str
    recipients: list[str]
    sender_identity_code: Optional[str] = None
    reply_to: Optional[str] = None
    subject: Optional[str] = None
    preheader: Optional[str] = None
    kind: RevisionKind = "visual"
    document: Optional[dict] = None
    html_source: Optional[str] = None
    theme_code: Optional[str] = None
    merge_field_definitions: list[dict] = Field(default_factory=list)
    plain_text: Optional[str] = None
    plain_text_mode: PlainTextMode = "generated"
    sample_source: Literal["recipient", "first_valid", "custom", "template_defaults"] = "template_defaults"
    recipient_index: Optional[int] = None
    custom_sample: dict[str, str] = Field(default_factory=dict)
    include_html: bool = True
    include_plain_text: bool = True
    mark_as_test: bool = True
    include_attachments: bool = False
    override_reason: Optional[str] = None


class TestSendResult(BaseModel):
    recipient: str
    status: Literal["queued", "sending", "sent", "failed"]
    provider_response: Optional[str] = None
    error: Optional[str] = None
    timestamp: Optional[str] = None


class TestSendResponse(BaseModel):
    results: list[TestSendResult] = Field(default_factory=list)
    revision_code: Optional[str] = None
    validation: dict = Field(default_factory=dict)
    blocked: bool = False
    message: Optional[str] = None


# ── attachments ───────────────────────────────────────────────────────────────

class AttachmentResponse(BaseModel):
    id: int
    filename: str
    content_type: Optional[str] = None
    size: int = 0
    is_inline: bool = False
    content_id: Optional[str] = None
    download_url: str


class AttachmentListResponse(BaseModel):
    attachments: list[AttachmentResponse] = Field(default_factory=list)
    total_size: int = 0
    max_total_size_kb: int = 0
    max_count: int = 0


# ── bootstrap / admin ─────────────────────────────────────────────────────────

class BootstrapResponse(BaseModel):
    settings: dict = Field(default_factory=dict)
    permissions: dict[str, bool] = Field(default_factory=dict)
    themes: list[ThemeResponse] = Field(default_factory=list)
    fonts: list[dict] = Field(default_factory=list)
    system_fields: list[dict] = Field(default_factory=list)
    prefs: dict = Field(default_factory=dict)
    capabilities: dict = Field(default_factory=dict)


class TargetResponse(BaseModel):
    target_type: TargetType
    target_code: str
    name: str
    description: Optional[str] = None
    status: str = "draft"
    subject: Optional[str] = None
    preheader: Optional[str] = None
    breadcrumb: list[dict] = Field(default_factory=list)
    draft: Optional[RevisionContent] = None
    published: Optional[RevisionSummary] = None
    revisions: list[RevisionSummary] = Field(default_factory=list)
    merge_field_definitions: list[dict] = Field(default_factory=list)
    theme_code: Optional[str] = None
    sender: Optional[dict] = None
    recipient_count: int = 0
    can_edit: bool = True
    locked_reason: Optional[str] = None


class AdminSettingsRequest(BaseModel):
    settings: Optional[dict] = None
    permissions: Optional[dict[str, list[str]]] = None


class AdminSettingsResponse(BaseModel):
    settings: dict
    permissions: dict[str, list[str]]
    catalog: dict[str, str]


class DismissIssueRequest(BaseModel):
    code: str
    node_id: Optional[str] = None
    line: Optional[int] = None
    reason: str


class AuditEntryResponse(BaseModel):
    id: int
    action: str
    object_type: Optional[str] = None
    object_code: Optional[str] = None
    revision_no: Optional[int] = None
    summary: Optional[str] = None
    user_email: Optional[str] = None
    request_id: Optional[str] = None
    created_at: Optional[str] = None
