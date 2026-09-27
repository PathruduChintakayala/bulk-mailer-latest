/**
 * Reusable content: save and browse (spec 4).
 *
 * Saving captures a copy of the fragment, so later edits to the template do not change
 * the saved block. Organization blocks can be locked, which prevents detaching them in
 * templates that use them.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Archive, Copy, Layers, Lock, Package, Search, Users } from 'lucide-react';
import * as composerApi from '../api/composerApi';
import type { ReusableBlockRecord, ReusableScope } from '../api/types';
import type { Block, Section } from '../model/document';
import { copyNodeForInsert, findNode } from '../model/mutations';
import { useComposer } from '../store/composerStore';
import { Dialog, DialogButton } from '../ui/Dialog';
import { InlineEmpty, Pill, Spinner } from '../ui/primitives';
import { SelectInput, TextArea, TextInput, ToggleInput } from '../ui/controls';

const CATEGORIES = ['Headers', 'Footers', 'Content', 'Calls to action', 'Layouts', 'Legal', 'Other'];

export interface SaveReusableRequest {
  nodeId: string;
  kind: 'section' | 'block';
}

export function SaveReusableDialog({
  request,
  onClose,
  onSaved,
}: {
  request: SaveReusableRequest | null;
  onClose: () => void;
  onSaved?: (record: ReusableBlockRecord) => void;
}) {
  const doc = useComposer(store => store.doc);
  const canManage = useComposer(store => store.can('manage_reusable_blocks'));
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Content');
  const [tags, setTags] = useState('');
  const [scope, setScope] = useState<ReusableScope>('private');
  const [locked, setLocked] = useState(false);
  const [saving, setSaving] = useState(false);

  const found = request ? findNode(doc, request.nodeId) : null;

  useEffect(() => {
    if (!request) return;
    setName('');
    setDescription('');
    setTags('');
    setScope('private');
    setLocked(false);
  }, [request]);

  const save = async () => {
    if (!found || !request) return;
    if (!name.trim()) {
      toast.error('Give the block a name so others can find it.');
      return;
    }
    setSaving(true);
    try {
      const fragment =
        request.kind === 'section'
          ? (copyNodeForInsert(found.node as Section) as unknown as Record<string, unknown>)
          : ({ blocks: [copyNodeForInsert(found.node as Block)] } as unknown as Record<string, unknown>);
      const record = await composerApi.createReusableBlock({
        name: name.trim(),
        description: description.trim(),
        category,
        tags: tags
          .split(',')
          .map(tag => tag.trim())
          .filter(Boolean),
        fragment,
        fragment_kind: request.kind === 'section' ? 'section' : 'blocks',
        scope,
        is_locked: locked && scope === 'shared',
      });
      toast.success('Saved to reusable content.');
      onSaved?.(record);
      onClose();
    } catch (error) {
      toast.error(composerApi.describeError(error, 'The block could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={!!request}
      onClose={onClose}
      size="md"
      title={request?.kind === 'section' ? 'Save section as reusable content' : 'Save block as reusable content'}
      description="A copy is stored, so future edits here will not change the saved version."
      footer={
        <>
          <DialogButton onClick={onClose}>Cancel</DialogButton>
          <DialogButton variant="primary" onClick={save} busy={saving}>
            Save
          </DialogButton>
        </>
      }
    >
      <div className="space-y-3">
        <TextInput label="Name" value={name} onChange={setName} placeholder="Standard footer" />
        <TextArea
          label="Description"
          rows={2}
          value={description}
          onChange={setDescription}
          placeholder="When should someone use this?"
        />
        <SelectInput
          label="Category"
          value={category}
          onChange={setCategory}
          options={CATEGORIES.map(entry => ({ value: entry, label: entry }))}
        />
        <TextInput label="Tags" value={tags} onChange={setTags} hint="Comma separated, used for search." />
        <SelectInput
          label="Who can use it"
          value={scope}
          onChange={value => setScope(value as ReusableScope)}
          options={[
            { value: 'private', label: 'Only me' },
            { value: 'shared', label: 'Everyone in the organization' },
          ]}
        />
        {scope === 'shared' && canManage && (
          <ToggleInput
            label="Lock this block"
            hint="Locked blocks cannot be edited or detached inside templates. Use it for approved footers and legal text."
            value={locked}
            onChange={setLocked}
          />
        )}
      </div>
    </Dialog>
  );
}

// ── library browser ───────────────────────────────────────────────────────────

export function ReusableLibraryDialog({
  open,
  onClose,
  onInsert,
}: {
  open: boolean;
  onClose: () => void;
  onInsert?: (code: string, label: string) => void;
}) {
  const canManage = useComposer(store => store.can('manage_reusable_blocks'));
  const [records, setRecords] = useState<ReusableBlockRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selected, setSelected] = useState<ReusableBlockRecord | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await composerApi.listReusableBlocks({
        search: term,
        category: category || undefined,
        include_archived: includeArchived,
      });
      setRecords(data);
    } catch (error) {
      toast.error(composerApi.describeError(error, 'Reusable content could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [category, includeArchived, term]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const grouped = useMemo(() => {
    const groups = new Map<string, ReusableBlockRecord[]>();
    records.forEach(record => {
      const key = record.category || 'Other';
      groups.set(key, [...(groups.get(key) || []), record]);
    });
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [records]);

  const act = async (action: 'clone' | 'archive' | 'restore', record: ReusableBlockRecord) => {
    try {
      if (action === 'clone') {
        await composerApi.cloneReusableBlock(record.public_code);
        toast.success('Copy created.');
      } else if (action === 'archive') {
        await composerApi.archiveReusableBlock(record.public_code);
        toast.success('Archived.');
      } else {
        await composerApi.updateReusableBlock(record.public_code, { scope: record.scope });
        toast.success('Restored.');
      }
      void refresh();
    } catch (error) {
      toast.error(composerApi.describeError(error, 'That action could not be completed.'));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Reusable content"
      description="Blocks and sections saved for reuse across templates and campaigns."
      footer={
        <>
          <DialogButton onClick={onClose}>Close</DialogButton>
          {onInsert && (
            <DialogButton
              variant="primary"
              disabled={!selected}
              onClick={() => {
                if (!selected) return;
                onInsert(selected.public_code, selected.name);
                onClose();
              }}
            >
              Insert
            </DialogButton>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={term}
              onChange={event => setTerm(event.target.value)}
              placeholder="Search reusable content"
              aria-label="Search reusable content"
              className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-2 text-[12.5px] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <select
            value={category}
            onChange={event => setCategory(event.target.value)}
            aria-label="Category"
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-[12.5px] focus:border-brand-400 focus:outline-none"
          >
            <option value="">All categories</option>
            {CATEGORIES.map(entry => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[11.5px] text-gray-600">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={event => setIncludeArchived(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            Show archived
          </label>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center text-gray-400">
            <Spinner size={18} />
          </div>
        ) : records.length ? (
          <div className="max-h-[46vh] space-y-3 overflow-y-auto pr-1">
            {grouped.map(([group, entries]) => (
              <section key={group}>
                <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">{group}</p>
                <div className="space-y-1.5">
                  {entries.map(record => (
                    <div
                      key={record.public_code}
                      onClick={() => setSelected(record)}
                      className={clsx(
                        'cursor-pointer rounded-xl border px-2.5 py-2 transition-colors',
                        selected?.public_code === record.public_code
                          ? 'border-brand-400 bg-brand-50/60'
                          : 'border-gray-200 hover:border-brand-300'
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 text-gray-400">
                          {record.fragment_kind === 'section' ? <Layers size={14} /> : <Package size={14} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold text-gray-900">
                            {record.name}
                            {record.is_locked && (
                              <Pill tone="violet" icon={<Lock size={9} />}>
                                Locked
                              </Pill>
                            )}
                            {record.scope === 'shared' && (
                              <Pill tone="blue" icon={<Users size={9} />}>
                                Shared
                              </Pill>
                            )}
                            {record.archived_at && <Pill tone="gray">Archived</Pill>}
                          </p>
                          {record.description && (
                            <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-gray-600">{record.description}</p>
                          )}
                          <p className="mt-0.5 text-[10.5px] text-gray-400">
                            {record.owner_name ? `${record.owner_name} · ` : ''}
                            Used {record.usage_count} time{record.usage_count === 1 ? '' : 's'}
                            {record.tags.length ? ` · ${record.tags.join(', ')}` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <IconButton label="Duplicate" onClick={() => act('clone', record)}>
                            <Copy size={12} />
                          </IconButton>
                          {canManage && !record.archived_at && (
                            <IconButton label="Archive" onClick={() => act('archive', record)}>
                              <Archive size={12} />
                            </IconButton>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <InlineEmpty
            icon={<Package size={20} />}
            title="Nothing saved yet"
            description="Select a section or block on the canvas and choose “Save as reusable” to build a library."
          />
        )}
      </div>
    </Dialog>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={event => {
        event.stopPropagation();
        onClick();
      }}
      className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
    >
      {children}
    </button>
  );
}
