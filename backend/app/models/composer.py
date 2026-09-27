"""
Composer data objects (spec 31).

All tables are additive: nothing here changes the existing Template or Campaign
rows, so the current composer keeps working while the new one is validated.
"""
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    func,
)

from app.database import Base


class TemplateRevision(Base):
    """
    A draft or published revision of composer content.

    Published revisions are immutable: editing a published revision creates a new
    draft whose parent_revision_id points back at it.
    """
    __tablename__ = "template_revisions"

    id = Column(Integer, primary_key=True, index=True)
    public_code = Column(String(16), unique=True, index=True, nullable=True)

    template_id = Column(Integer, ForeignKey("templates.id"), nullable=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=True, index=True)

    revision_no = Column(Integer, nullable=False, default=1)
    status = Column(String(16), nullable=False, default="draft")  # draft | published | archived
    kind = Column(String(16), nullable=False, default="visual")  # visual | custom_html

    document_json = Column(JSON)
    html_source = Column(Text)
    compiled_html = Column(Text)
    plain_text = Column(Text)
    plain_text_mode = Column(String(16), default="generated")  # generated | manual

    subject = Column(String)
    preheader = Column(String)

    theme_code = Column(String(16))
    theme_snapshot_json = Column(JSON)
    merge_defs_json = Column(JSON)

    change_summary = Column(String)
    validation_summary = Column(JSON)

    author_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    parent_revision_id = Column(Integer, ForeignKey("template_revisions.id"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    published_at = Column(DateTime(timezone=True), nullable=True)


class Theme(Base):
    """Reusable visual tokens applied to documents."""
    __tablename__ = "composer_themes"

    id = Column(Integer, primary_key=True, index=True)
    public_code = Column(String(16), unique=True, index=True, nullable=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    tokens_json = Column(JSON, nullable=False, default=dict)
    is_builtin = Column(Boolean, default=False, nullable=False)
    is_org_default = Column(Boolean, default=False, nullable=False)
    is_locked = Column(Boolean, default=False, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    archived_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ReusableBlock(Base):
    """A saved section or block fragment that can be inserted into documents."""
    __tablename__ = "reusable_blocks"

    id = Column(Integer, primary_key=True, index=True)
    public_code = Column(String(16), unique=True, index=True, nullable=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    category = Column(String, default="general")
    tags_json = Column(JSON, default=list)
    thumbnail = Column(String)
    fragment_json = Column(JSON, nullable=False, default=dict)
    fragment_kind = Column(String(16), default="blocks")  # blocks | section
    scope = Column(String(16), default="private")  # private | shared
    is_locked = Column(Boolean, default=False, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    usage_count = Column(Integer, default=0, nullable=False)
    archived_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ValidationReportRecord(Base):
    """Issues produced for a revision, plus any policy-permitted dismissals."""
    __tablename__ = "validation_reports"

    id = Column(Integer, primary_key=True, index=True)
    revision_id = Column(Integer, ForeignKey("template_revisions.id"), nullable=False, index=True)
    issues_json = Column(JSON, default=list)
    summary_json = Column(JSON, default=dict)
    dismissals_json = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class CampaignTemplateSnapshot(Base):
    """Frozen content used by a campaign, captured when sending starts."""
    __tablename__ = "campaign_template_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    public_code = Column(String(16), unique=True, index=True, nullable=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    revision_id = Column(Integer, ForeignKey("template_revisions.id"), nullable=True)
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=True)

    kind = Column(String(16), default="visual")
    document_json = Column(JSON)
    html_source = Column(Text)
    compiled_html = Column(Text)
    plain_text = Column(Text)
    subject = Column(String)
    preheader = Column(String)
    theme_snapshot_json = Column(JSON)
    merge_defs_json = Column(JSON)
    field_bindings_json = Column(JSON)
    attachment_refs_json = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class EditorPreference(Base):
    """Per-user composer workspace preferences (spec 27)."""
    __tablename__ = "editor_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    prefs_json = Column(JSON, default=dict)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AuditLog(Base):
    """Composer audit history (spec 30)."""
    __tablename__ = "composer_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    user_email = Column(String)
    action = Column(String, nullable=False, index=True)
    object_type = Column(String)
    object_code = Column(String, index=True)
    revision_no = Column(Integer, nullable=True)
    summary = Column(Text)
    request_id = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
