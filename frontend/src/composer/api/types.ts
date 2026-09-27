/** Wire types for /api/composer/*, mirroring backend/app/schemas/composer.py. */

import type { EmailDocument } from '../model/document';
import type { ThemeRecord, ThemeTokens } from '../model/theme';
import type { ValidationReport } from '../model/issues';

export type RevisionKind = 'visual' | 'custom_html';
export type RevisionStatus = 'draft' | 'published' | 'archived';
export type PlainTextMode = 'generated' | 'manual';
export type TargetType = 'template' | 'campaign';

export interface MergeFieldDefinitionDto {
  key: string;
  label?: string;
  description?: string | null;
  data_type?: 'text' | 'number' | 'date' | 'currency' | 'url' | 'email' | 'boolean' | 'html';
  required?: boolean;
  default_value?: string | null;
  example_value?: string | null;
  format?: string | null;
  category?: string | null;
  allow_in_subject?: boolean;
  allow_in_body?: boolean;
  allow_in_url?: boolean;
  escape_html?: boolean;
  source_kind?: 'uploaded' | 'system' | 'static' | 'template';
  source_column?: string | null;
  static_value?: string | null;
  is_system?: boolean;
}

export interface RevisionSummary {
  public_code: string;
  revision_no: number;
  status: RevisionStatus;
  kind: RevisionKind;
  subject: string | null;
  preheader: string | null;
  change_summary: string | null;
  author_name: string | null;
  author_email: string | null;
  validation_summary: Record<string, number | boolean> | null;
  theme_code: string | null;
  created_at: string | null;
  updated_at: string | null;
  published_at: string | null;
  parent_revision_code: string | null;
  campaign_usage: number;
}

export interface RevisionContent extends RevisionSummary {
  document: EmailDocument | null;
  html_source: string | null;
  compiled_html: string | null;
  plain_text: string | null;
  plain_text_mode: PlainTextMode;
  theme_overrides: Record<string, unknown> | null;
  merge_field_definitions: MergeFieldDefinitionDto[];
}

export interface Breadcrumb {
  label: string;
  to: string | null;
}

export interface TargetResponse {
  target_type: TargetType;
  target_code: string;
  name: string;
  description: string | null;
  status: string;
  subject: string | null;
  preheader: string | null;
  breadcrumb: Breadcrumb[];
  draft: RevisionContent | null;
  published: RevisionSummary | null;
  revisions: RevisionSummary[];
  merge_field_definitions: MergeFieldDefinitionDto[];
  theme_code: string | null;
  sender?: {
    code: string | null;
    from_email: string | null;
    from_name: string | null;
    reply_to: string | null;
  } | null;
  recipient_count?: number;
  can_edit: boolean;
  locked_reason: string | null;
}

export interface ComposerSettings {
  default_email_width: number;
  min_email_width: number;
  max_email_width: number;
  allowed_fonts: string[];
  organization_fonts: { label: string; stack: string }[];
  brand_colors: string[];
  require_unsubscribe_link: boolean;
  require_organization_address: boolean;
  require_view_in_browser: boolean;
  require_plain_text: boolean;
  auto_append_compliance_footer: boolean;
  organization_name: string;
  organization_address: string;
  unsubscribe_label: string;
  max_image_size_kb: number;
  allowed_image_formats: string[];
  max_html_size_kb: number;
  max_attachment_size_kb: number;
  max_total_attachment_size_kb: number;
  max_attachment_count: number;
  allowed_attachment_types: string[];
  blocked_attachment_types: string[];
  blocking_codes: Record<string, string[]>;
  non_dismissible_codes: string[];
  missing_required_field_policy: 'block_campaign' | 'skip_recipient' | 'use_default' | 'send_empty';
  allow_external_images: boolean;
  allowed_image_hosts: string[];
  autosave_idle_ms: number;
  [key: string]: unknown;
}

export type PermissionKey =
  | 'view_templates'
  | 'create_templates'
  | 'edit_own_templates'
  | 'edit_all_templates'
  | 'clone_templates'
  | 'publish_templates'
  | 'archive_templates'
  | 'delete_templates'
  | 'use_custom_html'
  | 'insert_raw_html'
  | 'manage_themes'
  | 'manage_reusable_blocks'
  | 'manage_assets'
  | 'send_test_emails'
  | 'override_validation_warnings'
  | 'manage_merge_fields'
  | 'manage_composer_settings'
  | 'view_audit_history';

export interface BootstrapResponse {
  settings: ComposerSettings;
  permissions: Record<PermissionKey, boolean>;
  themes: ThemeRecord[];
  fonts: { label: string; stack: string }[];
  system_fields: MergeFieldDefinitionDto[];
  prefs: Record<string, unknown>;
  capabilities: {
    sanitizer: boolean;
    css_inliner: boolean;
    user_role: string;
    user_code: string;
  };
}

export interface CompileRequest {
  kind: RevisionKind;
  document?: EmailDocument | null;
  html_source?: string | null;
  subject?: string;
  preheader?: string;
  theme_code?: string | null;
  theme_overrides?: Record<string, unknown> | null;
  merge_field_definitions?: MergeFieldDefinitionDto[];
  plain_text?: string | null;
  plain_text_mode?: PlainTextMode;
  target_type?: TargetType | null;
  target_code?: string | null;
  run_validation?: boolean;
}

export interface CompileResponse {
  compiled_html: string;
  plain_text: string;
  warnings: string[];
  /** Constructs the sanitizer stripped, for the "what changed" notice. */
  removed: string[];
  validation: ValidationReport;
  sanitized: boolean;
  inlined: boolean;
  /** Compliance elements the compiler appended because policy requires them. */
  auto_appended: string[];
  size_bytes: number;
}

export interface SaveRevisionRequest extends CompileRequest {
  target_type: TargetType;
  target_code: string;
  base_revision_code?: string | null;
  change_summary?: string | null;
  name?: string | null;
  description?: string | null;
}

export interface SaveRevisionResponse {
  revision: RevisionContent;
  validation: ValidationReport;
  warnings: string[];
  blocked: boolean;
}

export interface ConflictDetail {
  message: string;
  latest_revision: RevisionSummary;
}

export interface MergeFieldMappingRow {
  key: string;
  label: string;
  description: string | null;
  data_type: string;
  required: boolean;
  template_default: string | null;
  mapped_column: string | null;
  static_value: string | null;
  source: 'column' | 'static' | 'template_default' | 'system' | 'unmapped';
  example_value: string | null;
  missing_count: number;
  invalid_count: number;
}

export interface MergeFieldContextResponse {
  definitions: MergeFieldDefinitionDto[];
  system_fields: MergeFieldDefinitionDto[];
  available_columns: string[];
  mapping: MergeFieldMappingRow[];
  sample_values: Record<string, string>;
  total_recipients: number;
  complete: boolean;
}

export interface RecipientPreviewResponse {
  subject: string;
  preheader: string;
  html: string;
  plain_text: string;
  resolved_values: Record<string, string>;
  defaults_used: string[];
  missing_fields: string[];
  warnings: string[];
  recipient: {
    code: string | null;
    email: string;
    index: number;
    display_index: number;
    variables: Record<string, unknown>;
  } | null;
  has_previous: boolean;
  has_next: boolean;
  total: number;
}

export interface TestSendResult {
  recipient: string;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  provider_response?: string | null;
  error?: string | null;
  timestamp: string;
}

export interface TestSendResponse {
  results: TestSendResult[];
  revision_code?: string | null;
  validation: ValidationReport | Record<string, never>;
  blocked: boolean;
  message: string | null;
}

export interface AttachmentResponse {
  id: number;
  filename: string;
  content_type: string | null;
  size: number;
  is_inline: boolean;
  content_id: string | null;
  download_url: string;
}

export interface AttachmentListResponse {
  attachments: AttachmentResponse[];
  total_size: number;
  max_total_size_kb: number;
  max_count: number;
}

export type ReusableScope = 'private' | 'shared';

export interface ReusableBlockRecord {
  public_code: string;
  name: string;
  description: string | null;
  category: string;
  tags: string[];
  thumbnail: string | null;
  fragment_kind: 'section' | 'blocks';
  scope: ReusableScope;
  is_locked: boolean;
  owner_name: string | null;
  usage_count: number;
  archived_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ReusableBlockDetail extends ReusableBlockRecord {
  fragment: Record<string, unknown>;
}

export interface AssetRecord {
  public_code: string;
  filename: string;
  original_name: string;
  url: string;
  content_type: string | null;
  size: number;
  alt_text: string;
  folder: string;
  tags: string[];
  width: number | null;
  height: number | null;
  usage_count: number;
  archived_at: string | null;
  created_at: string | null;
}

export interface AssetListResponse {
  assets: AssetRecord[];
  folders: string[];
}

export interface AdminSettingsResponse {
  settings: ComposerSettings;
  permissions: Record<string, string[]>;
  catalog: Record<string, string>;
}

export interface AuditEntry {
  id: number;
  user_email: string | null;
  action: string;
  object_type: string | null;
  object_code: string | null;
  revision_no: number | null;
  summary: string | null;
  request_id: string | null;
  created_at: string | null;
}

export type { ThemeRecord, ThemeTokens, ValidationReport };
