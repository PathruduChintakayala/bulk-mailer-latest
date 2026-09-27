"""
Composer library and governance API: themes, reusable blocks, asset metadata,
administration settings, permissions and audit history.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.asset import Asset
from app.models.composer import AuditLog, ReusableBlock, Theme
from app.models.user import User
from app.schemas.composer import (
    AdminSettingsRequest,
    AdminSettingsResponse,
    AuditEntryResponse,
    ReusableBlockCreateRequest,
    ReusableBlockDetail,
    ReusableBlockResponse,
    ReusableBlockUpdateRequest,
    ThemeCreateRequest,
    ThemeResponse,
    ThemeUpdateRequest,
)
from app.routers.composer import require_permission, write_audit
from app.services.composer import document as doc_model
from app.services.composer.settings import (
    PERMISSIONS,
    get_composer_settings,
    get_permission_map,
    save_composer_settings,
    save_permission_map,
)
from app.services.composer.theme import DEFAULT_THEME_TOKENS, resolve_tokens
from app.services.public_codes import PREFIXES, generate_unique_public_code
from app.utils.dependencies import get_admin_user, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/composer", tags=["composer-library"])


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def _theme_response(theme: Theme) -> ThemeResponse:
    return ThemeResponse(
        public_code=theme.public_code or "",
        name=theme.name,
        description=theme.description,
        tokens=resolve_tokens(theme.tokens_json or {}),
        is_builtin=bool(theme.is_builtin),
        is_org_default=bool(theme.is_org_default),
        is_locked=bool(theme.is_locked),
        archived_at=_iso(theme.archived_at),
        created_at=_iso(theme.created_at),
        updated_at=_iso(theme.updated_at),
    )


async def _get_theme(db: AsyncSession, code: str) -> Theme:
    result = await db.execute(select(Theme).where(Theme.public_code == code))
    theme = result.scalar_one_or_none()
    if not theme:
        raise HTTPException(status_code=404, detail="Theme not found")
    return theme


# ── themes ────────────────────────────────────────────────────────────────────

@router.get("/themes", response_model=list[ThemeResponse])
async def list_themes(
    include_archived: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Theme)
    if not include_archived:
        query = query.where(Theme.archived_at.is_(None))
    result = await db.execute(query.order_by(Theme.is_builtin.desc(), Theme.name))
    return [_theme_response(theme) for theme in result.scalars().all()]


@router.post("/themes", response_model=ThemeResponse)
async def create_theme(
    payload: ThemeCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_permission(db, current_user, "manage_themes")
    theme = Theme(
        public_code=await generate_unique_public_code(db, Theme, PREFIXES["theme"]),
        name=payload.name,
        description=payload.description,
        tokens_json=resolve_tokens(payload.tokens or dict(DEFAULT_THEME_TOKENS)),
        created_by=current_user.id,
    )
    db.add(theme)
    await db.commit()
    await db.refresh(theme)
    await write_audit(
        db, current_user, "theme.created",
        object_type="theme", object_code=theme.public_code, summary=theme.name,
    )
    return _theme_response(theme)


@router.patch("/themes/{theme_code}", response_model=ThemeResponse)
async def update_theme(
    theme_code: str,
    payload: ThemeUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_permission(db, current_user, "manage_themes")
    theme = await _get_theme(db, theme_code)
    if theme.is_builtin:
        raise HTTPException(
            status_code=409,
            detail="Built-in themes cannot be edited. Clone the theme and edit the copy.",
        )
    if payload.name is not None:
        theme.name = payload.name
    if payload.description is not None:
        theme.description = payload.description
    if payload.tokens is not None:
        theme.tokens_json = resolve_tokens(theme.tokens_json or {}, payload.tokens)
    if payload.is_locked is not None:
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Only administrators can lock a theme.")
        theme.is_locked = payload.is_locked
    await db.commit()
    await db.refresh(theme)
    await write_audit(
        db, current_user, "theme.changed",
        object_type="theme", object_code=theme.public_code, summary=theme.name,
    )
    return _theme_response(theme)


@router.post("/themes/{theme_code}/clone", response_model=ThemeResponse)
async def clone_theme(
    theme_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_permission(db, current_user, "manage_themes")
    source = await _get_theme(db, theme_code)
    clone = Theme(
        public_code=await generate_unique_public_code(db, Theme, PREFIXES["theme"]),
        name=f"{source.name} copy",
        description=source.description,
        tokens_json=dict(source.tokens_json or {}),
        created_by=current_user.id,
    )
    db.add(clone)
    await db.commit()
    await db.refresh(clone)
    await write_audit(
        db, current_user, "theme.created",
        object_type="theme", object_code=clone.public_code, summary=f"Cloned from {source.name}",
    )
    return _theme_response(clone)


@router.post("/themes/{theme_code}/default", response_model=ThemeResponse)
async def set_default_theme(
    theme_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    theme = await _get_theme(db, theme_code)
    result = await db.execute(select(Theme).where(Theme.is_org_default.is_(True)))
    for other in result.scalars().all():
        other.is_org_default = False
    theme.is_org_default = True
    theme.archived_at = None
    await db.commit()
    await db.refresh(theme)
    await write_audit(
        db, current_user, "theme.changed",
        object_type="theme", object_code=theme.public_code,
        summary=f"{theme.name} set as the organization default",
    )
    return _theme_response(theme)


@router.delete("/themes/{theme_code}")
async def archive_theme(
    theme_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_permission(db, current_user, "manage_themes")
    theme = await _get_theme(db, theme_code)
    if theme.is_builtin:
        raise HTTPException(status_code=409, detail="Built-in themes cannot be archived.")
    if theme.is_org_default:
        raise HTTPException(status_code=409, detail="Set another theme as the default before archiving this one.")
    theme.archived_at = datetime.now(timezone.utc)
    await db.commit()
    await write_audit(
        db, current_user, "theme.archived",
        object_type="theme", object_code=theme.public_code, summary=theme.name,
    )
    return {"success": True}


# ── reusable blocks ───────────────────────────────────────────────────────────

def _block_response(block: ReusableBlock, owner: Optional[User] = None) -> ReusableBlockResponse:
    return ReusableBlockResponse(
        public_code=block.public_code or "",
        name=block.name,
        description=block.description,
        category=block.category or "general",
        tags=block.tags_json or [],
        thumbnail=block.thumbnail,
        fragment_kind=block.fragment_kind or "blocks",
        scope=block.scope or "private",
        is_locked=bool(block.is_locked),
        owner_name=owner.full_name if owner else None,
        usage_count=block.usage_count or 0,
        archived_at=_iso(block.archived_at),
        created_at=_iso(block.created_at),
        updated_at=_iso(block.updated_at),
    )


async def _get_block(db: AsyncSession, code: str) -> ReusableBlock:
    result = await db.execute(select(ReusableBlock).where(ReusableBlock.public_code == code))
    block = result.scalar_one_or_none()
    if not block:
        raise HTTPException(status_code=404, detail="Reusable block not found")
    return block


@router.get("/blocks", response_model=list[ReusableBlockResponse])
async def list_reusable_blocks(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    include_archived: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(ReusableBlock).where(
        or_(ReusableBlock.scope == "shared", ReusableBlock.owner_id == current_user.id)
    )
    if not include_archived:
        query = query.where(ReusableBlock.archived_at.is_(None))
    if category:
        query = query.where(ReusableBlock.category == category)
    if search:
        pattern = f"%{search.lower()}%"
        query = query.where(
            or_(
                func.lower(ReusableBlock.name).like(pattern),
                func.lower(ReusableBlock.description).like(pattern),
            )
        )
    result = await db.execute(query.order_by(ReusableBlock.name))
    blocks = list(result.scalars().all())
    owner_ids = {b.owner_id for b in blocks if b.owner_id}
    owners: dict[int, User] = {}
    if owner_ids:
        owner_result = await db.execute(select(User).where(User.id.in_(owner_ids)))
        owners = {u.id: u for u in owner_result.scalars().all()}
    return [_block_response(block, owners.get(block.owner_id)) for block in blocks]


@router.get("/blocks/{block_code}", response_model=ReusableBlockDetail)
async def get_reusable_block(
    block_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    block = await _get_block(db, block_code)
    base = _block_response(block)
    return ReusableBlockDetail(**base.model_dump(), fragment=block.fragment_json or {})


@router.post("/blocks", response_model=ReusableBlockDetail)
async def create_reusable_block(
    payload: ReusableBlockCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save a section or a set of blocks as reusable content."""
    if payload.scope == "shared" or payload.is_locked:
        await require_permission(db, current_user, "manage_reusable_blocks")

    fragment = payload.fragment or {}
    if payload.fragment_kind == "section":
        section = fragment.get("section") or fragment
        normalized = {"section": doc_model.normalize_section(section)}
    else:
        blocks = fragment.get("blocks") or []
        cleaned = [doc_model.normalize_block(block) for block in blocks]
        normalized = {"blocks": [block for block in cleaned if block]}
        if not normalized["blocks"]:
            raise HTTPException(status_code=400, detail="Select at least one block to save.")

    block = ReusableBlock(
        public_code=await generate_unique_public_code(db, ReusableBlock, PREFIXES["reusable"]),
        name=payload.name,
        description=payload.description,
        category=payload.category or "general",
        tags_json=payload.tags or [],
        thumbnail=payload.thumbnail,
        fragment_json=normalized,
        fragment_kind=payload.fragment_kind,
        scope=payload.scope,
        is_locked=payload.is_locked,
        owner_id=current_user.id,
    )
    db.add(block)
    await db.commit()
    await db.refresh(block)
    await write_audit(
        db, current_user, "reusable_block.created",
        object_type="reusable_block", object_code=block.public_code, summary=block.name,
    )
    base = _block_response(block, current_user)
    return ReusableBlockDetail(**base.model_dump(), fragment=block.fragment_json or {})


@router.patch("/blocks/{block_code}", response_model=ReusableBlockDetail)
async def update_reusable_block(
    block_code: str,
    payload: ReusableBlockUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    block = await _get_block(db, block_code)
    if block.is_locked or block.scope == "shared" or block.owner_id != current_user.id:
        await require_permission(db, current_user, "manage_reusable_blocks")

    if payload.name is not None:
        block.name = payload.name
    if payload.description is not None:
        block.description = payload.description
    if payload.category is not None:
        block.category = payload.category
    if payload.tags is not None:
        block.tags_json = payload.tags
    if payload.thumbnail is not None:
        block.thumbnail = payload.thumbnail
    if payload.scope is not None:
        block.scope = payload.scope
    if payload.is_locked is not None:
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Only administrators can lock a reusable block.")
        block.is_locked = payload.is_locked
    if payload.fragment is not None:
        if block.fragment_kind == "section":
            section = payload.fragment.get("section") or payload.fragment
            block.fragment_json = {"section": doc_model.normalize_section(section)}
        else:
            cleaned = [doc_model.normalize_block(item) for item in payload.fragment.get("blocks") or []]
            block.fragment_json = {"blocks": [item for item in cleaned if item]}

    await db.commit()
    await db.refresh(block)
    await write_audit(
        db, current_user, "reusable_block.changed",
        object_type="reusable_block", object_code=block.public_code, summary=block.name,
    )
    base = _block_response(block, current_user)
    return ReusableBlockDetail(**base.model_dump(), fragment=block.fragment_json or {})


@router.post("/blocks/{block_code}/clone", response_model=ReusableBlockDetail)
async def clone_reusable_block(
    block_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    source = await _get_block(db, block_code)
    clone = ReusableBlock(
        public_code=await generate_unique_public_code(db, ReusableBlock, PREFIXES["reusable"]),
        name=f"{source.name} copy",
        description=source.description,
        category=source.category,
        tags_json=list(source.tags_json or []),
        thumbnail=source.thumbnail,
        fragment_json=dict(source.fragment_json or {}),
        fragment_kind=source.fragment_kind,
        scope="private",
        is_locked=False,
        owner_id=current_user.id,
    )
    db.add(clone)
    await db.commit()
    await db.refresh(clone)
    base = _block_response(clone, current_user)
    return ReusableBlockDetail(**base.model_dump(), fragment=clone.fragment_json or {})


@router.post("/blocks/{block_code}/used")
async def mark_block_used(
    block_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Increment the usage counter when a reusable block is inserted."""
    block = await _get_block(db, block_code)
    block.usage_count = (block.usage_count or 0) + 1
    await db.commit()
    return {"usage_count": block.usage_count}


@router.delete("/blocks/{block_code}")
async def archive_reusable_block(
    block_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    block = await _get_block(db, block_code)
    if block.is_locked or block.scope == "shared" or block.owner_id != current_user.id:
        await require_permission(db, current_user, "manage_reusable_blocks")
    block.archived_at = datetime.now(timezone.utc)
    await db.commit()
    await write_audit(
        db, current_user, "reusable_block.archived",
        object_type="reusable_block", object_code=block.public_code, summary=block.name,
    )
    return {"success": True, "usage_count": block.usage_count or 0}


# ── asset metadata ────────────────────────────────────────────────────────────

@router.get("/assets")
async def list_composer_assets(
    search: Optional[str] = Query(None),
    folder: Optional[str] = Query(None),
    include_archived: bool = Query(False),
    sort: str = Query("recent"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Asset browser feed with composer metadata (alt text, folders, tags, usage)."""
    query = select(Asset)
    if not include_archived:
        query = query.where(Asset.archived_at.is_(None))
    if folder is not None and folder != "":
        query = query.where(Asset.folder == folder)
    if search:
        pattern = f"%{search.lower()}%"
        query = query.where(
            or_(
                func.lower(Asset.original_name).like(pattern),
                func.lower(Asset.filename).like(pattern),
                func.lower(Asset.alt_text).like(pattern),
            )
        )
    if sort == "name":
        query = query.order_by(Asset.original_name)
    elif sort == "size":
        query = query.order_by(Asset.size.desc())
    elif sort == "usage":
        query = query.order_by(Asset.usage_count.desc())
    else:
        query = query.order_by(Asset.id.desc())

    result = await db.execute(query.limit(500))
    assets = list(result.scalars().all())

    folder_result = await db.execute(select(Asset.folder).distinct())
    folders = sorted({row[0] for row in folder_result.fetchall() if row[0]})

    return {
        "assets": [
            {
                "public_code": asset.public_code,
                "filename": asset.filename,
                "original_name": asset.original_name,
                "url": asset.url,
                "size": asset.size or 0,
                "content_type": asset.content_type,
                "alt_text": asset.alt_text or "",
                "folder": asset.folder or "",
                "tags": asset.tags_json or [],
                "usage_count": asset.usage_count or 0,
                "width": asset.width,
                "height": asset.height,
                "archived_at": _iso(asset.archived_at),
                "created_at": _iso(asset.created_at),
            }
            for asset in assets
        ],
        "folders": folders,
    }


@router.patch("/assets/{asset_code}")
async def update_asset_metadata(
    asset_code: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_permission(db, current_user, "manage_assets")
    result = await db.execute(select(Asset).where(Asset.public_code == asset_code))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if "alt_text" in payload:
        asset.alt_text = payload["alt_text"]
    if "folder" in payload:
        asset.folder = payload["folder"] or ""
    if "tags" in payload and isinstance(payload["tags"], list):
        asset.tags_json = [str(tag) for tag in payload["tags"]]
    if "original_name" in payload and payload["original_name"]:
        asset.original_name = payload["original_name"]
    if "width" in payload:
        asset.width = payload["width"]
    if "height" in payload:
        asset.height = payload["height"]
    if payload.get("archived") is True:
        asset.archived_at = datetime.now(timezone.utc)
    elif payload.get("archived") is False:
        asset.archived_at = None

    await db.commit()
    await write_audit(
        db, current_user, "asset.updated",
        object_type="asset", object_code=asset.public_code,
        summary=asset.original_name or asset.filename,
    )
    return {"success": True}


@router.post("/assets/{asset_code}/used")
async def mark_asset_used(
    asset_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Asset).where(Asset.public_code == asset_code))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    asset.usage_count = (asset.usage_count or 0) + 1
    await db.commit()
    return {"usage_count": asset.usage_count}


# ── administration ────────────────────────────────────────────────────────────

@router.get("/admin/settings", response_model=AdminSettingsResponse)
async def read_admin_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    return AdminSettingsResponse(
        settings=await get_composer_settings(db),
        permissions=await get_permission_map(db),
        catalog=PERMISSIONS,
    )


@router.put("/admin/settings", response_model=AdminSettingsResponse)
async def write_admin_settings(
    payload: AdminSettingsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    settings_data = await get_composer_settings(db)
    if payload.settings is not None:
        settings_data = await save_composer_settings(db, payload.settings)
    permissions = await get_permission_map(db)
    if payload.permissions is not None:
        permissions = await save_permission_map(db, payload.permissions)
    await write_audit(
        db, current_user, "composer_settings.updated",
        object_type="settings", object_code="composer",
        summary="Composer administration settings updated",
    )
    return AdminSettingsResponse(settings=settings_data, permissions=permissions, catalog=PERMISSIONS)


# ── audit history ─────────────────────────────────────────────────────────────

@router.get("/audit", response_model=list[AuditEntryResponse])
async def list_audit_entries(
    object_code: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(AuditLog)
    if object_code:
        query = query.where(AuditLog.object_code == object_code)
    if action:
        query = query.where(AuditLog.action == action)
    result = await db.execute(query.order_by(AuditLog.id.desc()).limit(limit))
    return [
        AuditEntryResponse(
            id=entry.id,
            action=entry.action,
            object_type=entry.object_type,
            object_code=entry.object_code,
            revision_no=entry.revision_no,
            summary=entry.summary,
            user_email=entry.user_email,
            request_id=entry.request_id,
            created_at=_iso(entry.created_at),
        )
        for entry in result.scalars().all()
    ]
