# Bulk Email Sender — Backend

FastAPI-based backend providing campaign management, email delivery, tracking, merge-field personalization, and real-time WebSocket progress.

## Quick Start

```bash
cd backend
python -m venv venv
venv\Scripts\activate       # Windows
# source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Default admin credentials (change on first login):
- Email: admin@example.com
- Password: admin123

## API Docs
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Running Tests

```bash
.\venv\Scripts\python -m pytest tests/ -v
```

Tests cover:
- **Merge engine** — field resolution, defaults, required-field validation, auto-mapping
- **File parser** — CSV/Excel parsing, batch processing, email validation
- **Tracking injector** — open pixel injection, click link wrapping

## Project Layout

```
app/
├── main.py              # FastAPI app, lifespan events, CORS, route mounting
├── config.py            # Configuration (env vars, defaults)
├── database.py          # Async SQLAlchemy engine + session factory
├── models/              # SQLAlchemy ORM models
├── schemas/             # Pydantic request/response schemas
├── routers/             # API route handlers (one file per resource)
├── services/            # Business logic (email sending, merge engine, etc.)
└── utils/               # Auth dependencies, JWT, rate limiter
```

## Key Services

| Service | Purpose |
|---------|---------|
| `queue_worker.py` | Background campaign processor — batches recipients, applies rate limiting |
| `email_sender.py` | SES (aioboto3) and SMTP (aiosmtplib) send adapters |
| `merge_engine.py` | `{{field}}` resolution with defaults, required-field validation, auto-mapping |
| `tracking_injector.py` | Injects open pixel and wraps links for click tracking |
| `file_parser.py` | CSV/Excel upload parsing with email validation and batch processing |
| `retention_worker.py` | Data cleanup and retention policies |

## Database

- **Engine**: SQLite with WAL mode (async via aiosqlite)
- **Location**: `data/bulk_email.db` (auto-created on first run)
- **Migrations**: Schema created via `Base.metadata.create_all` at startup

## Environment Variables (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | (generated) | JWT signing key |
| `DATABASE_URL` | `sqlite+aiosqlite:///./data/bulk_email.db` | Database connection |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed frontend origins |
