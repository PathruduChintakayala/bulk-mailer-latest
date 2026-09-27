# Bulk Email Sender

A full-featured bulk email sending platform built with FastAPI and React. Supports an Outlook-familiar compose workspace, multiple email editors, real-time tracking, advanced merge-field personalization, sender identity management, and rate-limited delivery via Amazon SES or SMTP.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI 0.115, Python 3.12, SQLAlchemy 2.0 (async), aiosqlite |
| Frontend | React 18.3, TypeScript 5.6, Vite 5.4, Tailwind CSS 3.4, Framer Motion |
| Auth | JWT (python-jose) + bcrypt, httpOnly cookies |
| Email Delivery | Amazon SES (aioboto3) / SMTP (aiosmtplib) |
| Real-time | WebSockets (campaign progress) |
| State | Zustand 5.0 |
| UI/UX | Framer Motion animations, Inter + Plus Jakarta Sans fonts |
| Editors | BulkMailer Compose Workspace (TipTap), HTML Code |
| Sanitization | DOMPurify (paste handler) |

---

## Features

### 1. Campaign Management
- **5-step wizard**: Details → Recipients → Column Mapping → Compose → Review & Send
- **Campaigns list page** with search, status filter tabs, and per-status counts
- Draft campaigns are editable (Edit button on list + detail page)
- Sent/completed campaigns are view-only with full stats
- Draft, scheduled, sending, paused, completed, and failed statuses
- Pause/resume active campaigns
- Schedule campaigns for future delivery
- Per-campaign statistics (sent, opened, clicked, bounced, unsubscribed)

### 2. BulkMailer Compose Workspace (Outlook-Style Editor)

The primary editor is a full compose workspace modeled after Outlook's email composition experience, built on TipTap/ProseMirror:

#### 2.1 Compose Workspace Layout
- **Full-width responsive workspace** — fills the entire compose step
- **Constrained 640px email canvas** — centered on a gray background with shadow, simulating how the email renders in clients
- **Outlook-style Message Header** above the editor body:
  - From (sender identity display with change button)
  - Audience (recipient count + suppression info)
  - Subject line with merge field dropdown and character counter
  - Collapsible Preheader with character counter
  - Attachment chips (future-ready)
- **Side panel slot** — for recipient preview navigation and live preview pane
- Two render modes: full ComposeWorkspace (in campaigns) or standalone EmailCanvas (in template editor)

#### 2.2 Five-Tab Ribbon Toolbar
| Tab | Features |
|-----|----------|
| **Message** | Undo/Redo, Styles dropdown (Normal/H1-H3/Quote/Code), Font family & size, Bold/Italic/Underline, Text & highlight color, Lists, Alignment, Link |
| **Insert** | Images (upload/URL/drag-drop), Tables (row×col dialog), Links, Horizontal rules, Email blocks (CTA, Columns, Divider, Spacer, Callout), Merge fields, Signature (optional) |
| **Personalize** | Searchable field list, grouped by type (Recipient/Custom/System), one-click insert, highlight toggle, validation badges |
| **Layout** | Content width selector (580-700px), body/text/link/button color pickers, theme reset |
| **Review** | Validation issues grouped by severity (error/warning/info), clickable navigation to affected content, badge counter |

Plus a **More** menu: View HTML, Copy HTML, Edit HTML (admin-only), Focus Mode, Find & Replace, Keyboard shortcuts reference.

#### 2.3 Email Blocks (TipTap Custom Extensions)
- **CTA Button** — configurable text, URL, colors, border-radius, size
- **Two-Column Layout** — left/right editable content columns
- **Divider** — horizontal rule with customizable color/thickness
- **Spacer** — adjustable vertical whitespace
- **Callout Box** — bordered info/warning/tip box with icon
- **Resizable Image** — drag handles, max-width constraint
- **Merge Field Nodes** — inline `{{field}}` chips with validation state

#### 2.4 Paste Sanitization
- **DOMPurify-based** paste handler intercepts rich-content paste events
- Strips Microsoft Word/Outlook XML (conditional comments, `mso-*` classes, `<o:p>` tags)
- Enforces email-safe HTML allowlist (no scripts, iframes, forms, objects)
- Preserves only email-compatible CSS properties (colors, fonts, margins, padding — strips `position`, `float`, `z-index`)
- Falls through to TipTap default for plain text and simple pastes

#### 2.5 Real-Time Validation (`useEditorValidation` hook)
- **Errors** (blocking): Empty subject, unknown merge fields (`{{unknown}}`), buttons with empty URLs
- **Warnings**: Missing preheader, images without alt text, subject > 60 chars, message > 100KB
- **Info**: Message size estimate, personalization field count
- Results feed into ReviewTab badge + issue list

#### 2.6 Autosave (`useEditorAutosave` hook)
- Debounced save (3 second delay) after each editor update
- Status tracking: idle → unsaved → saving → saved
- Manual `saveNow()` trigger (Ctrl+S)
- Skips save when content unchanged

#### 2.7 Focus Mode
- Full-screen distraction-free overlay (Escape or close button to exit)
- Hides ribbon, sidebar, header chrome
- Narrow 720px writing area with generous vertical padding
- Body scroll locked during focus mode

#### 2.8 Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| Ctrl+B/I/U | Bold / Italic / Underline |
| Ctrl+Z / Ctrl+Y | Undo / Redo |
| Ctrl+K | Insert link |
| Ctrl+Shift+M | Insert merge field |
| Ctrl+S | Save draft |
| Ctrl+Shift+F | Toggle Find & Replace |
| Ctrl+Enter | Send / Review |
| Escape | Exit focus mode |

#### 2.9 Additional Editor Features
- **BubbleMenu** on text selection: Bold, Italic, Underline, Strikethrough, Highlight, Link, Merge Field, Clear Formatting
- **Find & Replace** — search/replace within email content with match highlighting
- **Image upload** — drag-and-drop or dialog, uploads to asset library via API
- **Table editing** — floating toolbar for row/column operations
- **Status bar** — word count, character count, estimated read time

### 3. HTML Code Editor
- Raw HTML editing for advanced users
- Available via More menu → "Edit HTML" (admin-only in compose workspace)
- Toggle between visual and code modes (standalone only)

### 4. Theme System
- 10 preset color themes (Indigo, Ocean Blue, Forest Green, Sunset Orange, etc.)
- Theme colors automatically applied to block defaults (buttons, callouts, dividers)
- Themes stored per-campaign and per-template
- Layout tab provides per-element color pickers
- Content width configurable between 580–700px

### 5. Sender Identity Management
- Multiple verified from-email addresses
- Configurable from-name and reply-to per identity
- Set a default identity for quick selection
- Activate/deactivate identities without deleting
- Admin-only creation and management
- Displayed in compose workspace Message Header

### 6. Merge Fields & Personalization
- **Canonical `MergeFieldDefinition` model**: key, label, data_type (text/email/number/date/url), required flag, default_value, source_kind (system/uploaded_column/custom), source_column binding
- **System fields**: auto-generated (unsubscribe_url, current_date, sender_name, etc.)
- **Uploaded column fields**: derived from CSV headers during column mapping
- **Custom fields**: manually defined with defaults
- `{{field_name}}` syntax rendered at send-time via merge engine
- Styled inline chips in the editor with validation state
- Template ↔ campaign field binding system (TemplateFieldBinding)
- Auto-mapping by key or label match
- Required-field validation before send
- Personalize ribbon tab with grouped, searchable field list

### 7. Recipient Management
- CSV and Excel (XLSX/XLS) file upload
- Drag-and-drop file upload zone
- Column mapping UI (email column, name column, custom fields)
- Email validation on upload
- Batch processing (500 rows/batch) for memory efficiency
- Duplicate detection
- Suppression list filtering
- Support for up to 50K recipients per campaign

### 8. Email Tracking
- **Open tracking** — 1x1 transparent GIF pixel injected before `</body>`
- **Click tracking** — All links wrapped with tracking redirects
- Privacy-aware: skips unsubscribe and mailto links
- Real-time event logging (opens, clicks, bounces, complaints)
- Per-recipient tracking with timestamps

### 9. Real-Time Campaign Progress
- WebSocket connection for live stats during sending
- Progress bar with percentage
- Live counters: sent, failed, opens, clicks, bounces
- Auto-closes when campaign completes

### 10. Preview System
- **Recipient-aware preview**: Navigate through actual recipients to see personalized output
- **Live preview pane** in compose workspace side panel
- **Preview rendering API**: subject, preheader, HTML, plain text with resolved merge fields
- Warnings for missing required fields and defaults used
- Device toggle: Desktop (full-width) and Mobile (375px viewport)

### 11. Rate Limiting & Delivery
- Token bucket algorithm for precise rate control
- Configurable send rate (default 14/sec)
- Auto-detects SES quota and adapts
- Burst allowance (up to 2 seconds of tokens)
- Background queue worker processes campaigns asynchronously
- Automatic retry on transient failures

### 12. Suppression List
- Global and per-campaign suppression scopes
- Automatic suppression on bounces and complaints
- Manual suppression entries
- Filtering applied during recipient upload processing

### 13. Webhook Integration (SES)
- SNS notification handler for bounces and complaints
- Automatic recipient status updates
- Campaign counter adjustments
- Audit trail via tracking events

### 14. Template Library
- Save and reuse email templates
- Category-based organization
- Per-template editor type and merge field definitions
- Template ↔ campaign field binding with auto-mapping
- Template selection in campaign compose step with search
- Thumbnail previews

### 15. Asset Management
- **Admin asset library** for uploading images (PNG, JPG, GIF, SVG, WebP, ICO)
- Drag-and-drop or click-to-upload with multi-file support
- Grid view with hover overlay (copy URL, delete)
- Uploaded assets available globally for use in campaigns
- Assets stored in `/uploads/assets/` and served as static files
- 5MB max file size per upload

### 16. General Settings
- **Application Name** — displayed in sidebar, emails, and browser tab
- **Logo upload** — file upload with preview thumbnail
- **Favicon upload** — file upload with preview thumbnail
- **Timezone** — used for scheduling campaigns and displaying timestamps
- Settings stored in key-value AppSettings table

### 17. User Management & Auth
- Role-based access: **Admin** (full access) and **User** (own campaigns only)
- JWT authentication with httpOnly cookies
- Access + refresh token flow with auto-refresh
- Force password change for new users
- Admin can create/deactivate/delete users

### 18. Email Provider Configuration
- **Amazon SES**: Region, access key, secret key, sandbox mode toggle
- **SMTP**: Host, port, username, password, TLS toggle
- Configurable max send rate
- Switch providers without code changes

### 19. Dashboard & Analytics
- Animated stat cards (Total Campaigns, Emails Sent, Recipients, Active)
- Performance metrics row (Open Rate, Click Rate, Delivery Rate, Bounce Rate)
- Recent Campaigns list with status badges and inline stats
- Top Performers panel ranked by open rate
- Quick Actions (New Campaign, Templates, All Campaigns)
- Greeting with time-of-day awareness

---

## Project Structure

```
bulk_email_sender/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, lifespan, CORS, routes
│   │   ├── config.py               # App configuration
│   │   ├── database.py             # Async SQLAlchemy engine, session, init_db
│   │   ├── models/
│   │   │   ├── user.py             # User model (roles, auth)
│   │   │   ├── campaign.py         # Campaign, Recipient, UploadJob models
│   │   │   ├── template.py         # Template model
│   │   │   ├── sender_identity.py  # Sender identity model
│   │   │   ├── tracking.py         # TrackingEvent model
│   │   │   ├── suppression.py      # SuppressionList model
│   │   │   └── settings_model.py   # AppSettings (key-value store)
│   │   ├── schemas/                # Pydantic request/response schemas
│   │   ├── routers/
│   │   │   ├── auth.py             # Login, logout, refresh, change-password
│   │   │   ├── campaigns.py        # Campaign CRUD, upload, send, pause/resume
│   │   │   ├── templates.py        # Template CRUD
│   │   │   ├── users.py            # User management (admin)
│   │   │   ├── sender_identities.py# Sender identity CRUD
│   │   │   ├── assets.py           # Image asset upload/list/delete
│   │   │   ├── settings.py         # General, editor config, email provider
│   │   │   ├── tracking.py         # Open/click pixel endpoints
│   │   │   ├── webhooks.py         # SES SNS webhook handler
│   │   │   └── ws.py               # WebSocket for live stats
│   │   ├── services/
│   │   │   ├── queue_worker.py     # Background campaign processor
│   │   │   ├── email_sender.py     # SES/SMTP send logic
│   │   │   ├── merge_engine.py     # {{field}} replacement + validation engine
│   │   │   ├── tracking_injector.py# Open pixel + click tracking injection
│   │   │   ├── file_parser.py      # CSV/Excel parsing with validation
│   │   │   └── retention_worker.py # Data retention/cleanup
│   │   └── utils/
│   │       ├── dependencies.py     # Auth dependencies (get_current_user, get_admin)
│   │       ├── jwt.py              # JWT token utilities
│   │       └── rate_limiter.py     # Token bucket rate limiter
│   ├── data/
│   │   └── bulk_email.db           # SQLite database (WAL mode)
│   ├── uploads/                    # File uploads (recipients CSVs, assets)
│   │   └── assets/                 # Image asset library
│   └── venv/                       # Python virtual environment
├── frontend/
│   ├── src/
│   │   ├── App.tsx                 # Root with routing
│   │   ├── main.tsx                # Entry point
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx       # Stats overview, top performers, quick actions
│   │   │   ├── Campaigns.tsx       # Campaign list with search & filter
│   │   │   ├── CampaignWizard.tsx  # 5-step campaign creation/editing
│   │   │   ├── CampaignDetail.tsx  # Live campaign stats + controls
│   │   │   ├── Templates.tsx       # Template library
│   │   │   ├── Assets.tsx          # Image asset management (admin)
│   │   │   ├── Users.tsx           # User management (admin)
│   │   │   ├── Settings.tsx        # General, identities, editors, provider
│   │   │   ├── Login.tsx           # Auth page
│   │   │   └── ChangePassword.tsx  # Force password change
│   │   ├── editors/
│   │   │   ├── OutlookEditor.tsx   # Main compose workspace editor (TipTap)
│   │   │   ├── CustomEditor.tsx    # Legacy block editor (deprecated)
│   │   │   ├── HtmlEditor.tsx      # Raw HTML code editor
│   │   │   ├── TipTapEditor.tsx    # Standalone TipTap (templates)
│   │   │   ├── UnlayerEditor.tsx   # Unlayer drag-and-drop
│   │   │   ├── GrapeJSEditor.tsx   # GrapeJS visual builder
│   │   │   ├── PreviewPane.tsx     # Iframe preview component
│   │   │   └── outlook/            # Compose workspace sub-components
│   │   │       ├── ComposeWorkspace.tsx   # Full workspace container
│   │   │       ├── EmailCanvas.tsx        # 640px constrained canvas
│   │   │       ├── MessageHeader.tsx      # From/To/Subject/Preheader header
│   │   │       ├── RibbonToolbar.tsx      # 5-tab ribbon orchestrator
│   │   │       ├── MessageTab.tsx         # Message ribbon tab
│   │   │       ├── InsertTab.tsx          # Insert ribbon tab
│   │   │       ├── PersonalizeTab.tsx     # Personalize ribbon tab
│   │   │       ├── LayoutTab.tsx          # Layout ribbon tab
│   │   │       ├── ReviewTab.tsx          # Review/validation ribbon tab
│   │   │       ├── MoreMenu.tsx           # Overflow actions menu
│   │   │       ├── FocusMode.tsx          # Distraction-free overlay
│   │   │       ├── EditorSidePanel.tsx    # Collapsible Preview/Properties panel
│   │   │       ├── FindReplace.tsx        # Search & replace dialog
│   │   │       ├── ImageDialog.tsx        # Image insert dialog
│   │   │       ├── LinkDialog.tsx         # Link insert/edit dialog
│   │   │       ├── TableDialog.tsx        # Table insert + floating toolbar
│   │   │       ├── SignatureManager.tsx   # Email signature management
│   │   │       ├── StatusBar.tsx          # Word/char count, read time
│   │   │       ├── ToolbarButton.tsx      # Reusable ribbon button component
│   │   │       ├── FormatTab.tsx          # Legacy format tab (kept for compat)
│   │   │       ├── OptionsTab.tsx         # Legacy options tab
│   │   │       ├── useEditorValidation.ts # Real-time validation hook
│   │   │       ├── useEditorAutosave.ts   # Debounced autosave hook
│   │   │       └── extensions/
│   │   │           ├── email-blocks.tsx   # Custom TipTap nodes (CTA, Columns, etc.)
│   │   │           ├── search-replace.ts  # Search/replace extension
│   │   │           └── paste-handler.ts   # DOMPurify paste sanitization
│   │   ├── components/
│   │   │   ├── Layout.tsx          # App shell (sidebar, header)
│   │   │   ├── FileUpload.tsx      # Drag-and-drop file upload
│   │   │   ├── ColumnMapper.tsx    # CSV column mapping UI
│   │   │   ├── MergeFieldManager.tsx # Merge field definitions
│   │   │   ├── EditorSelector.tsx  # Editor type picker + compose workspace pass-through
│   │   │   ├── ThemePicker.tsx     # Color theme selector
│   │   │   ├── PreviewPanel.tsx    # Preview with layout/device toggle
│   │   │   ├── ConfirmDialog.tsx   # Reusable confirmation modal
│   │   │   └── ui/Modal.tsx        # Base modal component
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts     # WebSocket hook for live stats
│   │   ├── services/api.ts         # Axios instance with interceptors
│   │   ├── store/
│   │   │   ├── authStore.ts        # Zustand auth state
│   │   │   └── themeStore.ts       # Zustand UI theme state
│   │   └── types/index.ts          # TypeScript interfaces
├── test_data/
│   └── recipients_sample.csv       # 30-row test CSV (10 columns)
└── README.md

---

## Getting Started

### Prerequisites
- Python 3.12+
- Node.js 18+
- AWS SES credentials (or any SMTP server)

### Backend Setup
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate   # Windows (or source venv/bin/activate on Linux/Mac)
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### Access
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs (Swagger): http://localhost:8000/docs
- API Docs (ReDoc): http://localhost:8000/redoc
- Default admin: `admin@example.com` / `admin123`

---

## Development

### Type Checking
```bash
cd frontend
npx tsc --noEmit
```

### Production Build
```bash
cd frontend
npx vite build
```

### Backend Tests
```bash
cd backend
.\venv\Scripts\python -m pytest tests/ -v
```

### Key Dependencies

**Frontend:**
- `@tiptap/react` + extensions — ProseMirror-based editor engine
- `dompurify` — HTML sanitization for paste handler
- `zustand` — Lightweight state management
- `axios` — HTTP client with interceptor-based auth
- `framer-motion` — Animations
- `lucide-react` — Icon library
- `react-hot-toast` — Toast notifications

**Backend:**
- `fastapi` + `uvicorn` — Async web framework
- `sqlalchemy[asyncio]` + `aiosqlite` — Async ORM + SQLite
- `aioboto3` — Async AWS SES client
- `aiosmtplib` — Async SMTP client
- `python-jose` + `bcrypt` — JWT auth
- `openpyxl` — Excel file parsing

---

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/refresh` | Refresh token |
| POST | `/api/auth/logout` | Logout |
| POST | `/api/auth/change-password` | Change password |
| GET | `/api/campaigns/` | List campaigns |
| POST | `/api/campaigns/` | Create campaign |
| GET | `/api/campaigns/{id}` | Get campaign |
| PATCH | `/api/campaigns/{id}` | Update campaign |
| DELETE | `/api/campaigns/{id}` | Delete campaign |
| POST | `/api/campaigns/{id}/upload` | Upload recipients |
| GET | `/api/campaigns/{id}/upload/{job}/headers` | Get CSV headers |
| POST | `/api/campaigns/{id}/upload/{job}/map` | Map columns |
| GET | `/api/campaigns/{id}/upload/{job}/status` | Upload status |
| POST | `/api/campaigns/{id}/send` | Start sending |
| POST | `/api/campaigns/{id}/pause` | Pause campaign |
| POST | `/api/campaigns/{id}/resume` | Resume campaign |
| GET | `/api/campaigns/{id}/recipients` | List recipients |
| GET | `/api/campaigns/{id}/stats` | Campaign stats |
| GET | `/api/campaigns/{id}/events` | Tracking events |
| GET | `/api/templates/` | List templates |
| POST | `/api/templates/` | Create template |
| GET | `/api/templates/{id}` | Get template |
| PATCH | `/api/templates/{id}` | Update template |
| DELETE | `/api/templates/{id}` | Delete template |
| GET | `/api/users/` | List users |
| POST | `/api/users/` | Create user |
| PATCH | `/api/users/{id}` | Update user |
| DELETE | `/api/users/{id}` | Delete user |
| GET | `/api/sender-identities/` | List active identities |
| GET | `/api/sender-identities/all` | List all identities |
| POST | `/api/sender-identities/` | Create identity |
| PATCH | `/api/sender-identities/{id}` | Update identity |
| DELETE | `/api/sender-identities/{id}` | Delete identity |
| GET | `/api/settings/` | Get settings |
| PUT | `/api/settings/{key}` | Update setting |
| POST | `/api/settings/email-provider` | Configure provider |
| GET | `/api/settings/editors` | Get editor config |
| PUT | `/api/settings/editors` | Update editor config |
| GET | `/api/settings/general` | Get general settings |
| POST | `/api/settings/general` | Update general settings |
| GET | `/api/assets/` | List uploaded assets |
| POST | `/api/assets/upload` | Upload image asset |
| DELETE | `/api/assets/{filename}` | Delete asset |
| GET | `/track/open/{rid}` | Track email open |
| GET | `/track/click/{rid}` | Track link click |
| POST | `/api/webhooks/ses` | SES bounce/complaint |
| WS | `/ws/campaign/{id}` | Live campaign stats |

---

## Architecture Notes

### Editor Architecture
The compose workspace uses a **dual render mode** pattern in `OutlookEditor.tsx`:
1. **Compose mode** (`editorContext` prop set): Renders full `ComposeWorkspace` with MessageHeader, 5-tab ribbon, constrained EmailCanvas, and side panel slot. Used in CampaignWizard compose step.
2. **Standalone mode** (no `editorContext`): Renders just the ribbon + EmailCanvas. Used in template editing.

### Merge Engine Pipeline
1. **Definition** — `MergeFieldDefinition` defines available fields with types and defaults
2. **Binding** — `TemplateFieldBinding` maps template fields to campaign data columns
3. **Resolution** — `merge_engine.py` resolves `{{field}}` placeholders at send-time using recipient row data
4. **Validation** — `useEditorValidation` hook checks for unknown/unbound fields before send

### Email Delivery Pipeline
1. Campaign enters "sending" state → queue worker picks it up
2. Recipients processed in batches with rate limiting (token bucket)
3. Per-recipient: merge fields resolved → tracking injected (pixel + link wrapping) → sent via SES/SMTP
4. Real-time progress broadcast via WebSocket
5. Bounce/complaint webhooks update recipient status and campaign counters

### Paste Sanitization Pipeline
1. `PasteHandler` extension intercepts `handlePaste` events for rich HTML content
2. Strips Word/Outlook XML artifacts (conditional comments, `mso-*` classes)
3. DOMPurify enforces strict tag/attribute allowlist
4. CSS properties filtered to email-safe subset
5. Clean HTML inserted via TipTap's `insertContent`

---

## License

Private project — all rights reserved.
"# bulk-mailer-latest" 
