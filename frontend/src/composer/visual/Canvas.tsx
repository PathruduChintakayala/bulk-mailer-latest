/**
 * The visual editing canvas (spec 3).
 *
 * Renders the document structure with visible boundaries, click-to-select,
 * double-click-to-edit, hover action rails, insertion indicators and keyboard
 * equivalents for every drag operation.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { DraggableAttributes } from '@dnd-kit/core';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  ChevronsLeftRight,
  Copy,
  GripVertical,
  Lock,
  Monitor,
  Plus,
  RotateCcw,
  Smartphone,
  Sparkles,
  Trash2,
  Unlock,
} from 'lucide-react';
import type { Block, Column, EmailDocument, Row, Section } from '../model/document';
import { BLOCK_LABELS, blockSupportsRichText } from '../model/document';
import { createRow, createSection } from '../model/defaults';
import { useComposer } from '../store/composerStore';
import { usePref } from '../store/preferences';
import type { ThemeTokens } from '../model/theme';
import { BlockView } from './BlockView';
import { useRichTextEditor } from './RichText';
import { useActiveEditor } from './activeEditor';
import { DropArea, DropSlot, useNodeDrag } from './dnd';
import { backgroundCss, borderCss, px, spacingCss } from './styles';

export interface CanvasProps {
  /** Opens the save-as-reusable dialog for a section or block. */
  onSaveReusable?: (nodeId: string, kind: 'section' | 'block') => void;
  /** Opens the raw HTML editor for a rawHtml block. */
  onEditRawHtml?: (blockId: string) => void;
  /** Opens the table editor for a table block. */
  onEditTable?: (blockId: string) => void;
  /** Opens the block picker targeted at a specific column. */
  onRequestBlock?: (columnId: string, index: number) => void;
}

export function Canvas({ onSaveReusable, onEditRawHtml, onEditTable, onRequestBlock }: CanvasProps) {
  const doc = useComposer(store => store.doc);
  const themeTokens = useComposer(store => store.themeTokens);
  const select = useComposer(store => store.select);
  const primaryId = useComposer(store => store.primaryId);
  const editingId = useComposer(store => store.editingId);
  const setEditing = useComposer(store => store.setEditing);
  const canEdit = useComposer(store => store.canEdit);
  const addSection = useComposer(store => store.addSection);
  const duplicate = useComposer(store => store.duplicate);
  const remove = useComposer(store => store.remove);
  const nudge = useComposer(store => store.nudge);
  const copy = useComposer(store => store.copy);
  const paste = useComposer(store => store.paste);
  const previewDevice = usePref('previewDevice');
  const showBoundaries = usePref('showBoundaries');

  const tokens = themeTokens();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const surface: 'desktop' | 'mobile' = previewDevice === 'mobile' ? 'mobile' : 'desktop';

  // Keyboard equivalents so reordering never requires a pointer.
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (!primaryId) return;
      const meta = event.ctrlKey || event.metaKey;

      if (event.key === 'Escape') {
        if (editingId) setEditing(null);
        else select(null);
        return;
      }
      if (event.key === 'Enter' && !editingId) {
        event.preventDefault();
        setEditing(primaryId);
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !editingId) {
        event.preventDefault();
        remove(primaryId);
        return;
      }
      if (meta && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicate(primaryId);
        return;
      }
      if (meta && event.key.toLowerCase() === 'c') {
        copy(primaryId);
        return;
      }
      if (meta && event.key.toLowerCase() === 'v') {
        paste();
        return;
      }
      if (event.altKey && event.key === 'ArrowUp') {
        event.preventDefault();
        nudge(primaryId, -1);
        return;
      }
      if (event.altKey && event.key === 'ArrowDown') {
        event.preventDefault();
        nudge(primaryId, 1);
      }
    },
    [copy, duplicate, editingId, nudge, paste, primaryId, remove, select, setEditing]
  );

  const frameWidth = surface === 'mobile' ? 375 : doc.settings.contentWidth;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onMouseDown={event => {
        if (event.target === event.currentTarget || (event.target as HTMLElement).dataset.canvasBackdrop === 'true') {
          select(null);
        }
      }}
      className="h-full min-h-0 overflow-auto outline-none"
      style={backgroundCss(doc.settings.outerBackground, tokens.pageBackground)}
    >
      <div data-canvas-backdrop="true" className="flex min-h-full justify-center px-6 py-8">
        <div
          className="relative w-full"
          style={{ maxWidth: px(frameWidth) }}
          data-testid="composer-canvas-frame"
        >
          {/* Content-width guide, so authors can see the email boundary. */}
          {showBoundaries && (
            <div className="pointer-events-none absolute -inset-x-3 -inset-y-3 rounded-xl border border-dashed border-gray-300/70" />
          )}

          <div style={backgroundCss(doc.settings.background, tokens.contentBackground)} className="relative">
            {!doc.sections.length && <EmptyCanvas onAdd={() => addSection(createSection())} disabled={!canEdit} />}

            <DropSlot
              id="drop-sec:0"
              target={{ kind: 'section-slot', index: 0 }}
              accepts={['section', 'new-preset', 'new-reusable']}
              label="Insert at the top"
            />

            {doc.sections.map((section, index) => (
              <div key={section.id}>
                <SectionShell
                  section={section}
                  index={index}
                  total={doc.sections.length}
                  tokens={tokens}
                  doc={doc}
                  surface={surface}
                  onSaveReusable={onSaveReusable}
                  onEditRawHtml={onEditRawHtml}
                  onEditTable={onEditTable}
                  onRequestBlock={onRequestBlock}
                />
                <DropSlot
                  id={`drop-sec:${index + 1}`}
                  target={{ kind: 'section-slot', index: index + 1 }}
                  accepts={['section', 'new-preset', 'new-reusable']}
                  label={`Insert after section ${index + 1}`}
                />
              </div>
            ))}
          </div>

          {canEdit && (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => addSection(createSection())}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-gray-300 bg-white/80 px-3 py-1.5 text-[12px] font-medium text-gray-600 transition-colors hover:border-brand-300 hover:text-brand-700"
              >
                <Plus size={13} />
                Add section
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── empty state ───────────────────────────────────────────────────────────────

function EmptyCanvas({ onAdd, disabled }: { onAdd: () => void; disabled: boolean }) {
  return (
    <DropArea
      id="drop-sec:empty"
      target={{ kind: 'section-slot', index: 0 }}
      accepts={['new-block', 'new-preset', 'new-reusable', 'section']}
      className="m-4"
    >
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/70 px-6 py-14 text-center">
        <Sparkles size={22} className="text-gray-400" />
        <p className="text-sm font-semibold text-gray-700">This email is empty</p>
        <p className="max-w-sm text-xs text-gray-500">
          Drag a block or layout from the left panel, or start with a single-column section.
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={onAdd}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          <Plus size={13} />
          Add a section
        </button>
      </div>
    </DropArea>
  );
}

// ── section ───────────────────────────────────────────────────────────────────

interface ShellCommon {
  tokens: ThemeTokens;
  doc: EmailDocument;
  surface: 'desktop' | 'mobile';
  onSaveReusable?: CanvasProps['onSaveReusable'];
  onEditRawHtml?: CanvasProps['onEditRawHtml'];
  onEditTable?: CanvasProps['onEditTable'];
  onRequestBlock?: CanvasProps['onRequestBlock'];
}

function SectionShell({
  section,
  index,
  total,
  ...common
}: ShellCommon & { section: Section; index: number; total: number }) {
  const { surface } = common;
  const primaryId = useComposer(store => store.primaryId);
  const selectedIds = useComposer(store => store.selectedIds);
  const hoverId = useComposer(store => store.hoverId);
  const select = useComposer(store => store.select);
  const setHover = useComposer(store => store.setHover);
  const showBoundaries = usePref('showBoundaries');

  const selected = primaryId === section.id || selectedIds.includes(section.id);
  const hovered = hoverId === section.id;
  const hiddenHere = surface === 'mobile' ? !section.visibility.mobile : !section.visibility.desktop;

  const { attributes, listeners, setNodeRef, isDragging } = useNodeDrag(
    { kind: 'section', sectionId: section.id, label: section.name || `Section ${index + 1}` },
    `sec:${section.id}`,
    !!section.locked
  );

  const outer: CSSProperties = backgroundCss(section.outerBackground, undefined);
  const inner: CSSProperties = {
    padding: spacingCss(section.padding),
    ...backgroundCss(section.background),
    ...borderCss(section.border),
    minHeight: section.minHeight ? px(section.minHeight) : undefined,
    maxWidth: section.contentWidth ? px(section.contentWidth) : undefined,
    marginLeft: section.contentWidth ? 'auto' : undefined,
    marginRight: section.contentWidth ? 'auto' : undefined,
  };

  return (
    <section
      ref={setNodeRef}
      style={{ ...outer, opacity: isDragging ? 0.4 : hiddenHere ? 0.45 : 1 }}
      className={clsx('relative', selected && 'z-10')}
      onMouseEnter={() => setHover(section.id)}
      onMouseLeave={() => setHover(null)}
      aria-label={section.name || `Section ${index + 1}`}
    >
      <div
        className={clsx(
          'relative transition-shadow',
          selected
            ? 'outline outline-2 outline-offset-[-2px] outline-brand-500'
            : hovered
              ? 'outline outline-1 outline-offset-[-1px] outline-brand-300'
              : showBoundaries
                ? 'outline outline-1 outline-offset-[-1px] outline-gray-200'
                : ''
        )}
        style={inner}
        onMouseDown={event => {
          if ((event.target as HTMLElement).closest('[data-node-shell="row"],[data-node-shell="block"]')) return;
          event.stopPropagation();
          select(section.id, { kind: 'section', additive: event.shiftKey });
        }}
      >
        {(selected || hovered) && (
          <NodeRail
            nodeId={section.id}
            kind="section"
            label={section.name || `${sectionRoleLabel(section.role)} section ${index + 1}`}
            index={index}
            total={total}
            locked={!!section.locked}
            visibility={section.visibility}
            dragHandle={{ attributes, listeners }}
            onSaveReusable={() => common.onSaveReusable?.(section.id, 'section')}
          />
        )}

        <DropSlot
          id={`drop-row:${section.id}:0`}
          target={{ kind: 'row-slot', sectionId: section.id, index: 0 }}
          accepts={['row', 'new-preset']}
          label="Insert row at the top of this section"
        />

        {section.rows.map((row, rowIndex) => (
          <div key={row.id}>
            <RowShell row={row} sectionId={section.id} index={rowIndex} total={section.rows.length} {...common} />
            <DropSlot
              id={`drop-row:${section.id}:${rowIndex + 1}`}
              target={{ kind: 'row-slot', sectionId: section.id, index: rowIndex + 1 }}
              accepts={['row', 'new-preset']}
              label={`Insert row after row ${rowIndex + 1}`}
            />
          </div>
        ))}

        {!section.rows.length && <EmptyRowPrompt sectionId={section.id} />}
      </div>
    </section>
  );
}

function sectionRoleLabel(role: Section['role']): string {
  if (role === 'header') return 'Header';
  if (role === 'footer') return 'Footer';
  return 'Body';
}

function EmptyRowPrompt({ sectionId }: { sectionId: string }) {
  const addRow = useComposer(store => store.addRow);
  return (
    <DropArea
      id={`drop-row:${sectionId}:empty`}
      target={{ kind: 'row-slot', sectionId, index: 0 }}
      accepts={['row', 'new-preset']}
    >
      <button
        type="button"
        onClick={() => addRow(sectionId, createRow())}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-5 text-[12px] font-medium text-gray-500 transition-colors hover:border-brand-300 hover:text-brand-700"
      >
        <Plus size={13} />
        Add a row
      </button>
    </DropArea>
  );
}

// ── row ───────────────────────────────────────────────────────────────────────

function RowShell({
  row,
  sectionId,
  index,
  total,
  ...common
}: ShellCommon & { row: Row; sectionId: string; index: number; total: number }) {
  const { surface } = common;
  const primaryId = useComposer(store => store.primaryId);
  const hoverId = useComposer(store => store.hoverId);
  const select = useComposer(store => store.select);
  const setHover = useComposer(store => store.setHover);
  const showBoundaries = usePref('showBoundaries');

  const selected = primaryId === row.id;
  const hovered = hoverId === row.id;
  const hiddenHere = surface === 'mobile' ? !row.visibility.mobile : !row.visibility.desktop;
  const stacked = surface === 'mobile' && row.stackOnMobile;

  const { attributes, listeners, setNodeRef, isDragging } = useNodeDrag(
    { kind: 'row', rowId: row.id, label: row.name || `Row ${index + 1}` },
    `row:${row.id}`,
    !!row.locked
  );

  const style: CSSProperties = {
    padding: spacingCss(row.padding),
    ...backgroundCss(row.background),
    ...borderCss(row.border),
    minHeight: row.minHeight ? px(row.minHeight) : undefined,
    opacity: isDragging ? 0.4 : hiddenHere ? 0.45 : 1,
  };

  const columns = stacked && row.reverseOnMobile ? [...row.columns].reverse() : row.columns;

  return (
    <div
      ref={setNodeRef}
      data-node-shell="row"
      style={style}
      className={clsx(
        'relative transition-shadow',
        selected
          ? 'outline outline-2 outline-offset-[-2px] outline-sky-500'
          : hovered
            ? 'outline outline-1 outline-offset-[-1px] outline-sky-300'
            : showBoundaries
              ? 'outline-dashed outline-1 outline-offset-[-1px] outline-gray-200'
              : ''
      )}
      onMouseEnter={event => {
        event.stopPropagation();
        setHover(row.id);
      }}
      onMouseLeave={() => setHover(null)}
      onMouseDown={event => {
        if ((event.target as HTMLElement).closest('[data-node-shell="block"]')) return;
        event.stopPropagation();
        select(row.id, { kind: 'row', additive: event.shiftKey });
      }}
    >
      {(selected || hovered) && (
        <NodeRail
          nodeId={row.id}
          kind="row"
          label={row.name || `Row ${index + 1} · ${row.columns.length} column${row.columns.length === 1 ? '' : 's'}`}
          index={index}
          total={total}
          locked={!!row.locked}
          visibility={row.visibility}
          dragHandle={{ attributes, listeners }}
          tone="sky"
        />
      )}

      <div
        className={clsx('flex', stacked ? 'flex-col' : 'flex-row')}
        style={{ gap: px(row.gap), alignItems: vAlignToFlex(row.vAlign) }}
      >
        {columns.map(column => (
          <ColumnShell key={column.id} column={column} stacked={stacked} {...common} />
        ))}
      </div>
    </div>
  );
}

function vAlignToFlex(vAlign: Row['vAlign']): CSSProperties['alignItems'] {
  if (vAlign === 'middle') return 'center';
  if (vAlign === 'bottom') return 'flex-end';
  return 'stretch';
}

// ── column ────────────────────────────────────────────────────────────────────

function ColumnShell({
  column,
  stacked,
  ...common
}: ShellCommon & { column: Column; stacked: boolean }) {
  const { surface, onRequestBlock } = common;
  const primaryId = useComposer(store => store.primaryId);
  const hoverId = useComposer(store => store.hoverId);
  const select = useComposer(store => store.select);
  const setHover = useComposer(store => store.setHover);
  const showBoundaries = usePref('showBoundaries');

  const selected = primaryId === column.id;
  const hovered = hoverId === column.id;
  const hiddenHere = surface === 'mobile' ? !column.visibility.mobile : !column.visibility.desktop;

  const style: CSSProperties = {
    flexBasis: stacked ? 'auto' : `${column.widthPct}%`,
    flexGrow: 0,
    flexShrink: 1,
    minWidth: column.minWidth ? px(column.minWidth) : 0,
    padding: spacingCss(column.padding),
    ...backgroundCss(column.background),
    ...borderCss(column.border),
    opacity: hiddenHere ? 0.45 : 1,
  };

  return (
    <div
      style={style}
      data-node-shell="column"
      className={clsx(
        'relative min-w-0 transition-shadow',
        selected
          ? 'outline outline-2 outline-offset-[-2px] outline-teal-500'
          : hovered
            ? 'outline outline-1 outline-offset-[-1px] outline-teal-300'
            : showBoundaries
              ? 'outline-dotted outline-1 outline-offset-[-1px] outline-gray-300'
              : ''
      )}
      onMouseEnter={event => {
        event.stopPropagation();
        setHover(column.id);
      }}
      onMouseLeave={() => setHover(null)}
      onMouseDown={event => {
        if ((event.target as HTMLElement).closest('[data-node-shell="block"]')) return;
        event.stopPropagation();
        select(column.id, { kind: 'column' });
      }}
    >
      {(selected || hovered) && (
        <span className="pointer-events-none absolute -top-4 left-0 z-20 rounded bg-teal-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {Math.round(column.widthPct)}%
        </span>
      )}

      <DropSlot
        id={`drop-col:${column.id}:0`}
        target={{ kind: 'block-slot', columnId: column.id, index: 0 }}
        accepts={['block', 'new-block', 'new-reusable']}
        label="Insert block at the top of this column"
      />

      {column.blocks.map((block, blockIndex) => (
        <div key={block.id}>
          <BlockShell block={block} index={blockIndex} total={column.blocks.length} {...common} />
          <DropSlot
            id={`drop-col:${column.id}:${blockIndex + 1}`}
            target={{ kind: 'block-slot', columnId: column.id, index: blockIndex + 1 }}
            accepts={['block', 'new-block', 'new-reusable']}
            label={`Insert block after ${BLOCK_LABELS[block.type]}`}
          />
        </div>
      ))}

      {!column.blocks.length && (
        <DropArea
          id={`drop-col:${column.id}:empty`}
          target={{ kind: 'block-slot', columnId: column.id, index: 0 }}
          accepts={['block', 'new-block', 'new-reusable']}
        >
          <button
            type="button"
            onClick={() => onRequestBlock?.(column.id, 0)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-6 text-[12px] font-medium text-gray-500 transition-colors hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-700"
          >
            <Plus size={13} />
            Add a block
          </button>
        </DropArea>
      )}
    </div>
  );
}

// ── block ─────────────────────────────────────────────────────────────────────

function BlockShell({
  block,
  index,
  total,
  ...common
}: ShellCommon & { block: Block; index: number; total: number }) {
  const { tokens, surface, onEditRawHtml, onEditTable } = common;
  const primaryId = useComposer(store => store.primaryId);
  const selectedIds = useComposer(store => store.selectedIds);
  const hoverId = useComposer(store => store.hoverId);
  const editingId = useComposer(store => store.editingId);
  const select = useComposer(store => store.select);
  const setHover = useComposer(store => store.setHover);
  const setEditing = useComposer(store => store.setEditing);
  const showBoundaries = usePref('showBoundaries');

  const selected = primaryId === block.id || selectedIds.includes(block.id);
  const hovered = hoverId === block.id;
  const editing = editingId === block.id;
  const hiddenHere = surface === 'mobile' ? !block.visibility.mobile : !block.visibility.desktop;

  const { attributes, listeners, setNodeRef, isDragging } = useNodeDrag(
    { kind: 'block', blockId: block.id, label: block.name || BLOCK_LABELS[block.type] },
    `blk:${block.id}`,
    !!block.locked || editing
  );

  const openEditor = useCallback(() => {
    if (block.locked) {
      toast('This block is locked.');
      return;
    }
    if (block.type === 'rawHtml') {
      onEditRawHtml?.(block.id);
      return;
    }
    if (block.type === 'table') {
      onEditTable?.(block.id);
      return;
    }
    if (blockSupportsRichText(block.type)) setEditing(block.id);
  }, [block.id, block.locked, block.type, onEditRawHtml, onEditTable, setEditing]);

  return (
    <div
      ref={setNodeRef}
      data-node-shell="block"
      data-node-id={block.id}
      className={clsx(
        'relative transition-shadow',
        isDragging && 'opacity-40',
        hiddenHere && 'opacity-45',
        selected
          ? 'outline outline-2 outline-offset-[-2px] outline-brand-600'
          : hovered
            ? 'outline outline-1 outline-offset-[-1px] outline-brand-400'
            : showBoundaries
              ? 'outline-dotted outline-1 outline-offset-[-1px] outline-gray-200'
              : ''
      )}
      onMouseEnter={event => {
        event.stopPropagation();
        setHover(block.id);
      }}
      onMouseLeave={() => setHover(null)}
      onMouseDown={event => {
        if (editing) return;
        event.stopPropagation();
        select(block.id, { kind: 'block', additive: event.shiftKey || event.ctrlKey || event.metaKey });
      }}
      onDoubleClick={event => {
        event.stopPropagation();
        openEditor();
      }}
    >
      {(selected || hovered) && !editing && (
        <NodeRail
          nodeId={block.id}
          kind="block"
          label={block.name || BLOCK_LABELS[block.type]}
          index={index}
          total={total}
          locked={!!block.locked}
          visibility={block.visibility}
          dragHandle={{ attributes, listeners }}
          onSaveReusable={() => common.onSaveReusable?.(block.id, 'block')}
          tone="brand"
          compact
        />
      )}

      {editing ? (
        <EditingBlock block={block} tokens={tokens} surface={surface} />
      ) : (
        <BlockView block={block} tokens={tokens} surface={surface} />
      )}
    </div>
  );
}

/** Mounts the single live rich-text instance for the block being edited. */
function EditingBlock({
  block,
  tokens,
  surface,
}: {
  block: Block;
  tokens: ThemeTokens;
  surface: 'desktop' | 'mobile';
}) {
  const updateNodeById = useComposer(store => store.updateNodeById);
  const setEditing = useComposer(store => store.setEditing);
  const setActiveEditor = useActiveEditor(store => store.setEditor);

  const html = (block as { html?: string }).html ?? '';

  const editor = useRichTextEditor({
    value: html,
    onChange: next => updateNodeById(block.id, { html: next }, `Edit ${BLOCK_LABELS[block.type].toLowerCase()}`),
    onPasteNotes: notes => notes.forEach(note => toast(note, { icon: '✎', duration: 4000 })),
    placeholder: block.type === 'heading' ? 'Heading text' : 'Write your message…',
    singleLine: block.type === 'heading',
    autoFocus: true,
  });

  useEffect(() => {
    setActiveEditor(block.id, editor);
    return () => setActiveEditor(null, null);
  }, [block.id, editor, setActiveEditor]);

  // Clicking outside the block commits the edit and returns to selection mode.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const node = (event.target as HTMLElement).closest(`[data-node-id="${block.id}"]`);
      if (!node) setEditing(null);
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', onPointerDown), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [block.id, setEditing]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute -top-4 right-0 z-20 rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        Editing
      </span>
      <BlockView block={block} tokens={tokens} editor={editor} editing surface={surface} />
    </div>
  );
}

// ── hover / selection action rail ─────────────────────────────────────────────

function NodeRail({
  nodeId,
  kind,
  label,
  index,
  total,
  locked,
  visibility,
  dragHandle,
  onSaveReusable,
  tone = 'brand',
  compact = false,
}: {
  nodeId: string;
  kind: 'section' | 'row' | 'block';
  label: string;
  index: number;
  total: number;
  locked: boolean;
  visibility: { desktop: boolean; mobile: boolean };
  dragHandle: {
    attributes: Record<string, unknown> | DraggableAttributes;
    listeners: Record<string, unknown> | undefined;
  };
  onSaveReusable?: () => void;
  tone?: 'brand' | 'sky';
  compact?: boolean;
}) {
  const duplicate = useComposer(store => store.duplicate);
  const remove = useComposer(store => store.remove);
  const nudge = useComposer(store => store.nudge);
  const toggleLocked = useComposer(store => store.toggleLocked);
  const setNodeVisibility = useComposer(store => store.setNodeVisibility);
  const clearFormatting = useComposer(store => store.clearFormatting);
  const canEdit = useComposer(store => store.canEdit);
  const [confirming, setConfirming] = useState(false);

  const toneClass = tone === 'sky' ? 'bg-sky-600' : 'bg-brand-600';

  return (
    <div
      className={clsx(
        'absolute z-30 flex items-center gap-0.5 rounded-lg px-1 py-0.5 text-white shadow-lg',
        toneClass,
        compact ? '-top-3.5 right-1' : '-top-3.5 left-1'
      )}
      role="toolbar"
      aria-label={`${label} actions`}
      onMouseDown={event => event.stopPropagation()}
    >
      <button
        type="button"
        {...dragHandle.attributes}
        {...(dragHandle.listeners as Record<string, unknown>)}
        disabled={locked || !canEdit}
        title={locked ? 'Locked' : `Drag to move this ${kind}`}
        aria-label={locked ? `${label} is locked` : `Drag to move ${label}`}
        className="inline-flex h-5 cursor-grab items-center rounded px-0.5 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <GripVertical size={12} />
      </button>

      <span className="max-w-[160px] truncate px-1 text-[10.5px] font-semibold uppercase tracking-wide">{label}</span>

      <RailButton
        icon={<ArrowUp size={11} />}
        label={`Move ${kind} up`}
        disabled={index === 0 || locked || !canEdit}
        onClick={() => nudge(nodeId, -1)}
      />
      <RailButton
        icon={<ArrowDown size={11} />}
        label={`Move ${kind} down`}
        disabled={index >= total - 1 || locked || !canEdit}
        onClick={() => nudge(nodeId, 1)}
      />
      <RailButton
        icon={<Copy size={11} />}
        label={`Duplicate ${kind}`}
        disabled={locked || !canEdit}
        onClick={() => duplicate(nodeId)}
      />
      {onSaveReusable && (
        <RailButton icon={<Bookmark size={11} />} label="Save as reusable content" onClick={onSaveReusable} />
      )}
      <RailButton
        icon={locked ? <Lock size={11} /> : <Unlock size={11} />}
        label={locked ? `Unlock ${kind}` : `Lock ${kind}`}
        onClick={() => toggleLocked(nodeId)}
      />
      <RailButton
        icon={visibility.desktop ? <Monitor size={11} /> : <Monitor size={11} className="opacity-50 line-through" />}
        label={visibility.desktop ? 'Hide on desktop' : 'Show on desktop'}
        onClick={() => setNodeVisibility(nodeId, 'desktop', !visibility.desktop)}
      />
      <RailButton
        icon={visibility.mobile ? <Smartphone size={11} /> : <Smartphone size={11} className="opacity-50" />}
        label={visibility.mobile ? 'Hide on mobile' : 'Show on mobile'}
        onClick={() => setNodeVisibility(nodeId, 'mobile', !visibility.mobile)}
      />
      <RailButton
        icon={<RotateCcw size={11} />}
        label="Reset formatting"
        disabled={locked || !canEdit}
        onClick={() => clearFormatting(nodeId)}
      />
      {confirming ? (
        <button
          type="button"
          onClick={() => {
            remove(nodeId);
            setConfirming(false);
          }}
          onBlur={() => setConfirming(false)}
          className="ml-0.5 inline-flex h-5 items-center rounded bg-white px-1.5 text-[10px] font-bold text-red-600"
        >
          Delete?
        </button>
      ) : (
        <RailButton
          icon={<Trash2 size={11} />}
          label={`Delete ${kind}`}
          disabled={locked || !canEdit}
          onClick={() => setConfirming(true)}
        />
      )}
    </div>
  );
}

function RailButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={event => {
        event.stopPropagation();
        onClick();
      }}
      className="inline-flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon}
    </button>
  );
}

// ── column proportion control, used by the row inspector ──────────────────────

export function ColumnProportionBar({ row, onChange }: { row: Row; onChange: (widths: number[]) => void }) {
  const [dragging, setDragging] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widths = useMemo(() => row.columns.map(column => column.widthPct), [row.columns]);

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (dragging === null || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const before = widths.slice(0, dragging).reduce((sum, value) => sum + value, 0);
      const pair = widths[dragging] + widths[dragging + 1];
      const nextLeft = Math.min(pair - 10, Math.max(10, Math.round(ratio * 100 - before)));
      const next = [...widths];
      next[dragging] = nextLeft;
      next[dragging + 1] = pair - nextLeft;
      onChange(next);
    },
    [dragging, onChange, widths]
  );

  useEffect(() => {
    if (dragging === null) return;
    const stop = () => setDragging(null);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stop);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stop);
    };
  }, [dragging, onPointerMove]);

  return (
    <div ref={containerRef} className="flex h-8 w-full items-stretch overflow-hidden rounded-lg border border-gray-200">
      {row.columns.map((column, index) => (
        <div key={column.id} className="relative flex items-center justify-center bg-gray-50" style={{ width: `${column.widthPct}%` }}>
          <span className="text-[11px] font-semibold tabular-nums text-gray-600">{Math.round(column.widthPct)}%</span>
          {index < row.columns.length - 1 && (
            <button
              type="button"
              aria-label={`Resize columns ${index + 1} and ${index + 2}`}
              onPointerDown={() => setDragging(index)}
              onKeyDown={event => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                const delta = event.key === 'ArrowLeft' ? -5 : 5;
                const next = [...widths];
                const pair = next[index] + next[index + 1];
                next[index] = Math.min(pair - 10, Math.max(10, next[index] + delta));
                next[index + 1] = pair - next[index];
                onChange(next);
              }}
              className="absolute -right-1.5 top-0 z-10 flex h-full w-3 cursor-col-resize items-center justify-center text-gray-400 hover:text-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <ChevronsLeftRight size={11} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}