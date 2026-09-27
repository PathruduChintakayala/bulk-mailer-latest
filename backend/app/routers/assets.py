import mimetypes
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.models.asset import Asset
from app.utils.dependencies import get_current_user, get_admin_user
from app.services.public_codes import generate_unique_public_code, PREFIXES

router = APIRouter(prefix="/assets", tags=["assets"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "assets")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB


@router.post("/upload")
async def upload_asset(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_admin_user),
):
    """Upload an image asset (admin only)."""
    if not file.filename:
        raise HTTPException(400, "No file provided")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, "File too large. Max 5MB")

    unique_name = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, unique_name)

    with open(filepath, "wb") as f:
        f.write(content)

    url = f"/uploads/assets/{unique_name}"
    asset = Asset(
        public_code=await generate_unique_public_code(db, Asset, PREFIXES["asset"]),
        filename=unique_name,
        original_name=file.filename,
        url=url,
        size=len(content),
        content_type=file.content_type,
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)

    return {
        "public_code": asset.public_code,
        "filename": asset.filename,
        "original_name": asset.original_name,
        "url": asset.url,
        "size": asset.size,
        "content_type": asset.content_type,
    }


@router.get("/")
async def list_assets(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all uploaded assets."""
    # Sync any orphaned files into DB once
    result = await db.execute(select(Asset))
    by_name = {a.filename: a for a in result.scalars().all()}
    if os.path.exists(UPLOAD_DIR):
        for fname in os.listdir(UPLOAD_DIR):
            ext = os.path.splitext(fname)[1].lower()
            if ext in ALLOWED_EXTENSIONS and fname not in by_name:
                filepath = os.path.join(UPLOAD_DIR, fname)
                asset = Asset(
                    public_code=await generate_unique_public_code(db, Asset, PREFIXES["asset"]),
                    filename=fname,
                    original_name=fname,
                    url=f"/uploads/assets/{fname}",
                    size=os.path.getsize(filepath),
                )
                db.add(asset)
                by_name[fname] = asset
        await db.commit()

    result = await db.execute(select(Asset).order_by(Asset.id.desc()))
    return [
        {
            "public_code": a.public_code,
            "filename": a.filename,
            "original_name": a.original_name or a.filename,
            "url": a.url,
            "size": a.size,
            "content_type": a.content_type or mimetypes.guess_type(a.filename or "")[0],
        }
        for a in result.scalars().all()
    ]


@router.delete("/{asset_code}")
async def delete_asset(
    asset_code: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_admin_user),
):
    """Delete an uploaded asset (admin only)."""
    code = asset_code.strip().upper()
    result = await db.execute(select(Asset).where(Asset.public_code == code))
    asset = result.scalar_one_or_none()
    if not asset:
        # fallback: treat as filename for pre-migration deletes
        safe_name = os.path.basename(asset_code)
        filepath = os.path.join(UPLOAD_DIR, safe_name)
        if os.path.exists(filepath):
            os.remove(filepath)
            return {"message": "Asset deleted"}
        raise HTTPException(404, "Asset not found")

    filepath = os.path.join(UPLOAD_DIR, os.path.basename(asset.filename))
    if os.path.exists(filepath):
        os.remove(filepath)
    await db.delete(asset)
    await db.commit()
    return {"message": "Asset deleted"}
