/**
 * Merge field definitions and campaign mapping (spec 11.1, 11.5, 11.6).
 *
 * One dialog with two jobs: declaring what the template expects, and connecting those
 * fields to real data for a campaign. Suggestions are deterministic name matches, never
 * inferred content.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Database, Plus, Trash2, Wand2 } from 'lucide-react';
import * as composerApi from '../api/composerApi';
import type { MergeFieldDefinitionDto, MergeFieldContextResponse, MergeFieldMappingRow } from '../api/types';
import { useComposer } from '../store/composerStore';
import { Dialog, DialogButton } from '../ui/Dialog';
import { InlineEmpty, Pill, Segmented, Spinner } from '../ui/primitives';
import { SelectInput, TextInput, ToggleInput } from '../ui/controls';

const DATA_TYPES: MergeFieldDefinitionDto['data_type'][] = ['text', 'number', 'date', 'currency', 'url', 'email', 'boolean', 'html'];

/** Case- and separator-insensitive comparison used for column suggestions. */
function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function MergeFieldsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const targetType = useComposer(store => store.targetType);
  const targetCode = useComposer(store => store.targetCode);
  const mergeDefs = useComposer(store => store.mergeDefs);
  const setMergeDefs = useComposer(store => store.setMergeDefs);
  const canManage = useComposer(store => store.can('manage_merge_fields'));
  const settings = useComposer(store => store.settings);
  const requestCompile = useComposer(store => store.requestCompile);

  const [tab, setTab] = useState<'fields' | 'mapping'>('fields');
  const [context, setContext] = useState<MergeFieldContextResponse | null>(null);
  const [defs, setDefs] = useState<MergeFieldDefinitionDto[]>([]);
  const [mapping, setMapping] = useState<MergeFieldMappingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await composerApi.getMergeFieldContext(targetType, targetCode);
      setContext(data);
      setDefs(data.definitions.length ? data.definitions : mergeDefs);
      setMapping(data.mapping);
    } catch (error) {
      toast.error(composerApi.describeError(error, 'Personalization details could not be loaded.'));
      setDefs(mergeDefs);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetCode, targetType]);

  useEffect(() => {
    if (open) {
      setTab(targetType === 'campaign' ? 'mapping' : 'fields');
      void load();
    }
  }, [load, open, targetType]);

  const columns = context?.available_columns || [];

  const suggest = () => {
    let matched = 0;
    setMapping(current =>
      current.map(row => {
        if (row.mapped_column || row.static_value) return row;
        const hit = columns.find(column => normalizeKey(column) === normalizeKey(row.key));
        if (!hit) return row;
        matched += 1;
        return { ...row, mapped_column: hit, source: 'column' };
      })
    );
    toast.success(matched ? `Matched ${matched} field${matched === 1 ? '' : 's'} by name.` : 'No exact column matches found.');
  };

  const updateDef = (key: string, values: Partial<MergeFieldDefinitionDto>) => {
    setDefs(current => current.map(def => (def.key === key ? { ...def, ...values } : def)));
  };

  const addDef = () => {
    const base = 'new_field';
    let key = base;
    let index = 1;
    while (defs.some(def => def.key === key)) {
      key = `${base}_${index}`;
      index += 1;
    }
    setDefs(current => [
      ...current,
      {
        key,
        label: 'New field',
        data_type: 'text',
        required: false,
        allow_in_subject: true,
        allow_in_body: true,
        allow_in_url: false,
        escape_html: true,
        source_kind: 'uploaded',
      },
    ]);
  };

  const problems = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    defs.forEach(def => {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(def.key)) out.push(`“${def.key}” is not a valid field name.`);
      if (seen.has(def.key)) out.push(`“${def.key}” is declared twice.`);
      seen.add(def.key);
    });
    mapping.forEach(row => {
      if (!row.required) return;
      const mapped = row.mapped_column || row.static_value || row.template_default;
      if (!mapped) out.push(`“${row.key}” is required but has no column, static value or default.`);
    });
    return out;
  }, [defs, mapping]);

  const save = async () => {
    setSaving(true);
    try {
      await composerApi.saveMergeFields(targetType, targetCode, {
        definitions: defs,
        mapping: mapping.map(row => ({
          key: row.key,
          mapped_column: row.mapped_column,
          static_value: row.static_value,
          source: row.source,
        })),
      });
      setMergeDefs(defs);
      requestCompile(true);
      toast.success('Personalization saved.');
      onClose();
    } catch (error) {
      toast.error(composerApi.describeError(error, 'Personalization could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const policy = settings?.missing_required_field_policy || 'use_default';
  const policyText: Record<string, string> = {
    block_campaign: 'Campaigns cannot launch while a required field is unmapped.',
    skip_recipient: 'Recipients missing a required value are skipped at send time.',
    use_default: 'The template default is used when a recipient value is missing.',
    send_empty: 'Missing values are sent as empty text.',
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title="Personalization"
      description="Declare the fields this email uses, then connect them to recipient data."
      footer={
        <>
          <DialogButton onClick={onClose}>Cancel</DialogButton>
          <DialogButton variant="primary" onClick={save} busy={saving}>
            Save personalization
          </DialogButton>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Personalization view"
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'fields', label: 'Fields' },
              { value: 'mapping', label: 'Data mapping' },
            ]}
          />
          {context && (
            <p className="text-[11.5px] text-gray-600">
              {context.total_recipients} recipient{context.total_recipients === 1 ? '' : 's'} ·{' '}
              {columns.length} column{columns.length === 1 ? '' : 's'} available
            </p>
          )}
          {context?.complete === false && <Pill tone="amber">Mapping incomplete</Pill>}
          {context?.complete && <Pill tone="green">Mapping complete</Pill>}
        </div>

        {problems.length > 0 && (
          <ul className="space-y-0.5 rounded-xl bg-amber-50 px-2.5 py-2 text-[11.5px] text-amber-900">
            {problems.slice(0, 6).map(problem => (
              <li key={problem} className="flex items-start gap-1.5">
                <AlertTriangle size={11} className="mt-px shrink-0" />
                {problem}
              </li>
            ))}
          </ul>
        )}

        {loading ? (
          <div className="flex h-40 items-center justify-center text-gray-400">
            <Spinner size={20} />
          </div>
        ) : tab === 'fields' ? (
          <div className="space-y-2">
            {defs.length ? (
              <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
                {defs.map(def => (
                  <div key={def.key} className="rounded-xl border border-gray-200 p-2.5">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <TextInput
                        label="Field name"
                        mono
                        commitOnBlur
                        value={def.key}
                        onChange={value => updateDef(def.key, { key: value.trim() })}
                        disabled={def.is_system}
                        hint="Used in the email as {{ field_name }}."
                      />
                      <TextInput
                        label="Label"
                        value={def.label || ''}
                        onChange={value => updateDef(def.key, { label: value })}
                        disabled={def.is_system}
                      />
                      <SelectInput
                        label="Type"
                        value={def.data_type || 'text'}
                        onChange={value => updateDef(def.key, { data_type: value as MergeFieldDefinitionDto['data_type'] })}
                        options={DATA_TYPES.map(type => ({ value: type as string, label: String(type) }))}
                        disabled={def.is_system}
                      />
                      <TextInput
                        label="Default value"
                        value={def.default_value || ''}
                        onChange={value => updateDef(def.key, { default_value: value || null })}
                        hint="Used when a recipient has no value."
                      />
                      <TextInput
                        label="Example value"
                        value={def.example_value || ''}
                        onChange={value => updateDef(def.key, { example_value: value || null })}
                      />
                      <TextInput
                        label="Formatting"
                        value={def.format || ''}
                        onChange={value => updateDef(def.key, { format: value || null })}
                        placeholder="currency:$ · date:%d %b %Y"
                      />
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <ToggleInput
                        label="Required"
                        value={!!def.required}
                        onChange={value => updateDef(def.key, { required: value })}
                      />
                      <ToggleInput
                        label="Allowed in the subject"
                        value={def.allow_in_subject !== false}
                        onChange={value => updateDef(def.key, { allow_in_subject: value })}
                      />
                      <ToggleInput
                        label="Allowed in links"
                        value={def.allow_in_url === true}
                        onChange={value => updateDef(def.key, { allow_in_url: value })}
                        hint="Values are URL-encoded when used in a link."
                      />
                      <ToggleInput
                        label="Escape HTML"
                        value={def.escape_html !== false}
                        onChange={value => updateDef(def.key, { escape_html: value })}
                        hint="Turn off only for trusted HTML content."
                      />
                    </div>
                    {!def.is_system && (
                      <div className="mt-1.5 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setDefs(current => current.filter(entry => entry.key !== def.key))}
                          className="inline-flex items-center gap-1 text-[11.5px] font-medium text-gray-500 hover:text-red-600"
                        >
                          <Trash2 size={11} />
                          Remove field
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <InlineEmpty
                icon={<Database size={20} />}
                title="No fields declared"
                description="Declare the fields this email expects so validation can warn about missing data."
              />
            )}
            <button
              type="button"
              onClick={addDef}
              disabled={!canManage}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-2.5 py-1.5 text-[12px] font-medium text-gray-700 hover:border-brand-400 hover:text-brand-700 disabled:opacity-40"
            >
              <Plus size={12} />
              Add a field
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={suggest}
                disabled={!columns.length}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1 text-[11.5px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                <Wand2 size={11} />
                Match columns by name
              </button>
              <p className="text-[11px] text-gray-500">{policyText[policy]}</p>
            </div>

            {mapping.length ? (
              <div className="max-h-[46vh] overflow-auto rounded-xl border border-gray-200">
                <table className="w-full text-left text-[12px]">
                  <thead className="sticky top-0 bg-gray-50 text-[10.5px] uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Field</th>
                      <th className="px-2 py-1.5 font-semibold">Source</th>
                      <th className="px-2 py-1.5 font-semibold">Value</th>
                      <th className="px-2 py-1.5 font-semibold">Example</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Data quality</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapping.map(row => (
                      <tr key={row.key} className="border-t border-gray-100">
                        <td className="px-2 py-1.5 align-top">
                          <p className="flex items-center gap-1.5 font-mono text-[11.5px] text-gray-900">
                            {row.key}
                            {row.required && <Pill tone="amber">Required</Pill>}
                          </p>
                          {row.description && <p className="text-[10.5px] text-gray-500">{row.description}</p>}
                          {row.template_default && (
                            <p className="text-[10.5px] text-gray-400">Default: {row.template_default}</p>
                          )}
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <select
                            value={row.source}
                            onChange={event => {
                              const source = event.target.value as MergeFieldMappingRow['source'];
                              setMapping(current =>
                                current.map(entry =>
                                  entry.key === row.key
                                    ? {
                                        ...entry,
                                        source,
                                        mapped_column: source === 'column' ? entry.mapped_column : null,
                                        static_value: source === 'static' ? entry.static_value || '' : null,
                                      }
                                    : entry
                                )
                              );
                            }}
                            aria-label={`Source for ${row.key}`}
                            className="w-full rounded-lg border border-gray-200 px-1.5 py-1 text-[11.5px] focus:border-brand-400 focus:outline-none"
                          >
                            <option value="column">Spreadsheet column</option>
                            <option value="static">Same value for everyone</option>
                            <option value="template_default">Template default</option>
                            <option value="system">System field</option>
                            <option value="unmapped">Not mapped</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          {row.source === 'column' ? (
                            <select
                              value={row.mapped_column || ''}
                              onChange={event =>
                                setMapping(current =>
                                  current.map(entry =>
                                    entry.key === row.key ? { ...entry, mapped_column: event.target.value || null } : entry
                                  )
                                )
                              }
                              aria-label={`Column for ${row.key}`}
                              className={clsx(
                                'w-full rounded-lg border px-1.5 py-1 text-[11.5px] focus:outline-none',
                                row.mapped_column ? 'border-gray-200 focus:border-brand-400' : 'border-amber-300 bg-amber-50'
                              )}
                            >
                              <option value="">Choose a column…</option>
                              {columns.map(column => (
                                <option key={column} value={column}>
                                  {column}
                                </option>
                              ))}
                            </select>
                          ) : row.source === 'static' ? (
                            <input
                              value={row.static_value || ''}
                              onChange={event =>
                                setMapping(current =>
                                  current.map(entry =>
                                    entry.key === row.key ? { ...entry, static_value: event.target.value } : entry
                                  )
                                )
                              }
                              aria-label={`Static value for ${row.key}`}
                              className="w-full rounded-lg border border-gray-200 px-1.5 py-1 text-[11.5px] focus:border-brand-400 focus:outline-none"
                            />
                          ) : (
                            <span className="text-[11.5px] text-gray-500">
                              {row.source === 'template_default'
                                ? row.template_default || 'No default set'
                                : row.source === 'system'
                                  ? 'Generated at send time'
                                  : '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 align-top text-[11.5px] text-gray-600">{row.example_value || '—'}</td>
                        <td className="px-2 py-1.5 text-right align-top">
                          {row.missing_count === 0 && row.invalid_count === 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                              <CheckCircle2 size={11} />
                              Complete
                            </span>
                          ) : (
                            <span className="inline-flex flex-col items-end gap-0.5 text-[11px]">
                              {row.missing_count > 0 && (
                                <span className="text-amber-700 tabular-nums">{row.missing_count} missing</span>
                              )}
                              {row.invalid_count > 0 && (
                                <span className="text-red-700 tabular-nums">{row.invalid_count} invalid</span>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <InlineEmpty
                icon={<Database size={20} />}
                title="Nothing to map yet"
                description={
                  targetType === 'campaign'
                    ? 'Upload recipients and declare fields to map them to spreadsheet columns.'
                    : 'Mapping happens per campaign. Declare the fields here and map them when the campaign is built.'
                }
              />
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
