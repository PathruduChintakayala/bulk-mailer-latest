/**
 * Merge field picker (spec 11.2).
 *
 * Groups fields by category, separates system fields from uploaded columns, and
 * shows the description, example value and default so the author can tell whether
 * the field will resolve for every recipient.
 */

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, Check, Clock, Database, Search, Settings2, Sparkles } from 'lucide-react';
import type { MergeFieldDefinitionDto } from '../api/types';
import { useComposer } from '../store/composerStore';
import { Dialog, DialogButton } from '../ui/Dialog';
import { InlineEmpty, Pill, Segmented } from '../ui/primitives';
import { TextInput } from '../ui/controls';

const RECENTS_KEY = 'composer2:recent-merge-fields';

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function pushRecent(key: string): void {
  try {
    const next = [key, ...readRecents().filter(entry => entry !== key)].slice(0, 8);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export interface MergePickerRequest {
  /** Where the field is being inserted, used to respect allow_in_* flags. */
  context: 'body' | 'subject' | 'url';
  onPick: (key: string, options: { fallback?: string | null; format?: string | null }) => void;
}

export function MergeFieldPicker({ request, onClose }: { request: MergePickerRequest | null; onClose: () => void }) {
  const mergeDefs = useComposer(store => store.mergeDefs);
  const systemFields = useComposer(store => store.systemFields);
  const [term, setTerm] = useState('');
  const [scope, setScope] = useState<'all' | 'template' | 'system'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [fallback, setFallback] = useState('');
  const [format, setFormat] = useState('');
  const recents = useMemo(readRecents, [request]);

  const all = useMemo(() => {
    const map = new Map<string, MergeFieldDefinitionDto>();
    systemFields.forEach(field => map.set(field.key, { ...field, is_system: true }));
    mergeDefs.forEach(field => map.set(field.key, field));
    return [...map.values()];
  }, [mergeDefs, systemFields]);

  const allowed = useMemo(
    () =>
      all.filter(field => {
        if (!request) return true;
        if (request.context === 'subject') return field.allow_in_subject !== false;
        if (request.context === 'url') return field.allow_in_url !== false;
        return field.allow_in_body !== false;
      }),
    [all, request]
  );

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return allowed.filter(field => {
      if (scope === 'system' && !field.is_system) return false;
      if (scope === 'template' && field.is_system) return false;
      if (!needle) return true;
      return (
        field.key.toLowerCase().includes(needle) ||
        (field.label || '').toLowerCase().includes(needle) ||
        (field.description || '').toLowerCase().includes(needle) ||
        (field.category || '').toLowerCase().includes(needle)
      );
    });
  }, [allowed, scope, term]);

  const grouped = useMemo(() => {
    const groups = new Map<string, MergeFieldDefinitionDto[]>();
    filtered.forEach(field => {
      const key = field.category || (field.is_system ? 'System' : 'Recipient data');
      groups.set(key, [...(groups.get(key) || []), field]);
    });
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const current = selected ? allowed.find(field => field.key === selected) || null : null;

  useEffect(() => {
    if (!request) {
      setSelected(null);
      setTerm('');
      setFallback('');
      setFormat('');
    }
  }, [request]);

  useEffect(() => {
    if (!current) return;
    setFallback(current.default_value || '');
    setFormat(current.format || '');
  }, [current]);

  const insert = () => {
    if (!request || !selected) return;
    pushRecent(selected);
    request.onPick(selected, { fallback: fallback.trim() || null, format: format.trim() || null });
    onClose();
  };

  return (
    <Dialog
      open={!!request}
      onClose={onClose}
      size="lg"
      title="Insert a merge field"
      description="Values resolve per recipient. A default keeps the email readable when data is missing."
      footer={
        <>
          <DialogButton onClick={onClose}>Cancel</DialogButton>
          <DialogButton variant="primary" onClick={insert} disabled={!selected}>
            Insert field
          </DialogButton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_260px]">
        <div className="min-w-0">
          <div className="relative mb-2">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={term}
              onChange={event => setTerm(event.target.value)}
              placeholder="Search fields"
              aria-label="Search merge fields"
              className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-2 text-[13px] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <Segmented
            label="Field source"
            size="sm"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: 'All' },
              { value: 'template', label: 'Template' },
              { value: 'system', label: 'System' },
            ]}
          />

          {recents.length > 0 && !term && (
            <div className="mt-3">
              <p className="mb-1 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                <Clock size={10} />
                Recently used
              </p>
              <div className="flex flex-wrap gap-1">
                {recents
                  .filter(key => allowed.some(field => field.key === key))
                  .map(key => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelected(key)}
                      className={clsx(
                        'rounded-full border px-2 py-0.5 font-mono text-[11px] transition-colors',
                        selected === key
                          ? 'border-brand-400 bg-brand-50 text-brand-800'
                          : 'border-gray-200 text-gray-600 hover:border-brand-300'
                      )}
                    >
                      {key}
                    </button>
                  ))}
              </div>
            </div>
          )}

          <div className="mt-3 max-h-[46vh] overflow-y-auto pr-1">
            {grouped.length ? (
              grouped.map(([category, fields]) => (
                <section key={category} className="mb-3">
                  <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">{category}</p>
                  <div className="space-y-1">
                    {fields.map(field => (
                      <button
                        key={field.key}
                        type="button"
                        onClick={() => setSelected(field.key)}
                        className={clsx(
                          'flex w-full items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors',
                          selected === field.key
                            ? 'border-brand-400 bg-brand-50'
                            : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50'
                        )}
                      >
                        <span className="mt-0.5 shrink-0 text-gray-400">
                          {field.is_system ? <Settings2 size={13} /> : <Database size={13} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-mono text-[12px] text-gray-800">{field.key}</span>
                            {field.required && <Pill tone="amber">Required</Pill>}
                          </span>
                          <span className="mt-0.5 block truncate text-[11.5px] text-gray-500">
                            {field.label || field.description || field.data_type || 'text'}
                          </span>
                        </span>
                        {selected === field.key && <Check size={14} className="mt-0.5 shrink-0 text-brand-600" />}
                      </button>
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <InlineEmpty
                icon={<Sparkles size={18} />}
                title="No fields available"
                description={
                  request?.context === 'url'
                    ? 'No declared field is allowed inside a URL.'
                    : 'Upload recipient data or declare template fields to personalize this email.'
                }
              />
            )}
          </div>
        </div>

        <aside className="min-w-0 rounded-xl bg-gray-50 p-3">
          {current ? (
            <div className="space-y-3">
              <div>
                <p className="font-mono text-[12.5px] font-semibold text-gray-900">{current.key}</p>
                <p className="mt-0.5 text-[12px] leading-snug text-gray-600">
                  {current.description || 'No description provided.'}
                </p>
              </div>

              <dl className="space-y-1.5 text-[11.5px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Type</dt>
                  <dd className="font-medium text-gray-800">{current.data_type || 'text'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Required</dt>
                  <dd className="font-medium text-gray-800">{current.required ? 'Yes' : 'No'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Source</dt>
                  <dd className="font-medium text-gray-800">
                    {current.is_system ? 'System' : current.source_kind || 'uploaded'}
                  </dd>
                </div>
                {current.example_value && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">Example</dt>
                    <dd className="truncate font-medium text-gray-800">{current.example_value}</dd>
                  </div>
                )}
              </dl>

              <TextInput
                label="Default value"
                value={fallback}
                onChange={setFallback}
                placeholder="Shown when the value is missing"
              />
              <TextInput
                label="Formatting"
                value={format}
                onChange={setFormat}
                placeholder="currency:$ · number:2 · date:%d %b %Y"
              />

              {current.required && !fallback && (
                <p className="flex items-start gap-1 text-[11px] leading-snug text-amber-800">
                  <AlertTriangle size={11} className="mt-px shrink-0" />
                  This field is required. Add a default so recipients without data are not skipped.
                </p>
              )}

              <div className="rounded-lg bg-white px-2 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Will be inserted as</p>
                <p className="mt-0.5 break-all font-mono text-[11px] text-gray-700">
                  {`{{ ${current.key}${fallback ? ` | default: "${fallback}"` : ''}${format ? ` | format: ${format}` : ''} }}`}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-[12px] leading-snug text-gray-500">
              Choose a field to see its description, example value and how it will be written into the email.
            </p>
          )}
        </aside>
      </div>
    </Dialog>
  );
}
