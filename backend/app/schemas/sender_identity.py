from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class SenderIdentityCreate(BaseModel):
    from_email: EmailStr
    from_name: str
    reply_to: Optional[EmailStr] = None
    is_default: bool = False


class SenderIdentityUpdate(BaseModel):
    from_email: Optional[EmailStr] = None
    from_name: Optional[str] = None
    reply_to: Optional[EmailStr] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None


class SenderIdentityResponse(BaseModel):
    id: int
    public_code: Optional[str] = None
    from_email: str
    from_name: str
    reply_to: Optional[str] = None
    is_default: bool
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
