from sqlalchemy import Column, Integer, String, DateTime, func, Index
from app.database import Base


class SuppressionList(Base):
    __tablename__ = "suppression_list"
    __table_args__ = (
        Index("ix_suppression_email_scope", "email", "scope"),
    )

    id = Column(Integer, primary_key=True, index=True)
    public_code = Column(String(16), unique=True, index=True, nullable=True)
    email = Column(String, nullable=False, index=True)
    scope = Column(String, default="global")  # "global" or list/campaign name
    reason = Column(String)  # bounce, complaint, manual, unsubscribe
    created_at = Column(DateTime(timezone=True), server_default=func.now())
