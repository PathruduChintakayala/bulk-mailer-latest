/**
 * The Blocks view of the left panel (spec 4.1).
 *
 * Every tile is both draggable onto the canvas and clickable to insert at the
 * current selection, so insertion never depends on pointer dragging.
 */

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Library, Lock, Search, X } from 'lucide-react';
import { createBlock, LAYOUT_PRESETS } from '../model/defaults';
import { useComposer } from '../store/composerStore';
import { useNodeDrag, newBlockPayload, newPresetPayload, type DragPayload } from '../visual/dnd';
import { searchCatalog, type BlockCatalogEntry } from './blockCatalog';
import { InlineEmpty, Segmented } from '../ui/primitives';
import type { ReusableBlockRecord } from '../api/types';

export function BlocksPanel({
  reusables,
  reusablesLoading,
  onInsertReusable,
  onOpenLibrary,
}: {
  reusables: ReusableBlockRecord[];
  reusablesLoading: boolean;
  onInsertReusable: (code: string) => void;
  onOpenLibrary: () => void;
}) {
  const [term, setTerm] = useState('');
  const [tab, setTab] = useState<'content' | 'saved'>('content');
  const groups = useMemo(() => searchCatalog(term), [term]);

  const filteredReusables = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return reusables;
    return reusables.filter(
      entry =>
        entry.name.toLowerCase().includes(needle) ||
        (entry.description || '').toLowerCase().includes(needle) ||
        entry.tags.some(tag => tag.toLowerCase().includes(needle))
    );
  }, [reusables, term]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-gray-100 px-3 py-2.5">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={term}
            onChange={event => setTerm(event.target.value)}
            placeholder="Search blocks and layouts"
            aria-label="Search blocks and layouts"
            className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-7 text-[12.5px] placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {term && (
            <button
              type="button"
              onClick={() => setTerm('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <div className="mt-2">
          <Segmented
            label="Block source"
            size="sm"
            fullWidth
            value={tab}
            onChange={setTab}
            options={[
              { value: 'content', label: 'Content' },
              { value: 'saved', label: 'Saved' },
            ]}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {tab === 'content' ? (
          groups.length ? (
            <div className="space-y-4">
              {groups.map(group => (
                <section key={group.id}>
                  <h3 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                    {group.label}
                  </h3>
                  <div className="grid grid-cols-2 gap-1.5">
                    {group.entries.map(entry => (
                      <CatalogTile key={entry.id} entry={entry} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <InlineEmpty
              title="No matches"
              description="Try a different word, such as button, image, footer or column."
            />
          )
        ) : (
          <SavedBlocksList
            entries={filteredReusables}
            loading={reusablesLoading}
            onInsert={onInsertReusable}
            onOpenLibrary={onOpenLibrary}
          />
        )}
      </div>
    </div>
  );
}

function CatalogTile({ entry }: { entry: BlockCatalogEntry }) {
  const addBlock = useComposer(store => store.addBlock);
  const addSection = useComposer(store => store.addSection);
  const canEdit = useComposer(store => store.canEdit);
  const can = useComposer(store => store.can);

  const blocked = entry.permission ? !can(entry.permission) : false;
  const payload: DragPayload = entry.blockType
    ? newBlockPayload(entry.blockType)
    : newPresetPayload(entry.presetId!, entry.label);

  const { attributes, listeners, setNodeRef, isDragging } = useNodeDrag(
    payload,
    entry.blockType ? `new:${entry.blockType}` : `preset:${entry.presetId}`,
    blocked || !canEdit
  );

  const insert = () => {
    if (blocked) {
      toast.error('You do not have permission to insert raw HTML.');
      return;
    }
    if (entry.blockType) {
      addBlock(createBlock(entry.blockType));
      return;
    }
    const preset = LAYOUT_PRESETS.find(item => item.id === entry.presetId);
    if (preset) addSection(preset.build());
  };

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={insert}
      disabled={!canEdit}
      title={blocked ? `${entry.description} Requires permission.` : entry.description}
      className={clsx(
        'group flex min-h-[62px] cursor-grab flex-col items-start gap-1 rounded-lg border p-2 text-left transition-all',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        isDragging && 'opacity-40',
        blocked
          ? 'border-gray-200 bg-gray-50 text-gray-400'
          : 'border-gray-200 bg-white text-gray-700 hover:-translate-y-px hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-800 hover:shadow-sm',
        !canEdit && 'cursor-not-allowed opacity-50'
      )}
    >
      <span className={clsx('transition-colors', blocked ? 'text-gray-400' : 'text-gray-500 group-hover:text-brand-600')}>
        {blocked ? <Lock size={15} /> : entry.icon}
      </span>
      <span className="text-[11.5px] font-medium leading-tight">{entry.label}</span>
    </button>
  );
}

function SavedBlocksList({
  entries,
  loading,
  onInsert,
  onOpenLibrary,
}: {
  entries: ReusableBlockRecord[];
  loading: boolean;
  onInsert: (code: string) => void;
  onOpenLibrary: () => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map(index => (
          <div key={index} className="h-14 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    );
  }
  if (!entries.length) {
    return (
      <InlineEmpty
        icon={<Library size={20} />}
        title="No saved blocks yet"
        description="Select a section or block on the canvas and choose Save as reusable content."
        action={
          <button
            type="button"
            onClick={onOpenLibrary}
            className="mt-1 rounded-lg bg-gray-100 px-2.5 py-1 text-[12px] font-medium text-gray-700 hover:bg-gray-200"
          >
            Open the library
          </button>
        }
      />
    );
  }
  return (
    <div className="space-y-1.5">
      {entries.map(entry => (
        <SavedBlockTile key={entry.public_code} entry={entry} onInsert={onInsert} />
      ))}
      <button
        type="button"
        onClick={onOpenLibrary}
        className="mt-1 w-full rounded-lg border border-dashed border-gray-300 py-1.5 text-[12px] font-medium text-gray-600 hover:border-brand-300 hover:text-brand-700"
      >
        Manage saved blocks
      </button>
    </div>
  );
}

function SavedBlockTile({ entry, onInsert }: { entry: ReusableBlockRecord; onInsert: (code: string) => void }) {
  const canEdit = useComposer(store => store.canEdit);
  const { attributes, listeners, setNodeRef, isDragging } = useNodeDrag(
    { kind: 'new-reusable', reusableCode: entry.public_code, label: entry.name },
    `reusable:${entry.public_code}`,
    !canEdit
  );
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={() => onInsert(entry.public_code)}
      disabled={!canEdit}
      className={clsx(
        'flex w-full cursor-grab items-start gap-2 rounded-lg border border-gray-200 bg-white p-2 text-left transition-all',
        'hover:border-brand-300 hover:bg-brand-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        isDragging && 'opacity-40'
      )}
    >
      <span className="mt-0.5 text-gray-400">
        {entry.is_locked ? <Lock size={14} /> : <Library size={14} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-gray-800">{entry.name}</span>
        <span className="block truncate text-[11px] text-gray-500">
          {entry.description || `${entry.fragment_kind === 'section' ? 'Section' : 'Blocks'} · used ${entry.usage_count}×`}
        </span>
      </span>
    </button>
  );
}