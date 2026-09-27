from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text, func
from app.database import Base


class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    public_code = Column(String(16), unique=True, index=True, nullable=True)
    filename = Column(String, nullable=False)  # stored unique name on disk
    original_name = Column(String)
    url = Column(String, nullable=False)
    size = Column(Integer, default=0)
    content_type = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Composer metadata (spec 9.5)
    alt_text = Column(Text)
    folder = Column(String, default="")
    tags_json = Column(JSON, default=list)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    usage_count = Column(Integer, default=0, nullable=False)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    archived_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    is_shared = Column(Boolean, default=True, nullable=False)
