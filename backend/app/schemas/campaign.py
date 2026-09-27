from pydantic import BaseModel, field_validator
from typing import Optional, Any, Literal
from datetime import datetime
import re


class MergeFieldDefinition(BaseModel):
    key: str
    label: str
    data_type: Literal["text", "email", "number", "date", "url"] = "text"
    required: bool = False
    default_value: Optional[str] = None
    source_kind: Literal["system", "uploaded_column", "custom"] = "custom"
    source_column: Optional[str] = None
    is_system: bool = False

    @field_validator("key")
    @classmethod
    def validate_key(cls, v: str) -> str:
        if not re.match(r"^[a-z][a-z0-9_]*$", v):
            raise ValueError("Key must match ^[a-z][a-z0-9_]*$")
        return v


class TemplateFieldBinding(BaseModel):
    template_field_key: str
    campaign_field_key: Optional[str] = None


class CampaignCreate(BaseModel):
    name: str
    subject: str
    from_email: str
    from_name: Optional[str] = None
    reply_to: Optional[str] = None
    sender_identity_id: Optional[int] = None
    preheader: Optional[str] = None


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    reply_to: Optional[str] = None
    sender_identity_id: Optional[int] = None
    editor_type: Optional[str] = None
    content_json: Optional[str] = None
    html_body: Optional[str] = None
    preheader: Optional[str] = None
    theme_config: Optional[dict] = None
    merge_fields_config: Optional[list] = None
    campaign_field_definitions_json: Optional[list[dict]] = None
    template_field_bindings_json: Optional[list[dict]] = None
    selected_template_id: Optional[int] = None
    scheduled_at: Optional[datetime] = None


class CampaignResponse(BaseModel):
    id: int  # internal; clients should prefer public_code
    public_code: Optional[str] = None
    name: str
    subject: str
    from_email: str
    from_name: Optional[str] = None
    reply_to: Optional[str] = None
    editor_type: str
    content_json: Optional[str] = None
    html_body: Optional[str] = None
    preheader: Optional[str] = None
    theme_config: Optional[dict] = None
    merge_fields_config: Optional[list] = None
    campaign_field_definitions_json: Optional[list] = None
    template_field_bindings_json: Optional[list] = None
    selected_template_id: Optional[int] = None
    source_campaign_id: Optional[int] = None
    status: str
    scheduled_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    last_error: Optional[str] = None
    total_recipients: int
    sent_count: int
    failed_count: int
    opened_count: int
    clicked_count: int
    bounced_count: int
    unsubscribed_count: int
    created_by: int
    creator_name: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ColumnMappingRequest(BaseModel):
    email_column: str
    name_column: Optional[str] = None
    merge_fields: Optional[dict[str, str]] = None  # {template_var: column_name}
    field_definitions: Optional[list[dict]] = None  # Canonical MergeFieldDefinition[]


class UploadResponse(BaseModel):
    job_id: int
    filename: str
    total_rows: int
    columns: list[str]


class UploadStatusResponse(BaseModel):
    job_id: int
    status: str
    total_rows: int
    processed_rows: int
    valid_rows: int
    invalid_rows: int
    duplicate_rows: int
    suppressed_rows: int


class SendCampaignRequest(BaseModel):
    schedule_at: Optional[datetime] = None  # None = send now


class PreviewRecipientResponse(BaseModel):
    recipient: dict
    has_previous: bool
    has_next: bool


class PreviewRenderRequest(BaseModel):
    recipient_index: Optional[int] = 0
    recipient_id: Optional[int] = None
    subject: Optional[str] = None
    preheader: Optional[str] = None
    html: Optional[str] = None
    plain_text: Optional[str] = None


class PreviewRenderResponse(BaseModel):
    subject: str = ""
    preheader: str = ""
    html: str = ""
    plain_text: str = ""
    resolved_values: dict = {}
    defaults_used: list[str] = []
    warnings: list[str] = []
    missing_required_fields: list[str] = []


class SuggestMappingRequest(BaseModel):
    headers: list[str]


class SuggestMappingResponse(BaseModel):
    found: bool = False
    column_mapping: Optional[dict] = None
    field_definitions: Optional[list[dict]] = None
    source_campaign_id: Optional[int] = None
