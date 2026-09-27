from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, ForeignKey, func
from sqlalchemy.orm import relationship
from app.database import Base


class Template(Base):
    __tablename__ = "templates"

    id = Column(Integer, primary_key=True, index=True)
    public_code = Column(String(16), unique=True, index=True, nullable=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    category = Column(String, default="general")
    editor_type = Column(String, nullable=False)  # tiptap, unlayer, grapejs, html
    content_json = Column(Text)  # Editor state
    html_output = Column(Text)  # Rendered HTML
    theme_config = Column(Text)  # JSON color theme
    thumbnail = Column(String)  # Path to thumbnail image
    merge_fields_config = Column(Text)  # Legacy JSON array of merge field definitions
    merge_field_definitions_json = Column(JSON)  # Canonical MergeFieldDefinition[]
    
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    creator = relationship("User", back_populates="templates")
