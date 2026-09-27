from sqlalchemy import Column, Integer, String, Text, DateTime, func
from app.database import Base


class AppSettings(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False, index=True)
    value = Column(Text)  # JSON-encoded value
    description = Column(String)
    is_encrypted = Column(Integer, default=0)  # 1 if value is encrypted
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
