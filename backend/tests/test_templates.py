"""
Deleting a template must not leave composer revisions behind: SQLite reuses a
deleted row's integer id, so an orphaned revision can otherwise attach itself
to a brand-new, unrelated template that happens to land on the same id.

Calls the router function directly against an isolated in-memory database,
the same pattern used in test_send_queue.py and test_bounces.py — it avoids
the auth/HTTP-client plumbing conftest's fixtures need but never exercise.
"""
import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.campaign import Campaign
from app.models.composer import TemplateRevision, ValidationReportRecord
from app.models.template import Template
from app.models.user import User
from app.routers.templates import delete_template


@pytest_asyncio.fixture
async def sessions():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        from app.models import (  # noqa: F401
            user, campaign, template, tracking, settings_model, suppression,
            sender_identity, asset, composer,
        )
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    yield maker
    await engine.dispose()


async def _make_user(db):
    user = User(email="owner@example.com", full_name="Owner", hashed_password="x", role="admin")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _make_template(db, user, name="Template", template_id=None):
    template = Template(
        id=template_id, name=name, category="general", editor_type="custom",
        html_output="<p>Hi</p>", created_by=user.id, public_code=f"TPL-{name.upper()}",
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


async def _make_revision(db, template):
    revision = TemplateRevision(
        template_id=template.id, revision_no=1, status="draft", kind="visual",
        document_json={"blocks": []}, compiled_html="<p>Old content</p>",
    )
    db.add(revision)
    await db.commit()
    await db.refresh(revision)
    db.add(ValidationReportRecord(revision_id=revision.id, issues_json=[], summary_json={}))
    await db.commit()
    return revision


@pytest.mark.asyncio
async def test_delete_template_removes_its_revisions(sessions):
    async with sessions() as db:
        user = await _make_user(db)
        template = await _make_template(db, user)
        revision = await _make_revision(db, template)

        await delete_template(template.public_code, db=db, current_user=user)

        assert (await db.execute(
            select(TemplateRevision).where(TemplateRevision.id == revision.id)
        )).scalar_one_or_none() is None
        assert (await db.execute(
            select(ValidationReportRecord).where(ValidationReportRecord.revision_id == revision.id)
        )).scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_new_template_reusing_a_deleted_ids_row_starts_blank(sessions):
    """The exact bug reported: create, delete, create again — the second must be clean."""
    async with sessions() as db:
        user = await _make_user(db)
        first = await _make_template(db, user, name="First")
        await _make_revision(db, first)
        first_id = first.id

        await delete_template(first.public_code, db=db, current_user=user)

        # Force the id SQLite would naturally reuse, to make the regression
        # deterministic instead of depending on SQLite's own row allocation.
        second = await _make_template(db, user, name="Second", template_id=first_id)
        assert second.id == first_id

        revisions = (await db.execute(
            select(TemplateRevision).where(TemplateRevision.template_id == second.id)
        )).scalars().all()
        assert revisions == [], "the new template must not inherit the deleted template's revisions"


@pytest.mark.asyncio
async def test_delete_template_clears_campaign_reference(sessions):
    async with sessions() as db:
        user = await _make_user(db)
        template = await _make_template(db, user)
        campaign = Campaign(
            name="Uses template", subject="Hi", from_email="a@example.com", html_body="<p>Hi</p>",
            created_by=user.id, selected_template_id=template.id,
        )
        db.add(campaign)
        await db.commit()

        await delete_template(template.public_code, db=db, current_user=user)

        await db.refresh(campaign)
        assert campaign.selected_template_id is None
