/**
 * Client for /api/composer/*.
 *
 * Reuses the shared axios instance so auth, refresh and base URL behave exactly
 * as they do for the rest of the application.
 */

import axios from 'axios';
import api from '../../services/api';
import type { EmailDocument } from '../model/document';
import type { ThemeTokens } from '../model/theme';
import type {
  AdminSettingsResponse,
  AssetListResponse,
  AttachmentListResponse,
  AttachmentResponse,
  AuditEntry,
  BootstrapResponse,
  CompileRequest,
  CompileResponse,
  ConflictDetail,
  MergeFieldContextResponse,
  MergeFieldDefinitionDto,
  RecipientPreviewResponse,
  ReusableBlockDetail,
  ReusableBlockRecord,
  ReusableScope,
  RevisionContent,
  SaveRevisionRequest,
  SaveRevisionResponse,
  TargetResponse,
  TargetType,
  TestSendResponse,
  ThemeRecord,
} from './types';

// ── error helpers ─────────────────────────────────────────────────────────────

export class ConcurrencyError extends Error {
  detail: ConflictDetail;
  constructor(detail: ConflictDetail) {
    super(detail.message || 'A newer version of this content exists.');
    this.name = 'ConcurrencyError';
    this.detail = detail;
  }
}

export class ValidationBlockedError extends Error {
  validation: unknown;
  constructor(message: string, validation: unknown) {
    super(message);
    this.name = 'ValidationBlockedError';
    this.validation = validation;
  }
}

/** Turn an axios failure into a readable sentence, unwrapping FastAPI detail shapes. */
export function describeError(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof ConcurrencyError || error instanceof ValidationBlockedError) return error.message;
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object' && typeof (detail as { message?: string }).message === 'string') {
      return (detail as { message: string }).message;
    }
    if (Array.isArray(detail) && detail.length && typeof detail[0]?.msg === 'string') return detail[0].msg;
    if (error.message === 'Network Error') return 'The server is unreachable. Your changes are kept locally.';
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

export function isOfflineError(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response;
}

// ── bootstrap and preferences ─────────────────────────────────────────────────

export async function bootstrap(): Promise<BootstrapResponse> {
  const res = await api.get('/composer/bootstrap');
  return res.data;
}

export async function getPreferences(): Promise<Record<string, unknown>> {
  const res = await api.get('/composer/preferences');
  return res.data.prefs || {};
}

export async function savePreferences(prefs: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await api.put('/composer/preferences', { prefs });
  return res.data.prefs || {};
}

// ── targets and revisions ─────────────────────────────────────────────────────

export async function loadTarget(type: TargetType, code: string): Promise<TargetResponse> {
  const res = await api.get(`/composer/targets/${type}/${code}`);
  return res.data;
}

export async function compile(payload: CompileRequest): Promise<CompileResponse> {
  const res = await api.post('/composer/compile', payload);
  return res.data;
}

export async function saveRevision(payload: SaveRevisionRequest): Promise<SaveRevisionResponse> {
  try {
    const res = await api.post('/composer/revisions', payload);
    return res.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 409) {
      const detail = error.response.data?.detail;
      if (detail && typeof detail === 'object' && detail.latest_revision) {
        throw new ConcurrencyError(detail as ConflictDetail);
      }
    }
    if (axios.isAxiosError(error) && error.response?.status === 422) {
      const detail = error.response.data?.detail;
      if (detail && typeof detail === 'object' && detail.validation) {
        throw new ValidationBlockedError(detail.message || 'Blocking issues must be resolved.', detail.validation);
      }
    }
    throw error;
  }
}

export async function getRevision(code: string): Promise<RevisionContent> {
  const res = await api.get(`/composer/revisions/${code}`);
  return res.data;
}

export async function publishRevision(
  code: string,
  payload: { change_summary?: string; override_reason?: string } = {}
): Promise<SaveRevisionResponse> {
  try {
    const res = await api.post(`/composer/revisions/${code}/publish`, payload);
    return res.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 422) {
      const detail = error.response.data?.detail;
      if (detail && typeof detail === 'object' && detail.validation) {
        throw new ValidationBlockedError(detail.message || 'Blocking issues must be resolved.', detail.validation);
      }
    }
    throw error;
  }
}

export async function restoreRevision(code: string): Promise<SaveRevisionResponse> {
  const res = await api.post(`/composer/revisions/${code}/restore`);
  return res.data;
}

export async function forkToCustomHtml(code: string, changeSummary?: string): Promise<SaveRevisionResponse> {
  const res = await api.post(`/composer/revisions/${code}/fork-html`, { change_summary: changeSummary });
  return res.data;
}

export async function dismissIssue(
  revisionCode: string,
  payload: { code: string; node_id?: string | null; line?: number | null; reason: string }
): Promise<{ dismissals: unknown[] }> {
  const res = await api.post(`/composer/revisions/${revisionCode}/dismiss-issue`, payload);
  return res.data;
}

export async function listDismissals(revisionCode: string): Promise<unknown[]> {
  const res = await api.get(`/composer/revisions/${revisionCode}/dismissals`);
  return res.data.dismissals || [];
}

// ── merge fields ──────────────────────────────────────────────────────────────

export async function getMergeFieldContext(type: TargetType, code: string): Promise<MergeFieldContextResponse> {
  const res = await api.get(`/composer/targets/${type}/${code}/merge-fields`);
  return res.data;
}

export async function saveMergeFields(
  type: TargetType,
  code: string,
  payload: { definitions?: MergeFieldDefinitionDto[]; mapping?: Record<string, unknown>[] }
): Promise<{ definitions: MergeFieldDefinitionDto[]; bindings?: unknown[] }> {
  const res = await api.put(`/composer/targets/${type}/${code}/merge-fields`, payload);
  return res.data;
}

// ── preview and test send ─────────────────────────────────────────────────────

export interface RecipientPreviewPayload {
  target_type: TargetType;
  target_code: string;
  recipient_index?: number;
  kind: 'visual' | 'custom_html';
  document?: EmailDocument | null;
  html_source?: string | null;
  subject?: string;
  preheader?: string;
  theme_code?: string | null;
  merge_field_definitions?: MergeFieldDefinitionDto[];
  plain_text?: string | null;
  plain_text_mode?: 'generated' | 'manual';
  sample_overrides?: Record<string, string>;
}

export async function previewWithRecipient(payload: RecipientPreviewPayload): Promise<RecipientPreviewResponse> {
  const res = await api.post('/composer/preview/recipient', payload);
  return res.data;
}

export interface TestSendPayload extends RecipientPreviewPayload {
  recipients: string[];
  sender_identity_code?: string | null;
  reply_to?: string | null;
  sample_source?: 'recipient' | 'first_valid' | 'custom' | 'template_defaults';
  custom_sample?: Record<string, string>;
  include_html?: boolean;
  include_plain_text?: boolean;
  mark_as_test?: boolean;
  include_attachments?: boolean;
  override_reason?: string | null;
}

export async function sendTest(payload: TestSendPayload): Promise<TestSendResponse> {
  const res = await api.post('/composer/test-send', payload);
  return res.data;
}

// ── attachments ───────────────────────────────────────────────────────────────

export async function listAttachments(campaignCode: string): Promise<AttachmentListResponse> {
  const res = await api.get(`/composer/campaigns/${campaignCode}/attachments`);
  return res.data;
}

export async function uploadAttachment(
  campaignCode: string,
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<AttachmentResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await api.post(`/composer/campaigns/${campaignCode}/attachments`, form, {
    signal,
    onUploadProgress: event => {
      if (onProgress && event.total) onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
  return res.data;
}

export async function deleteAttachment(campaignCode: string, id: number): Promise<void> {
  await api.delete(`/composer/campaigns/${campaignCode}/attachments/${id}`);
}

// ── snapshots ─────────────────────────────────────────────────────────────────

export async function getSnapshot(campaignCode: string): Promise<{ snapshot: Record<string, unknown> | null }> {
  const res = await api.get(`/composer/campaigns/${campaignCode}/snapshot`);
  return res.data;
}

export async function createSnapshot(campaignCode: string): Promise<{ snapshot_code: string }> {
  const res = await api.post(`/composer/campaigns/${campaignCode}/snapshot`);
  return res.data;
}

// ── themes ────────────────────────────────────────────────────────────────────

export async function listThemes(includeArchived = false): Promise<ThemeRecord[]> {
  const res = await api.get('/composer/themes', { params: { include_archived: includeArchived } });
  return res.data;
}

export async function createTheme(payload: {
  name: string;
  description?: string;
  tokens: Partial<ThemeTokens>;
}): Promise<ThemeRecord> {
  const res = await api.post('/composer/themes', payload);
  return res.data;
}

export async function updateTheme(
  code: string,
  payload: { name?: string; description?: string; tokens?: Partial<ThemeTokens>; is_locked?: boolean }
): Promise<ThemeRecord> {
  const res = await api.patch(`/composer/themes/${code}`, payload);
  return res.data;
}

export async function cloneTheme(code: string): Promise<ThemeRecord> {
  const res = await api.post(`/composer/themes/${code}/clone`);
  return res.data;
}

export async function setDefaultTheme(code: string): Promise<ThemeRecord> {
  const res = await api.post(`/composer/themes/${code}/default`);
  return res.data;
}

export async function archiveTheme(code: string): Promise<void> {
  await api.delete(`/composer/themes/${code}`);
}

// ── reusable blocks ───────────────────────────────────────────────────────────

export async function listReusableBlocks(params: {
  search?: string;
  category?: string;
  include_archived?: boolean;
} = {}): Promise<ReusableBlockRecord[]> {
  const res = await api.get('/composer/blocks', { params });
  return res.data;
}

export async function getReusableBlock(code: string): Promise<ReusableBlockDetail> {
  const res = await api.get(`/composer/blocks/${code}`);
  return res.data;
}

export async function createReusableBlock(payload: {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  fragment: Record<string, unknown>;
  fragment_kind: 'blocks' | 'section';
  scope?: ReusableScope;
  is_locked?: boolean;
  thumbnail?: string | null;
}): Promise<ReusableBlockDetail> {
  const res = await api.post('/composer/blocks', payload);
  return res.data;
}

export async function updateReusableBlock(
  code: string,
  payload: Partial<{
    name: string;
    description: string;
    category: string;
    tags: string[];
    fragment: Record<string, unknown>;
    scope: ReusableScope;
    is_locked: boolean;
    thumbnail: string | null;
  }>
): Promise<ReusableBlockDetail> {
  const res = await api.patch(`/composer/blocks/${code}`, payload);
  return res.data;
}

export async function cloneReusableBlock(code: string): Promise<ReusableBlockDetail> {
  const res = await api.post(`/composer/blocks/${code}/clone`);
  return res.data;
}

export async function markReusableBlockUsed(code: string): Promise<void> {
  try {
    await api.post(`/composer/blocks/${code}/used`);
  } catch {
    /* usage counting must never interrupt authoring */
  }
}

export async function archiveReusableBlock(code: string): Promise<void> {
  await api.delete(`/composer/blocks/${code}`);
}

// ── assets ────────────────────────────────────────────────────────────────────

export async function listAssets(params: {
  search?: string;
  folder?: string;
  include_archived?: boolean;
  sort?: 'recent' | 'name' | 'size' | 'usage';
} = {}): Promise<AssetListResponse> {
  const res = await api.get('/composer/assets', { params });
  return res.data;
}

export async function updateAsset(
  code: string,
  payload: Partial<{
    alt_text: string;
    folder: string;
    tags: string[];
    original_name: string;
    width: number | null;
    height: number | null;
    archived: boolean;
  }>
): Promise<void> {
  await api.patch(`/composer/assets/${code}`, payload);
}

export async function markAssetUsed(code: string): Promise<void> {
  try {
    await api.post(`/composer/assets/${code}/used`);
  } catch {
    /* usage counting must never interrupt authoring */
  }
}

/** Uploads through the existing asset endpoint so storage behaviour is unchanged. */
export async function uploadAsset(
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<{ public_code: string; url: string; filename: string; size: number }> {
  const form = new FormData();
  form.append('file', file);
  const res = await api.post('/assets/upload', form, {
    signal,
    onUploadProgress: event => {
      if (onProgress && event.total) onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
  return res.data;
}

// ── administration and audit ───────────────────────────────────────────────────

export async function getAdminSettings(): Promise<AdminSettingsResponse> {
  const res = await api.get('/composer/admin/settings');
  return res.data;
}

export async function saveAdminSettings(payload: {
  settings?: Record<string, unknown>;
  permissions?: Record<string, string[]>;
}): Promise<AdminSettingsResponse> {
  const res = await api.put('/composer/admin/settings', payload);
  return res.data;
}

export async function listAudit(params: { object_code?: string; action?: string; limit?: number } = {}): Promise<
  AuditEntry[]
> {
  const res = await api.get('/composer/audit', { params });
  return res.data;
}

// ── template and campaign lists (existing endpoints) ──────────────────────────

export interface ComposerTemplateListItem {
  public_code: string;
  name: string;
  description?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export async function listTemplates(): Promise<ComposerTemplateListItem[]> {
  const res = await api.get('/templates');
  const data = res.data;
  return Array.isArray(data) ? data : data.templates || [];
}

export async function createTemplate(payload: {
  name: string;
  description?: string;
  html_output?: string;
}): Promise<ComposerTemplateListItem> {
  const res = await api.post('/templates', payload);
  return res.data;
}

export interface ComposerCampaignListItem {
  public_code: string;
  name: string;
  status: string;
  subject?: string | null;
  updated_at?: string | null;
}

export async function listCampaigns(): Promise<ComposerCampaignListItem[]> {
  const res = await api.get('/campaigns');
  const data = res.data;
  return Array.isArray(data) ? data : data.campaigns || data.items || [];
}

export async function listSenderIdentities(): Promise<
  { public_code: string; from_email: string; from_name: string; reply_to?: string | null; is_default: boolean }[]
> {
  const res = await api.get('/sender-identities');
  const data = res.data;
  return Array.isArray(data) ? data : data.identities || [];
}
