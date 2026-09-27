from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: str = "general"
    editor_type: str = "visual"
    content_json: Optional[str] = None
    html_output: Optional[str] = None
    theme_config: Optional[str] = None
    merge_fields_config: Optional[str] = None
    merge_field_definitions_json: Optional[list[dict]] = None


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    editor_type: Optional[str] = None
    content_json: Optional[str] = None
    html_output: Optional[str] = None
    theme_config: Optional[str] = None
    merge_fields_config: Optional[str] = None
    merge_field_definitions_json: Optional[list[dict]] = None


class TemplateResponse(BaseModel):
    id: int
    public_code: Optional[str] = None
    name: str
    description: Optional[str] = None
    category: str
    editor_type: str
    content_json: Optional[str] = None
    html_output: Optional[str] = None
    theme_config: Optional[str] = None
    merge_fields_config: Optional[str] = None
    merge_field_definitions_json: Optional[list] = None
    thumbnail: Optional[str] = None
    created_by: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TemplatePreviewRenderRequest(BaseModel):
    html: Optional[str] = None
    subject: Optional[str] = None
    preheader: Optional[str] = None
    merge_field_definitions: Optional[list[dict]] = None


class TemplatePreviewRenderResponse(BaseModel):
    subject: str = ""
    preheader: str = ""
    html: str = ""
    warnings: list[str] = []
