from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, ForeignKey, func, Index
from sqlalchemy.orm import relationship
from app.database import Base


class TrackingEvent(Base):
    __tablename__ = "tracking_events"
    __table_args__ = (
        Index("ix_tracking_campaign_type", "campaign_id", "event_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    recipient_id = Column(Integer, ForeignKey("recipients.id"), nullable=False)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False)
    event_type = Column(String, nullable=False)  # open, click, bounce, complaint, unsubscribe
    metadata_json = Column(JSON)  # link URL, user-agent, IP, etc.
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    recipient = relationship("Recipient", back_populates="tracking_events")
