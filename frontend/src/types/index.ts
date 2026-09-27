export interface User {
  id?: number;
  public_code: string;
  email: string;
  full_name: string;
  role: 'admin' | 'user';
  is_active: boolean;
  must_change_password: boolean;
  created_at: string | null;
}

export interface Campaign {
  id?: number;
  public_code: string;
  name: string;
  subject: string;
  from_email: string;
  from_name: string | null;
  reply_to: string | null;
  sender_identity_id: number | null;
  editor_type: string;
  content_json: string | null;
  html_body: string | null;
  preheader: string | null;
  theme_config: Record<string, string> | null;
  merge_fields_config: MergeFieldDef[] | null;
  campaign_field_definitions_json: MergeFieldDefinition[] | null;
  template_field_bindings_json: TemplateFieldBinding[] | null;
  selected_template_id: number | null;
  source_campaign_id?: number | null;
  source_campaign_code?: string | null;
  status: 'draft' | 'scheduled' | 'sending' | 'paused' | 'completed' | 'failed';
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_error?: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  unsubscribed_count: number;
  created_by: number;
  creator_name: string | null;
  created_at: string | null;
}

export interface CampaignListItem {
  id?: number;
  public_code: string;
  name: string;
  subject?: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  status: string;
  creator_name?: string | null;
  created_at?: string | null;
}

export interface Template {
  id?: number;
  public_code: string;
  name: string;
  description: string | null;
  category: string;
  editor_type: string;
  content_json: string | null;
  html_output: string | null;
  theme_config: string | null;
  merge_fields_config: string | null;
  merge_field_definitions_json: MergeFieldDefinition[] | null;
  thumbnail: string | null;
  created_by: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface UploadResponse {
  job_id: number;
  filename: string;
  total_rows: number;
  columns: string[];
}

export interface UploadStatus {
  job_id: number;
  status: string;
  total_rows: number;
  processed_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  suppressed_rows: number;
}

export interface CampaignStats {
  campaign_id: number;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  unsubscribed_count: number;
  progress_pct: number;
}

export interface CampaignQueue {
  public_code: string;
  status: Campaign['status'];
  last_error: string | null;
  provider: string;
  send_rate: number;
  eta_seconds: number | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  total: number;
  pending: number;
  sending: number;
  queued: number;
  retry_waiting: number;
  sent: number;
  failed: number;
  bounced: number;
  unsubscribed: number;
  processed: number;
  by_status: Record<string, number>;
}

export interface ColumnMapping {
  email_column: string;
  name_column?: string;
  merge_fields?: Record<string, string>;
}

export type EditorType = 'custom' | 'html';

export interface Asset {
  public_code: string;
  filename: string;
  original_name?: string;
  url: string;
  size: number;
  content_type?: string;
}

export interface SenderIdentity {
  id?: number;
  public_code: string;
  from_email: string;
  from_name: string;
  reply_to: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface MergeFieldDef {
  name: string;
  label: string;
  defaultValue: string;
  source: 'manual' | 'csv';
}

export interface MergeFieldDefinition {
  key: string;
  label: string;
  data_type: 'text' | 'email' | 'number' | 'date' | 'url';
  required: boolean;
  default_value: string | null;
  source_kind: 'system' | 'uploaded_column' | 'custom';
  source_column: string | null;
  is_system: boolean;
}

export interface TemplateFieldBinding {
  template_field_key: string;
  campaign_field_key: string | null;
}

export interface PreviewRecipient {
  id: number;
  index: number;
  display_index: number;
  total: number;
  email: string;
  display_name: string;
  variables: Record<string, string>;
}

export interface PreviewRecipientResponse {
  recipient: PreviewRecipient;
  has_previous: boolean;
  has_next: boolean;
}

export interface PreviewRenderResponse {
  subject: string;
  preheader: string;
  html: string;
  plain_text: string;
  resolved_values: Record<string, string>;
  defaults_used: string[];
  warnings: string[];
  missing_required_fields: string[];
}

export interface ThemeConfig {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  headingColor?: string;
  linkColor?: string;
  buttonColor?: string;
  buttonTextColor?: string;
}
