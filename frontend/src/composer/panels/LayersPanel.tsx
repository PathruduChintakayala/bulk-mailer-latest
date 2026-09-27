/**
 * The Layers view of the left panel (spec 4.2).
 *
 * Shows the document hierarchy and offers a full keyboard route for reordering,
 * renaming, locking, hiding, duplicating and deleting — the accessible equivalent
 * of dragging on the canvas.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Columns2,
  Copy,
  Lock,
  Monitor,
  MoveDown,
  MoveUp,
  Pencil,
  Rows3,
  Search,
  Smartphone,
  SquareStack,
  Trash2,
  Unlock,
} from 'lucide-react';
import type { LayerNode } from '../model/mutations';
import { useComposer } from '../store/composerStore';
import { InlineEmpty } from '../ui/primitives';

export function LayersPanel() {
  const doc = useComposer(store => store.doc);
  const layers = useComposer(store => store.layers);
  const primaryId = useComposer(store => store.primaryId);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [term, setTerm] = useState('');

  // Recomputed whenever the document changes; the tree is cheap to build.
  const tree = useMemo(() => layers(), [layers, doc]);

  const filtered = useMemo(() => (term.trim() ? filterTree(tree, term.trim().toLowerCase()) : tree), [term, tree]);

  const invalidCount = useMemo(() => countInvalid(tree), [tree]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-gray-100 px-3 py-2.5">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={term}
            onChange={event => setTerm(event.target.value)}
            placeholder="Find an element"
            aria-label="Find an element in the layers tree"
            className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-2 text-[12.5px] placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        {invalidCount > 0 && (
          <p className="mt-2 flex items-center gap-1 text-[11px] text-amber-700">
            <AlertCircle size={11} />
            {invalidCount} element{invalidCount === 1 ? '' : 's'} need attention
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1.5" role="tree" aria-label="Email structure">
        {filtered.length ? (
          filtered.map((node, index) => (
            <LayerRow
              key={node.id}
              node={node}
              depth={0}
              index={index}
              total={filtered.length}
              collapsed={collapsed}
              onToggle={id => setCollapsed(current => ({ ...current, [id]: !current[id] }))}
              selectedId={primaryId}
            />
          ))
        ) : (
          <div className="px-3 py-6">
            <InlineEmpty
              title={term ? 'No matching elements' : 'Nothing here yet'}
              description={term ? 'Try another name.' : 'Add a section to see the structure.'}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function filterTree(nodes: LayerNode[], needle: string): LayerNode[] {
  const out: LayerNode[] = [];
  for (const node of nodes) {
    const children = filterTree(node.children, needle);
    const matches =
      node.label.toLowerCase().includes(needle) || node.typeLabel.toLowerCase().includes(needle) || children.length > 0;
    if (matches) out.push({ ...node, children });
  }
  return out;
}

function countInvalid(nodes: LayerNode[]): number {
  return nodes.reduce((total, node) => total + (node.invalid ? 1 : 0) + countInvalid(node.children), 0);
}

const KIND_ICON = {
  section: <SquareStack size={12} />,
  row: <Rows3 size={12} />,
  column: <Columns2 size={12} />,
  block: null,
  document: null,
} as const;

function LayerRow({
  node,
  depth,
  index,
  total,
  collapsed,
  onToggle,
  selectedId,
}: {
  node: LayerNode;
  depth: number;
  index: number;
  total: number;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
  selectedId: string | null;
}) {
  const select = useComposer(store => store.select);
  const setHover = useComposer(store => store.setHover);
  const nudge = useComposer(store => store.nudge);
  const duplicate = useComposer(store => store.duplicate);
  const remove = useComposer(store => store.remove);
  const toggleLocked = useComposer(store => store.toggleLocked);
  const setNodeVisibility = useComposer(store => store.setNodeVisibility);
  const renameNode = useComposer(store => store.renameNode);
  const canEdit = useComposer(store => store.canEdit);

  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(node.label);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  const isCollapsed = !!collapsed[node.id];
  const selected = selectedId === node.id;
  const hasChildren = node.children.length > 0;

  const commitRename = () => {
    setRenaming(false);
    const value = draft.trim();
    if (value && value !== node.label) renameNode(node.id, value);
  };

  return (
    <div role="treeitem" aria-expanded={hasChildren ? !isCollapsed : undefined} aria-selected={selected}>
      <div
        className={clsx(
          'group flex items-center gap-0.5 pr-1.5 transition-colors',
          selected ? 'bg-brand-50' : 'hover:bg-gray-50'
        )}
        style={{ paddingLeft: 6 + depth * 12 }}
        onMouseEnter={() => setHover(node.id)}
        onMouseLeave={() => setHover(null)}
      >
        <button
          type="button"
          onClick={() => hasChildren && onToggle(node.id)}
          aria-label={hasChildren ? (isCollapsed ? `Expand ${node.label}` : `Collapse ${node.label}`) : undefined}
          className={clsx(
            'flex h-5 w-4 shrink-0 items-center justify-center rounded text-gray-400',
            hasChildren ? 'hover:text-gray-700' : 'invisible'
          )}
        >
          {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>

        {renaming ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onBlur={commitRename}
            onKeyDown={event => {
              if (event.key === 'Enter') commitRename();
              if (event.key === 'Escape') {
                setDraft(node.label);
                setRenaming(false);
              }
            }}
            className="my-0.5 min-w-0 flex-1 rounded border border-brand-300 px-1 py-0.5 text-[12px] focus:outline-none"
            aria-label={`Rename ${node.label}`}
          />
        ) : (
          <button
            type="button"
            onClick={event => select(node.id, { additive: event.shiftKey })}
            onDoubleClick={() => {
              setDraft(node.label);
              setRenaming(true);
            }}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {KIND_ICON[node.kind] && <span className="shrink-0 text-gray-400">{KIND_ICON[node.kind]}</span>}
            <span
              className={clsx(
                'min-w-0 flex-1 truncate text-[12px]',
                selected ? 'font-semibold text-brand-800' : 'text-gray-700',
                (node.hiddenDesktop || node.hiddenMobile) && 'italic'
              )}
              title={`${node.typeLabel}: ${node.label}`}
            >
              {node.label}
            </span>
            {node.invalid && (
              <span title="This element needs attention" className="shrink-0 text-amber-500">
                <AlertCircle size={11} />
              </span>
            )}
            {node.locked && (
              <span title="Locked" className="shrink-0 text-gray-400">
                <Lock size={10} />
              </span>
            )}
            {node.hiddenDesktop && (
              <span title="Hidden on desktop" className="shrink-0 text-gray-400">
                <Monitor size={10} />
              </span>
            )}
            {node.hiddenMobile && (
              <span title="Hidden on mobile" className="shrink-0 text-gray-400">
                <Smartphone size={10} />
              </span>
            )}
          </button>
        )}

        {node.kind !== 'column' && (
          <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <MicroButton
              icon={<MoveUp size={10} />}
              label={`Move ${node.label} up`}
              disabled={index === 0 || node.locked || !canEdit}
              onClick={() => nudge(node.id, -1)}
            />
            <MicroButton
              icon={<MoveDown size={10} />}
              label={`Move ${node.label} down`}
              disabled={index >= total - 1 || node.locked || !canEdit}
              onClick={() => nudge(node.id, 1)}
            />
            <MicroButton
              icon={<Pencil size={10} />}
              label={`Rename ${node.label}`}
              onClick={() => {
                setDraft(node.label);
                setRenaming(true);
              }}
            />
            <MicroButton
              icon={<Copy size={10} />}
              label={`Duplicate ${node.label}`}
              disabled={node.locked || !canEdit}
              onClick={() => duplicate(node.id)}
            />
            <MicroButton
              icon={node.locked ? <Lock size={10} /> : <Unlock size={10} />}
              label={node.locked ? `Unlock ${node.label}` : `Lock ${node.label}`}
              onClick={() => toggleLocked(node.id)}
            />
            <MicroButton
              icon={<Monitor size={10} />}
              label={node.hiddenDesktop ? `Show ${node.label} on desktop` : `Hide ${node.label} on desktop`}
              onClick={() => setNodeVisibility(node.id, 'desktop', node.hiddenDesktop)}
            />
            <MicroButton
              icon={<Smartphone size={10} />}
              label={node.hiddenMobile ? `Show ${node.label} on mobile` : `Hide ${node.label} on mobile`}
              onClick={() => setNodeVisibility(node.id, 'mobile', node.hiddenMobile)}
            />
            <MicroButton
              icon={<Trash2 size={10} />}
              label={`Delete ${node.label}`}
              danger
              disabled={node.locked || !canEdit}
              onClick={() => remove(node.id)}
            />
          </span>
        )}
      </div>

      {hasChildren && !isCollapsed && (
        <div role="group">
          {node.children.map((child, childIndex) => (
            <LayerRow
              key={child.id}
              node={child}
              depth={depth + 1}
              index={childIndex}
              total={node.children.length}
              collapsed={collapsed}
              onToggle={onToggle}
              selectedId={selectedId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MicroButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'inline-flex h-4 w-4 items-center justify-center rounded p-0.5 transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        danger ? 'text-gray-400 hover:bg-red-50 hover:text-red-600' : 'text-gray-400 hover:bg-gray-200 hover:text-gray-700',
        'disabled:cursor-not-allowed disabled:opacity-30'
      )}
    >
      {icon}
    </button>
  );
}
