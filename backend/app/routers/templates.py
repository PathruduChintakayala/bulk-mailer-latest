from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from app.database import get_db
from app.models.user import User
from app.models.template import Template
from app.models.campaign import Campaign
from app.models.composer import TemplateRevision, ValidationReportRecord
from app.schemas.template import (
    TemplateCreate, TemplateUpdate, TemplateResponse,
    TemplatePreviewRenderRequest, TemplatePreviewRenderResponse,
)
from app.utils.dependencies import get_current_user
from app.services.public_codes import generate_unique_public_code, PREFIXES
from app.services.merge_engine import (
    build_template_preview_context, render_campaign_content,
)
import json

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("/", response_model=list[TemplateResponse])
async def list_templates(
    category: str = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Template).order_by(Template.created_at.desc())
    if category:
        query = query.where(Template.category == category)
    result = await db.execute(query)
    return [TemplateResponse.model_validate(t) for t in result.scalars().all()]


@router.post("/", response_model=TemplateResponse, status_code=201)
async def create_template(
    data: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = Template(
        public_code=await generate_unique_public_code(db, Template, PREFIXES["template"]),
        name=data.name,
        description=data.description,
        category=data.category,
        editor_type=data.editor_type,
        content_json=data.content_json,
        html_output=data.html_output,
        theme_config=data.theme_config,
        merge_fields_config=data.merge_fields_config,
        merge_field_definitions_json=data.merge_field_definitions_json,
        created_by=current_user.id,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return TemplateResponse.model_validate(template)


@router.post("/preview/render", response_model=TemplatePreviewRenderResponse)
async def render_template_draft_preview(
    req: TemplatePreviewRenderRequest,
    current_user: User = Depends(get_current_user),
):
    """Render an unsaved template draft preview using provided definitions."""
    field_defs = req.merge_field_definitions or []
    context, warnings = build_template_preview_context(field_defs)

    rendered = render_campaign_content(
        req.subject or "", req.preheader or "", req.html or "", "", context
    )

    return TemplatePreviewRenderResponse(
        subject=rendered["subject"],
        preheader=rendered["preheader"],
        html=rendered["html"],
        warnings=warnings,
    )


@router.get("/{template_code}", response_model=TemplateResponse)
async def get_template(
    template_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Template).where(Template.public_code == template_code.strip().upper()))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(404, "Template not found")
    return TemplateResponse.model_validate(template)


@router.patch("/{template_code}", response_model=TemplateResponse)
async def update_template(
    template_code: str,
    data: TemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Template).where(Template.public_code == template_code.strip().upper()))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(404, "Template not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(template, field, value)

    await db.commit()
    await db.refresh(template)
    return TemplateResponse.model_validate(template)


@router.delete("/{template_code}", status_code=204)
async def delete_template(
    template_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Template).where(Template.public_code == template_code.strip().upper()))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(404, "Template not found")

    # Composer revisions are not cascade-deleted with the template. Left behind,
    # they become a real bug: SQLite reuses a deleted row's integer id, so a
    # template created afterwards can land on the same id and inherit these
    # orphaned revisions — a brand new template opens showing old content.
    revision_ids = (await db.execute(
        select(TemplateRevision.id).where(TemplateRevision.template_id == template.id)
    )).scalars().all()
    if revision_ids:
        await db.execute(delete(ValidationReportRecord).where(ValidationReportRecord.revision_id.in_(revision_ids)))
        await db.execute(delete(TemplateRevision).where(TemplateRevision.template_id == template.id))

    # Campaigns that had this template selected keep their own saved content;
    # only the now-dangling reference to this template is cleared.
    await db.execute(
        update(Campaign).where(Campaign.selected_template_id == template.id).values(selected_template_id=None)
    )

    await db.delete(template)
    await db.commit()


@router.post("/{template_code}/preview/render", response_model=TemplatePreviewRenderResponse)
async def render_template_preview(
    template_code: str,
    req: TemplatePreviewRenderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Render template preview using argument default values."""
    result = await db.execute(select(Template).where(Template.public_code == template_code.strip().upper()))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(404, "Template not found")

    # Use provided definitions or saved ones
    field_defs = req.merge_field_definitions or template.merge_field_definitions_json or []
    
    # Also try legacy merge_fields_config if no canonical defs
    if not field_defs and template.merge_fields_config:
        try:
            legacy = json.loads(template.merge_fields_config)
            for f in legacy:
                if isinstance(f, dict):
                    field_defs.append({
                        "key": f.get("name", ""),
                        "label": f.get("label", ""),
                        "default_value": f.get("defaultValue"),
                    })
        except (json.JSONDecodeError, TypeError):
            pass

    context, warnings = build_template_preview_context(field_defs)

    subject = req.subject or ""
    preheader = req.preheader or ""
    html = req.html or template.html_output or ""

    rendered = render_campaign_content(subject, preheader, html, "", context)

    return TemplatePreviewRenderResponse(
        subject=rendered["subject"],
        preheader=rendered["preheader"],
        html=rendered["html"],
        warnings=warnings,
    )
