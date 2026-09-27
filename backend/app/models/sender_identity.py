from sqlalchemy import Column, Integer, String, Boolean, DateTime, func
from app.database import Base


class SenderIdentity(Base):
    __tablename__ = "sender_identities"

    id = Column(Integer, primary_key=True, index=True)
    public_code = Column(String(16), unique=True, index=True, nullable=True)
    from_email = Column(String, nullable=False)
    from_name = Column(String, nullable=False)
    reply_to = Column(String)
    is_default = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
