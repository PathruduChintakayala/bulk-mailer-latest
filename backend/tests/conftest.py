import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import event

from app.database import Base, get_db
from app.main import app
from app.models.user import User
from app.models.campaign import Campaign, Recipient, UploadJob, ImportMappingProfile
from app.models.template import Template

import bcrypt


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def db_session():
    """Create an in-memory SQLite database for testing."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as session:
        yield session

    await engine.dispose()


@pytest.fixture
async def client(db_session):
    """Create a test client with overridden DB dependency."""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
async def test_user(db_session):
    """Create a test user."""
    hashed = bcrypt.hashpw("testpass123".encode(), bcrypt.gensalt()).decode()
    user = User(
        email="test@example.com",
        full_name="Test User",
        hashed_password=hashed,
        role="admin",
        is_active=True,
        must_change_password=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def auth_headers(client, test_user):
    """Get auth headers for test user."""
    response = await client.post("/api/auth/login", json={
        "email": "test@example.com",
        "password": "testpass123",
    })
    token = response.json().get("access_token") or response.cookies.get("access_token")
    if token:
        return {"Authorization": f"Bearer {token}"}
    # Try cookie-based
    return {}


@pytest.fixture
async def test_campaign(db_session, test_user):
    """Create a test campaign with recipients."""
    campaign = Campaign(
        name="Test Campaign",
        subject="Hello {{customer_name}}",
        from_email="sender@example.com",
        from_name="Test Sender",
        editor_type="custom",
        html_body="<p>Hello {{customer_name}}, welcome to {{company}}</p>",
        created_by=test_user.id,
        total_recipients=3,
        campaign_field_definitions_json=[
            {"key": "customer_name", "label": "Customer Name", "data_type": "text", "required": True, "default_value": None, "source_kind": "uploaded_column", "source_column": "Name", "is_system": False},
            {"key": "company", "label": "Company", "data_type": "text", "required": False, "default_value": "Acme Ltd", "source_kind": "uploaded_column", "source_column": "Company", "is_system": False},
        ],
    )
    db_session.add(campaign)
    await db_session.commit()
    await db_session.refresh(campaign)

    # Add recipients
    recipients = [
        Recipient(campaign_id=campaign.id, email="alex@example.com", merge_data={"customer_name": "Alex Morgan", "company": "Acme Ltd"}, row_index=0, status="pending"),
        Recipient(campaign_id=campaign.id, email="beth@example.com", merge_data={"customer_name": "Beth Smith", "company": "Beta Corp"}, row_index=1, status="pending"),
        Recipient(campaign_id=campaign.id, email="carl@example.com", merge_data={"customer_name": "", "company": ""}, row_index=2, status="pending"),
    ]
    db_session.add_all(recipients)
    await db_session.commit()

    return campaign


@pytest.fixture
async def test_template(db_session, test_user):
    """Create a test template with merge field definitions."""
    template = Template(
        name="Welcome Template",
        category="onboarding",
        editor_type="custom",
        html_output="<p>Hello {{first_name}}, your account at {{company}} is ready.</p>",
        merge_fields_config='[{"name": "first_name", "label": "First Name", "defaultValue": "there", "source": "manual"}]',
        merge_field_definitions_json=[
            {"key": "first_name", "label": "First Name", "data_type": "text", "required": False, "default_value": "there", "source_kind": "custom", "source_column": None, "is_system": False},
            {"key": "company", "label": "Company", "data_type": "text", "required": True, "default_value": None, "source_kind": "custom", "source_column": None, "is_system": False},
        ],
        created_by=test_user.id,
    )
    db_session.add(template)
    await db_session.commit()
    await db_session.refresh(template)
    return template
