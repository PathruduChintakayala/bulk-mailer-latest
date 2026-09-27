from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, JSON, ForeignKey, func, Index
from sqlalchemy.orm import relationship
from app.database import Base


class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True, index=True)
    public_code = Column(String(16), unique=True, index=True, nullable=True)
    name = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    from_email = Column(String, nullable=False)
    from_name = Column(String)
    reply_to = Column(String)
    sender_identity_id = Column(Integer, ForeignKey("sender_identities.id"), nullable=True)
    
    # Editor
    editor_type = Column(String, default="tiptap")  # tiptap, unlayer, grapejs, html
    content_json = Column(Text)  # Editor state for re-editing
    html_body = Column(Text)  # Final rendered HTML
    preheader = Column(String)  # Preview text shown in inbox
    
    # Theme
    theme_config = Column(JSON)  # Color theme settings
    
    # Fields
    merge_fields_config = Column(JSON)  # Legacy field definitions [{name, label, defaultValue, source}]
    campaign_field_definitions_json = Column(JSON)  # Canonical MergeFieldDefinition[]
    template_field_bindings_json = Column(JSON)  # TemplateFieldBinding[]
    selected_template_id = Column(Integer, ForeignKey("templates.id"), nullable=True)
    source_campaign_id = Column(Integer, nullable=True)
    
    # Status
    status = Column(String, default="draft")  # draft, scheduled, sending, paused, completed, failed
    scheduled_at = Column(DateTime(timezone=True))
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    last_error = Column(Text)  # Why the worker paused the campaign, shown to the user

    # Stats
    total_recipients = Column(Integer, default=0)
    sent_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    opened_count = Column(Integer, default=0)
    clicked_count = Column(Integer, default=0)
    bounced_count = Column(Integer, default=0)
    unsubscribed_count = Column(Integer, default=0)
    
    # Meta
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    creator = relationship("User", back_populates="campaigns")
    recipients = relationship("Recipient", back_populates="campaign", cascade="all, delete-orphan")
    attachments = relationship("CampaignAttachment", back_populates="campaign", cascade="all, delete-orphan")


class CampaignAttachment(Base):
    __tablename__ = "campaign_attachments"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    content_type = Column(String)
    is_inline = Column(Boolean, default=False)
    content_id = Column(String)  # For inline images (CID)
    
    campaign = relationship("Campaign", back_populates="attachments")


class Recipient(Base):
    __tablename__ = "recipients"
    __table_args__ = (
        Index("ix_recipients_campaign_status", "campaign_id", "status"),
        Index("ix_recipients_campaign_row", "campaign_id", "row_index"),
    )

    id = Column(Integer, primary_key=True, index=True)
    public_code = Column(String(16), unique=True, index=True, nullable=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False)
    email = Column(String, nullable=False)
    merge_data = Column(JSON)  # All mapped columns as key-value pairs
    row_index = Column(Integer, nullable=True)  # Deterministic order for preview navigation
    is_included = Column(Boolean, default=True, nullable=False)

    # Sending status
    status = Column(String, default="pending")  # pending, sending, sent, failed, bounced, unsubscribed
    sent_at = Column(DateTime(timezone=True))
    error_message = Column(Text)
    retry_count = Column(Integer, default=0)
    next_attempt_at = Column(DateTime(timezone=True))  # Earliest retry time after a temporary failure
    ses_message_id = Column(String)  # Provider message id (SES MessageId or SMTP Message-ID)
    
    campaign = relationship("Campaign", back_populates="recipients")
    tracking_events = relationship("TrackingEvent", back_populates="recipient", cascade="all, delete-orphan")


class UploadJob(Base):
    __tablename__ = "upload_jobs"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False)
    filename = Column(String, nullable=False)
    total_rows = Column(Integer, default=0)
    processed_rows = Column(Integer, default=0)
    valid_rows = Column(Integer, default=0)
    invalid_rows = Column(Integer, default=0)
    duplicate_rows = Column(Integer, default=0)
    suppressed_rows = Column(Integer, default=0)
    status = Column(String, default="pending")  # pending, processing, completed, failed
    column_mapping = Column(JSON)  # {email_col: "Email", name_col: "Name", merge_fields: {...}}
    source_headers_json = Column(JSON)  # Original CSV/Excel headers
    normalized_header_signature = Column(String)  # For mapping reuse detection
    error_message = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ImportMappingProfile(Base):
    __tablename__ = "import_mapping_profiles"

    id = Column(Integer, primary_key=True, index=True)
    source_headers_json = Column(JSON)  # Original headers list
    normalized_header_signature = Column(String, index=True)  # For matching
    column_mapping_json = Column(JSON)  # Full column mapping
    campaign_field_definitions_json = Column(JSON)  # Field definitions used
    source_campaign_id = Column(Integer, nullable=True)  # Campaign that created this profile
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True))
