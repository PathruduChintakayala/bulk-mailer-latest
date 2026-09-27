# Feature inventory

Every documented feature in `USER_GUIDE.md`, mapped to its frontend route and
component and the backend endpoints it calls. Paths are relative to the repo root.
Backend paths are relative to `backend/app/`; frontend paths to `frontend/src/`.

All backend routes are mounted under `/api` except `tracking.py` (mounted with no
prefix, since tracking/unsubscribe links must be short) and `ws.py` (WebSocket,
no prefix).

## Authentication

| Feature | Route | Frontend | Backend |
|---|---|---|---|
| Sign in | `/login` | `pages/Login.tsx` | `POST /auth/login` (`routers/auth.py`) |
| Session refresh | — (automatic, on 401) | `services/api.ts` (axios interceptor) | `POST /auth/refresh` |
| Sign out | — (sidebar action) | `components/Layout.tsx` | `POST /auth/logout` |
| Change password | `/change-password` | `pages/ChangePassword.tsx` | `POST /auth/change-password` |
| Current user | — (loaded on app boot) | `store/authStore.ts` | `GET /auth/me` |

Auth model: JWT access token (also set as an httpOnly cookie) plus a refresh
token cookie. `utils/dependencies.py` (`get_current_user`, `get_admin_user`)
gates every protected endpoint; `utils/jwt.py` issues/verifies tokens.

## Dashboard

| Feature | Route | Frontend | Backend |
|---|---|---|---|
| Dashboard page | `/` | `pages/Dashboard.tsx` | `GET /analytics/overview`, `GET /analytics/timeseries`, `GET /campaigns/` |
| Charts (line/funnel/bar) | — | `components/charts/Charts.tsx`, `EChart.tsx`, `chartTheme.ts` (Apache ECharts) | — |

Backend analytics logic: `routers/analytics.py`.

## Campaigns

| Feature | Route | Frontend | Backend |
|---|---|---|---|
| Campaign list | `/campaigns` | `pages/Campaigns.tsx` | `GET /campaigns/` |
| Clone a campaign | — (list row action) | `pages/Campaigns.tsx` | `POST /campaigns/{code}/clone` |
| Creation wizard (all 5 steps) | `/campaigns/new`, `/campaigns/:id/edit` | `pages/CampaignWizard.tsx` | see step rows below |
| — Step 1 Details: create/update | | | `POST /campaigns/`, `PATCH /campaigns/{code}` |
| — Step 1 Details: sender identities | | `components/` (select in wizard) | `GET /sender-identities/` |
| — Step 2 Recipients: file upload | | `components/FileUpload.tsx` | `POST /campaigns/{code}/upload` |
| — Step 2 Recipients: import from campaign | | `pages/CampaignWizard.tsx` (`RecipientStep`) | `POST /campaigns/{code}/import-recipients` |
| — Step 2 Recipients: review/include/exclude | | `components/RecipientTable.tsx` | `GET /campaigns/{code}/recipients`, `GET .../recipients/summary`, `PATCH .../recipients/inclusion` |
| — Step 3 Map Columns | | `components/ColumnMapper.tsx`, `components/MergeFieldManager.tsx` | `POST /campaigns/{code}/upload/{job_id}/map`, `GET .../upload/{job_id}/status`, `GET .../upload/latest`, `POST .../suggest-mapping` |
| — Step 4 Compose (launcher only) | | `pages/CampaignWizard.tsx` | `GET /composer/targets/campaign/{code}` (content status) |
| — Step 5 Review & Send | | `pages/CampaignWizard.tsx` | `POST /campaigns/{code}/send` |
| Pause / Resume | — (campaign detail) | `pages/CampaignDetail.tsx` | `POST /campaigns/{code}/pause`, `POST /campaigns/{code}/resume` |
| Retry failed recipients | — (campaign detail) | `pages/CampaignDetail.tsx` | `POST /campaigns/{code}/retry-failed` |
| Delete campaign | — (list/detail action) | `pages/Campaigns.tsx`, `pages/CampaignDetail.tsx` | `DELETE /campaigns/{code}` |
| Live send queue | — (campaign detail, while sending) | `hooks/useCampaignQueue.ts` | `GET /campaigns/{code}/queue` |
| Campaign detail — Overview | `/campaigns/:id` | `pages/CampaignDetail.tsx` | `GET /campaigns/{code}`, `GET /analytics/campaigns/{code}` |
| Campaign detail — Activity | `/campaigns/:id` (tab) | `pages/CampaignDetail.tsx` | `GET /analytics/campaigns/{code}/events/timeseries` |
| Campaign detail — Links | `/campaigns/:id` (tab) | `pages/CampaignDetail.tsx` | `GET /analytics/campaigns/{code}/links` |
| Campaign detail — Recipients | `/campaigns/:id` (tab) | `components/RecipientTable.tsx` | `GET /campaigns/{code}/recipients` |
| Live progress (WebSocket) | — | `hooks/useWebSocket.ts` | `WS /ws/campaign/{code}` (`routers/ws.py`) |

Core backend logic: `routers/campaigns.py` (CRUD, upload/mapping, send/pause/
resume/retry, queue), `services/file_parser.py` (CSV/Excel parsing),
`services/merge_engine.py` (merge-field resolution and rendering),
`services/queue_worker.py` (background send loop, rate limiting, retries),
`services/email_sender.py` (SES/SMTP adapters), `services/inline_images.py`
(embedding uploaded images when no public tracking URL is configured).

## Templates

| Feature | Route | Frontend | Backend |
|---|---|---|---|
| Template list | `/templates` | `pages/Templates.tsx` | `GET /templates/` |
| Classic editor: create/edit | `/templates` (inline view) | `pages/Templates.tsx`, `components/EditorSelector.tsx` | `POST /templates/`, `PATCH /templates/{code}` |
| Classic editor: rich-text/HTML/other editors | — | `editors/CustomEditor.tsx`, `TipTapEditor.tsx`, `HtmlEditor.tsx`, `GrapeJSEditor.tsx`, `UnlayerEditor.tsx`, `OutlookEditor.tsx` | — (client-side only, until save) |
| Delete template | — (list action) | `pages/Templates.tsx` | `DELETE /templates/{code}` (also removes its composer revisions — see note below) |
| Template preview render | — | `pages/Templates.tsx` / composer | `POST /templates/{code}/preview/render`, `POST /templates/preview/render` |
| New Composer entry point | `/templates` → `/composer` | `pages/Templates.tsx` (`openNewComposer`) | — |
| Composer home (list + create dialog) | `/composer` | `composer/ComposerHome.tsx` | `GET /templates` (via `composer/api/composerApi.ts`), `GET /campaigns`, `POST /templates` |
| Composer workspace | `/composer/template/:code`, `/composer/campaign/:code` | `composer/ComposerRoute.tsx`, `composer/ComposerWorkspace.tsx` | `GET /composer/targets/{type}/{code}`, `POST /composer/compile`, `POST /composer/revisions`, `POST /composer/revisions/{code}/publish`, `POST /composer/revisions/{code}/restore` |
| Composer — Visual/HTML mode, blocks, layers | — | `composer/panels/*`, `composer/visual/*`, `composer/code/HtmlMode.tsx` | — (client-side document model; compiled server-side on save) |
| Composer — Send a test | — | `composer/dialogs/TestSendDialog.tsx` | `POST /composer/test-send` |
| Composer — revision history | — | `composer/dialogs/RevisionHistory.tsx` | `GET /composer/revisions/{code}` |
| Composer — merge fields | — | `composer/dialogs/MergeFieldsDialog.tsx`, `MergeFieldPicker.tsx` | `GET /composer/targets/{type}/{code}/merge-fields`, `PUT .../merge-fields` |
| Composer — attachments (campaigns) | — | `composer/dialogs/AttachmentsDialog.tsx` | `GET/POST/DELETE /composer/campaigns/{code}/attachments`, `GET .../attachments/{id}` |
| Composer administration | `/settings/composer` | `composer/admin/ComposerAdmin.tsx` | `GET/PUT /composer/settings` (`routers/composer.py`; see also `composer_library.py`) |

Backend logic: `routers/templates.py` (classic template CRUD), `routers/
composer.py` (the composer's targets/revisions/publish/test-send/merge-fields/
attachments API), `routers/composer_library.py` (reusable blocks/themes),
`services/composer/*` (document model, compiler, validation, theming),
`models/composer.py` (`TemplateRevision`, `ValidationReportRecord`,
`CampaignTemplateSnapshot`, `EditorPreference`, `AuditLog`).

**Note on template deletion:** `DELETE /templates/{code}` also deletes every
`TemplateRevision` (and its validation report) tied to that template, and clears
`selected_template_id` on any campaign that referenced it. This was a real bug
fixed in this session — without it, a deleted template's composer content could
resurface on an unrelated new template, because SQLite can reuse a deleted row's
integer id. Regression tests: `backend/tests/test_templates.py`.

## Assets

| Feature | Route | Frontend | Backend |
|---|---|---|---|
| Asset library | `/assets` | `pages/Assets.tsx` | `GET /assets/`, `POST /assets/upload`, `DELETE /assets/{code}` |
| Asset picker (inside composer/editors) | — | `composer/dialogs/AssetLibrary.tsx`, `editors/outlook/ImageDialog.tsx` | `GET /assets/`, `POST /assets/upload` |

Backend: `routers/assets.py`. Uploaded files are served from `/uploads/assets/…`
(static mount in `main.py`).

## Users

| Feature | Route | Frontend | Backend |
|---|---|---|---|
| User list, create, deactivate, delete | `/users` | `pages/Users.tsx` | `GET /users/`, `POST /users/`, `PATCH /users/{code}`, `DELETE /users/{code}` |

Backend: `routers/users.py`. Admin-only (`get_admin_user`).

## Settings

| Feature | Route | Frontend | Backend |
|---|---|---|---|
| General (branding, palette) | `/settings` (General tab) | `pages/Settings.tsx` | `GET/POST /settings/general` |
| Sender identities | `/settings` (Sender Identities tab) | `pages/Settings.tsx` | `GET /sender-identities/all`, `POST /sender-identities/`, `PATCH/DELETE /sender-identities/{code}` |
| Campaign controls | `/settings` (Campaign Controls tab) | `pages/Settings.tsx` | `GET/POST /settings/campaign-mode` |
| Data retention | `/settings` (Campaign Controls tab) | `pages/Settings.tsx` | `GET/POST /settings/data-retention` |
| Email provider (SES/SMTP, rate limit) | `/settings` (Email Provider tab) | `pages/Settings.tsx` | `GET/POST /settings/email-provider`, `POST /settings/email-provider/test` |
| Bounce detection (IMAP) | `/settings` (Email Provider tab) | `pages/Settings.tsx` | `GET /settings/bounce-mailbox`, `POST /settings/bounce-mailbox/check` |
| Editor availability | — (not exposed in the current UI) | — | `GET/PUT /settings/editors` |

Backend: `routers/settings.py`, `services/provider_config.py` (applying saved
provider settings at runtime), `services/bounce_worker.py` +
`services/bounce_parser.py` (IMAP polling and bounce-message parsing).

## Tracking (recipient-facing, no login)

| Feature | Route | Backend |
|---|---|---|
| Open tracking pixel | `GET /track/open/{recipient_id}` | `routers/tracking.py` |
| Click tracking + redirect | `GET /track/click/{recipient_id}` | `routers/tracking.py` |
| Unsubscribe page + confirm | `GET /unsubscribe/{recipient_id}`, `POST /unsubscribe/{recipient_id}/confirm` | `routers/tracking.py` |
| One-click unsubscribe (RFC 8058) | `POST /unsubscribe/{recipient_id}` | `routers/tracking.py` |
| SES bounce/complaint webhook | `POST /webhooks/ses` | `routers/webhooks.py` |

These links are generated per-recipient by `services/tracking_injector.py` at
send time, and only when a public tracking URL is configured
(`services/provider_config.py::tracking_active`).

## Background workers (no direct route)

| Worker | File | Purpose |
|---|---|---|
| Queue worker | `services/queue_worker.py` | Sends pending campaign emails, rate-limited, with retry/backoff and a pause-on-repeated-failure circuit breaker |
| Bounce worker | `services/bounce_worker.py` | Polls the configured mailbox over IMAP for bounce messages |
| Retention worker | `services/retention_worker.py` | Applies the data-retention policy from Settings |

All three are started in `main.py`'s FastAPI lifespan handler.

## Cross-cutting / shared

| Concern | File(s) |
|---|---|
| API client, auth header/refresh | `frontend/src/services/api.ts` |
| Branding/theme (colours, logo, app name) | `frontend/src/store/themeStore.ts`, backend `routers/settings.py` (`general` key) |
| App shell (sidebar, nav) | `frontend/src/components/Layout.tsx` |
| Route table | `frontend/src/App.tsx` |
| Database models | `backend/app/models/*.py` |
| DB engine, migrations-on-boot | `backend/app/database.py` |
