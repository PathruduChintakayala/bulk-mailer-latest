/**
 * Composer administration (spec 25, 26, 28).
 *
 * Every value here is enforced by the backend as well; this screen only edits the stored
 * policy. Permissions are stored per role so the catalog drives the grid.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  Check,
  FileWarning,
  Gauge,
  History,
  Image as ImageIcon,
  Paperclip,
  Save,
  ScrollText,
  ShieldCheck,
  Type,
  Users,
} from 'lucide-react';
import * as composerApi from '../api/composerApi';
import type { AdminSettingsResponse, AuditEntry, ComposerSettings } from '../api/types';
import { ISSUE_CATEGORIES } from '../model/issues';
import { InlineEmpty, Pill, Spinner } from '../ui/primitives';
import { NumberInput, SelectInput, TextArea, TextInput, ToggleInput } from '../ui/controls';

type Tab = 'layout' | 'compliance' | 'media' | 'attachments' | 'validation' | 'permissions' | 'audit';

const TABS: { id: Tab; label: string; icon: JSX.Element }[] = [
  { id: 'layout', label: 'Layout and fonts', icon: <Type size={14} /> },
  { id: 'compliance', label: 'Compliance', icon: <ShieldCheck size={14} /> },
  { id: 'media', label: 'Images', icon: <ImageIcon size={14} /> },
  { id: 'attachments', label: 'Attachments', icon: <Paperclip size={14} /> },
  { id: 'validation', label: 'Validation policy', icon: <FileWarning size={14} /> },
  { id: 'permissions', label: 'Permissions', icon: <Users size={14} /> },
  { id: 'audit', label: 'Audit history', icon: <History size={14} /> },
];

const ROLES = ['admin', 'manager', 'user'];

/** Actions that can be gated per issue code. */
const BLOCKING_ACTIONS: { key: string; label: string; hint: string }[] = [
  { key: 'save', label: 'Block saving', hint: 'Authors cannot save while the issue exists.' },
  { key: 'publish', label: 'Block publishing', hint: 'The revision cannot be published.' },
  { key: 'test_send', label: 'Block test sends', hint: 'No test email can be sent.' },
  { key: 'launch', label: 'Block campaign launch', hint: 'The campaign cannot start sending.' },
];

function csv(values: string[]): string {
  return values.join(', ');
}

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
}

export default function ComposerAdmin() {
  const [tab, setTab] = useState<Tab>('layout');
  const [data, setData] = useState<AdminSettingsResponse | null>(null);
  const [settings, setSettings] = useState<ComposerSettings | null>(null);
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await composerApi.getAdminSettings();
      setData(response);
      setSettings(response.settings);
      setPermissions(response.permissions);
      setDirty(false);
    } catch (error) {
      toast.error(composerApi.describeError(error, 'Composer settings could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab !== 'audit') return;
    void composerApi
      .listAudit({ limit: 100 })
      .then(setAudit)
      .catch(() => setAudit([]));
  }, [tab]);

  const set = <K extends keyof ComposerSettings>(key: K, value: ComposerSettings[K]) => {
    setSettings(current => (current ? { ...current, [key]: value } : current));
    setDirty(true);
  };

  const togglePermission = (role: string, permission: string) => {
    setPermissions(current => {
      const held = current[role] || [];
      const next = held.includes(permission) ? held.filter(entry => entry !== permission) : [...held, permission];
      return { ...current, [role]: next };
    });
    setDirty(true);
  };

  const toggleBlocking = (code: string, action: string) => {
    setSettings(current => {
      if (!current) return current;
      const map = { ...(current.blocking_codes || {}) };
      const held = map[code] || [];
      map[code] = held.includes(action) ? held.filter(entry => entry !== action) : [...held, action];
      if (!map[code].length) delete map[code];
      return { ...current, blocking_codes: map };
    });
    setDirty(true);
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const response = await composerApi.saveAdminSettings({ settings, permissions });
      setData(response);
      setSettings(response.settings);
      setPermissions(response.permissions);
      setDirty(false);
      toast.success('Composer settings saved.');
    } catch (error) {
      toast.error(composerApi.describeError(error, 'The settings could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const catalog = useMemo(() => Object.entries(data?.catalog || {}), [data]);

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
        <Spinner size={18} />
        <span className="text-[13px]">Loading composer settings…</span>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-gray-900">
            <Gauge size={20} className="text-brand-600" />
            Composer administration
          </h1>
          <p className="mt-1 text-[13px] text-gray-600">
            Defaults, limits and policies for the email composer. The backend enforces all of these.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? <Spinner size={13} /> : <Save size={14} />}
          {dirty ? 'Save changes' : 'Saved'}
        </button>
      </header>

      <nav className="flex flex-wrap gap-1.5" aria-label="Settings sections">
        {TABS.map(entry => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            aria-pressed={tab === entry.id}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
              tab === entry.id
                ? 'border-brand-300 bg-brand-50 text-brand-700'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            )}
          >
            {entry.icon}
            {entry.label}
          </button>
        ))}
      </nav>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        {tab === 'layout' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberInput label="Default email width (px)" value={settings.default_email_width} onChange={value => set('default_email_width', value ?? 600)} min={320} max={900} />
            <NumberInput label="Minimum width (px)" value={settings.min_email_width} onChange={value => set('min_email_width', value ?? 320)} min={280} max={900} />
            <NumberInput label="Maximum width (px)" value={settings.max_email_width} onChange={value => set('max_email_width', value ?? 800)} min={320} max={1200} />
            <NumberInput label="Autosave idle delay (ms)" value={settings.autosave_idle_ms} onChange={value => set('autosave_idle_ms', value ?? 2500)} min={800} max={20000} step={100} />
            <div className="sm:col-span-2">
              <TextArea
                label="Allowed fonts"
                value={csv(settings.allowed_fonts)}
                onChange={value => set('allowed_fonts', parseCsv(value))}
                rows={2}
                hint="Comma separated. Authors can only choose from this list."
              />
            </div>
            <div className="sm:col-span-2">
              <TextArea
                label="Brand colours"
                value={csv(settings.brand_colors)}
                onChange={value => set('brand_colors', parseCsv(value))}
                rows={2}
                mono
                hint="Hex values, comma separated. Shown in every colour menu."
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {settings.brand_colors.map(color => (
                  <span key={color} className="flex items-center gap-1 rounded-lg border border-gray-200 px-1.5 py-1 text-[11px]">
                    <span className="h-3.5 w-3.5 rounded" style={{ background: color }} />
                    {color}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'compliance' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Organisation name" value={settings.organization_name} onChange={value => set('organization_name', value)} />
            <TextInput label="Unsubscribe link label" value={settings.unsubscribe_label} onChange={value => set('unsubscribe_label', value)} />
            <div className="sm:col-span-2">
              <TextArea label="Organisation address" value={settings.organization_address} onChange={value => set('organization_address', value)} rows={2} />
            </div>
            <ToggleInput label="Require an unsubscribe link" value={settings.require_unsubscribe_link} onChange={value => set('require_unsubscribe_link', value)} />
            <ToggleInput label="Require the organisation address" value={settings.require_organization_address} onChange={value => set('require_organization_address', value)} />
            <ToggleInput label="Require a view-in-browser link" value={settings.require_view_in_browser} onChange={value => set('require_view_in_browser', value)} />
            <ToggleInput label="Require a plain-text version" value={settings.require_plain_text} onChange={value => set('require_plain_text', value)} />
            <div className="sm:col-span-2">
              <ToggleInput
                label="Append a compliance footer automatically"
                hint="When required elements are missing, the compiler adds them so no email is sent without them."
                value={settings.auto_append_compliance_footer}
                onChange={value => set('auto_append_compliance_footer', value)}
              />
            </div>
            <div className="sm:col-span-2">
              <SelectInput
                label="When a required merge field has no value"
                value={settings.missing_required_field_policy}
                onChange={value => set('missing_required_field_policy', value)}
                options={[
                  { value: 'block_campaign', label: 'Block the campaign' },
                  { value: 'skip_recipient', label: 'Skip that recipient' },
                  { value: 'use_default', label: 'Use the template default' },
                  { value: 'send_empty', label: 'Send an empty value' },
                ]}
              />
            </div>
          </div>
        )}

        {tab === 'media' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberInput label="Maximum image size (KB)" value={settings.max_image_size_kb} onChange={value => set('max_image_size_kb', value ?? 2048)} min={64} max={20480} />
            <NumberInput label="Maximum HTML size (KB)" value={settings.max_html_size_kb} onChange={value => set('max_html_size_kb', value ?? 102)} min={20} max={1024} />
            <div className="sm:col-span-2">
              <TextArea label="Allowed image formats" value={csv(settings.allowed_image_formats)} onChange={value => set('allowed_image_formats', parseCsv(value))} rows={2} mono />
            </div>
            <ToggleInput label="Allow images from external hosts" value={settings.allow_external_images} onChange={value => set('allow_external_images', value)} />
            <div className="sm:col-span-2">
              <TextArea
                label="Approved external image hosts"
                value={csv(settings.allowed_image_hosts)}
                onChange={value => set('allowed_image_hosts', parseCsv(value))}
                rows={2}
                mono
                hint="Leave empty to allow any host over https."
              />
            </div>
          </div>
        )}

        {tab === 'attachments' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberInput label="Maximum size per file (KB)" value={settings.max_attachment_size_kb} onChange={value => set('max_attachment_size_kb', value ?? 5120)} min={64} max={51200} />
            <NumberInput label="Maximum total size (KB)" value={settings.max_total_attachment_size_kb} onChange={value => set('max_total_attachment_size_kb', value ?? 10240)} min={64} max={102400} />
            <NumberInput label="Maximum number of files" value={settings.max_attachment_count} onChange={value => set('max_attachment_count', value ?? 5)} min={0} max={50} />
            <div className="sm:col-span-2">
              <TextArea label="Allowed file types" value={csv(settings.allowed_attachment_types)} onChange={value => set('allowed_attachment_types', parseCsv(value))} rows={2} mono />
            </div>
            <div className="sm:col-span-2">
              <TextArea label="Blocked file types" value={csv(settings.blocked_attachment_types)} onChange={value => set('blocked_attachment_types', parseCsv(value))} rows={2} mono hint="Always wins over the allowed list." />
            </div>
          </div>
        )}

        {tab === 'validation' && (
          <div className="space-y-3">
            <p className="text-[12.5px] text-gray-600">
              Choose what each validation code blocks. Codes with no selection are warnings only.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-3">Validation code</th>
                    {BLOCKING_ACTIONS.map(action => (
                      <th key={action.key} className="px-2 py-2" title={action.hint}>
                        {action.label}
                      </th>
                    ))}
                    <th className="px-2 py-2">Cannot be dismissed</th>
                  </tr>
                </thead>
                <tbody>
                  {KNOWN_CODES.map(entry => {
                    const held = settings.blocking_codes?.[entry.code] || [];
                    const nonDismissible = (settings.non_dismissible_codes || []).includes(entry.code);
                    return (
                      <tr key={entry.code} className="border-b border-gray-100">
                        <td className="py-2 pr-3">
                          <span className="block font-medium text-gray-800">{entry.label}</span>
                          <span className="block font-mono text-[10.5px] text-gray-400">{entry.code}</span>
                        </td>
                        {BLOCKING_ACTIONS.map(action => (
                          <td key={action.key} className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => toggleBlocking(entry.code, action.key)}
                              aria-pressed={held.includes(action.key)}
                              aria-label={`${action.label} for ${entry.label}`}
                              className={clsx(
                                'flex h-5 w-5 items-center justify-center rounded border transition-colors',
                                held.includes(action.key)
                                  ? 'border-brand-500 bg-brand-500 text-white'
                                  : 'border-gray-300 bg-white hover:border-brand-300'
                              )}
                            >
                              {held.includes(action.key) && <Check size={12} />}
                            </button>
                          </td>
                        ))}
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              const list = settings.non_dismissible_codes || [];
                              set(
                                'non_dismissible_codes',
                                list.includes(entry.code) ? list.filter(item => item !== entry.code) : [...list, entry.code]
                              );
                            }}
                            aria-pressed={nonDismissible}
                            aria-label={`Cannot be dismissed: ${entry.label}`}
                            className={clsx(
                              'flex h-5 w-5 items-center justify-center rounded border transition-colors',
                              nonDismissible ? 'border-red-500 bg-red-500 text-white' : 'border-gray-300 bg-white hover:border-red-300'
                            )}
                          >
                            {nonDismissible && <Check size={12} />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11.5px] text-gray-500">
              Categories checked on every compile: {ISSUE_CATEGORIES.map(category => category.label).join(', ')}.
            </p>
          </div>
        )}

        {tab === 'permissions' && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3">Permission</th>
                  {ROLES.map(role => (
                    <th key={role} className="px-3 py-2 capitalize">
                      {role}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {catalog.map(([key, description]) => (
                  <tr key={key} className="border-b border-gray-100">
                    <td className="py-2 pr-3">
                      <span className="block font-medium text-gray-800">{description}</span>
                      <span className="block font-mono text-[10.5px] text-gray-400">{key}</span>
                    </td>
                    {ROLES.map(role => {
                      const held = (permissions[role] || []).includes(key);
                      const locked = role === 'admin';
                      return (
                        <td key={role} className="px-3 py-2">
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => togglePermission(role, key)}
                            aria-pressed={locked || held}
                            aria-label={`${description} for ${role}`}
                            className={clsx(
                              'flex h-5 w-5 items-center justify-center rounded border transition-colors',
                              locked
                                ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                                : held
                                  ? 'border-brand-500 bg-brand-500 text-white'
                                  : 'border-gray-300 bg-white hover:border-brand-300'
                            )}
                          >
                            {(locked || held) && <Check size={12} />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11.5px] text-gray-500">Administrators always hold every composer permission.</p>
          </div>
        )}

        {tab === 'audit' && (
          audit.length ? (
            <ul className="divide-y divide-gray-100">
              {audit.map(entry => (
                <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2 text-[12.5px]">
                  <Pill tone="gray">{entry.action}</Pill>
                  <span className="font-medium text-gray-800">{entry.user_email || 'System'}</span>
                  {entry.object_code && (
                    <span className="font-mono text-[11px] text-gray-500">
                      {entry.object_type}:{entry.object_code}
                      {entry.revision_no ? ` r${entry.revision_no}` : ''}
                    </span>
                  )}
                  <span className="text-gray-600">{entry.summary}</span>
                  <span className="ml-auto text-[11px] text-gray-400">
                    {entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <InlineEmpty icon={<ScrollText size={22} />} title="No composer activity yet" description="Actions appear here as authors work." />
          )
        )}
      </section>
    </div>
  );
}

/** Codes an administrator is most likely to gate; the engine can emit more. */
const KNOWN_CODES: { code: string; label: string }[] = [
  { code: 'content.empty_body', label: 'The email body is empty' },
  { code: 'content.empty_section', label: 'A section has no content' },
  { code: 'content.subject_missing', label: 'The subject line is missing' },
  { code: 'content.preheader_missing', label: 'The preheader is missing' },
  { code: 'content.placeholder_text', label: 'Placeholder text is still present' },
  { code: 'personalization.unknown_field', label: 'An unknown merge field is used' },
  { code: 'personalization.invalid_syntax', label: 'Merge field syntax is invalid' },
  { code: 'personalization.required_unmapped', label: 'A required merge field is not mapped' },
  { code: 'accessibility.image_alt_missing', label: 'An image has no alternative text' },
  { code: 'accessibility.contrast_low', label: 'Text contrast is too low' },
  { code: 'compatibility.unsupported_css', label: 'Unsupported CSS is used' },
  { code: 'compatibility.width_excessive', label: 'The content is wider than allowed' },
  { code: 'delivery.html_too_large', label: 'The HTML is too large' },
  { code: 'delivery.missing_unsubscribe', label: 'There is no unsubscribe link' },
  { code: 'delivery.missing_address', label: 'There is no organisation address' },
  { code: 'delivery.insecure_resource', label: 'An insecure resource is referenced' },
  { code: 'security.script_present', label: 'A script element is present' },
  { code: 'security.event_handler', label: 'An inline event handler is present' },
  { code: 'security.form_present', label: 'A form is present' },
  { code: 'security.javascript_url', label: 'A JavaScript URL is present' },
  { code: 'links.empty_href', label: 'A link has no destination' },
  { code: 'html.unclosed_tag', label: 'A tag is not closed' },
];
