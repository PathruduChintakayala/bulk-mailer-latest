/**
 * Document tree operations.
 *
 * Every mutation clones the document and returns a new object so the store can
 * keep undo/redo snapshots without aliasing. Documents are small enough that a
 * full clone per edit is cheaper than fine-grained immutable plumbing.
 */

import {
  Block,
  BlockType,
  Column,
  EmailDocument,
  NodeKind,
  Row,
  Section,
  Spacing,
} from './document';
import { createColumn, createRow, createSection, newId } from './defaults';

export function cloneDocument<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      /* fall through to JSON clone for values structuredClone rejects */
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface NodeLocation {
  kind: NodeKind;
  id: string;
  sectionId?: string;
  rowId?: string;
  columnId?: string;
  /** Ancestor container block ids, outermost first. */
  blockTrail: string[];
  index: number;
}

export interface FoundNode<T = Section | Row | Column | Block> {
  node: T;
  location: NodeLocation;
}

function containerBlocks(block: Block): Block[] | null {
  if (block.type === 'conditional') return block.blocks;
  return null;
}

function searchBlocks(
  blocks: Block[],
  id: string,
  base: Omit<NodeLocation, 'kind' | 'id' | 'index'>
): FoundNode<Block> | null {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.id === id) {
      return { node: block, location: { ...base, kind: 'block', id, index } };
    }
    const nested = containerBlocks(block);
    if (nested) {
      const hit = searchBlocks(nested, id, { ...base, blockTrail: [...base.blockTrail, block.id] });
      if (hit) return hit;
    }
  }
  return null;
}

export function findNode(doc: EmailDocument, id: string): FoundNode | null {
  for (let sIdx = 0; sIdx < doc.sections.length; sIdx += 1) {
    const section = doc.sections[sIdx];
    if (section.id === id) {
      return { node: section, location: { kind: 'section', id, blockTrail: [], index: sIdx } };
    }
    for (let rIdx = 0; rIdx < section.rows.length; rIdx += 1) {
      const row = section.rows[rIdx];
      if (row.id === id) {
        return {
          node: row,
          location: { kind: 'row', id, sectionId: section.id, blockTrail: [], index: rIdx },
        };
      }
      for (let cIdx = 0; cIdx < row.columns.length; cIdx += 1) {
        const column = row.columns[cIdx];
        if (column.id === id) {
          return {
            node: column,
            location: {
              kind: 'column',
              id,
              sectionId: section.id,
              rowId: row.id,
              blockTrail: [],
              index: cIdx,
            },
          };
        }
        const hit = searchBlocks(column.blocks, id, {
          sectionId: section.id,
          rowId: row.id,
          columnId: column.id,
          blockTrail: [],
        });
        if (hit) return hit;
      }
    }
  }
  return null;
}

export function getSection(doc: EmailDocument, id: string): Section | null {
  return doc.sections.find(s => s.id === id) || null;
}

/** Resolve the array a block lives in, honouring nested container blocks. */
function resolveBlockList(doc: EmailDocument, location: NodeLocation): Block[] | null {
  const section = doc.sections.find(s => s.id === location.sectionId);
  if (!section) return null;
  const row = section.rows.find(r => r.id === location.rowId);
  if (!row) return null;
  const column = row.columns.find(c => c.id === location.columnId);
  if (!column) return null;
  let list = column.blocks;
  for (const ancestorId of location.blockTrail) {
    const ancestor = list.find(b => b.id === ancestorId);
    if (!ancestor) return null;
    const nested = containerBlocks(ancestor);
    if (!nested) return null;
    list = nested;
  }
  return list;
}

export function findColumn(doc: EmailDocument, columnId: string): Column | null {
  for (const section of doc.sections) {
    for (const row of section.rows) {
      const column = row.columns.find(c => c.id === columnId);
      if (column) return column;
    }
  }
  return null;
}

// ── Updates ───────────────────────────────────────────────────────────────────

export function updateNode<T extends object>(
  doc: EmailDocument,
  id: string,
  patch: Partial<T> | ((current: T) => Partial<T>)
): EmailDocument {
  const next = cloneDocument(doc);
  const found = findNode(next, id);
  if (!found) return doc;
  const target = found.node as unknown as T;
  const changes = typeof patch === 'function' ? patch(target) : patch;
  Object.assign(target as object, changes);
  return next;
}

export function updateDocumentSettings(
  doc: EmailDocument,
  patch: Partial<EmailDocument['settings']>
): EmailDocument {
  const next = cloneDocument(doc);
  next.settings = { ...next.settings, ...patch };
  return next;
}

export function setDocumentTheme(
  doc: EmailDocument,
  themeId: string | null,
  overrides?: Record<string, unknown> | null
): EmailDocument {
  const next = cloneDocument(doc);
  next.themeId = themeId;
  if (overrides !== undefined) next.themeOverrides = overrides;
  return next;
}

// ── Insertion ─────────────────────────────────────────────────────────────────

export function insertSection(doc: EmailDocument, section: Section, index?: number): EmailDocument {
  const next = cloneDocument(doc);
  const at = index === undefined || index < 0 ? next.sections.length : Math.min(index, next.sections.length);
  next.sections.splice(at, 0, section);
  return next;
}

export function insertRow(doc: EmailDocument, sectionId: string, row: Row, index?: number): EmailDocument {
  const next = cloneDocument(doc);
  const section = getSection(next, sectionId);
  if (!section) return doc;
  const at = index === undefined || index < 0 ? section.rows.length : Math.min(index, section.rows.length);
  section.rows.splice(at, 0, row);
  return next;
}

export function insertBlock(
  doc: EmailDocument,
  columnId: string,
  block: Block,
  index?: number,
  blockTrail: string[] = []
): EmailDocument {
  const next = cloneDocument(doc);
  const column = findColumn(next, columnId);
  if (!column) return doc;
  let list = column.blocks;
  for (const ancestorId of blockTrail) {
    const ancestor = list.find(b => b.id === ancestorId);
    const nested = ancestor ? containerBlocks(ancestor) : null;
    if (!nested) return doc;
    list = nested;
  }
  const at = index === undefined || index < 0 ? list.length : Math.min(index, list.length);
  list.splice(at, 0, block);
  return next;
}

/** Append to the last column of the last section, creating structure when empty. */
export function appendBlockToEnd(doc: EmailDocument, block: Block): EmailDocument {
  if (!doc.sections.length) {
    const section = createSection([createRow([createColumn(100, [block])])]);
    return insertSection(doc, section);
  }
  const next = cloneDocument(doc);
  const section = next.sections[next.sections.length - 1];
  if (!section.rows.length) section.rows.push(createRow());
  const row = section.rows[section.rows.length - 1];
  if (!row.columns.length) row.columns.push(createColumn(100));
  row.columns[row.columns.length - 1].blocks.push(block);
  return next;
}

// ── Removal ───────────────────────────────────────────────────────────────────

export function removeNode(doc: EmailDocument, id: string): EmailDocument {
  const next = cloneDocument(doc);
  const found = findNode(next, id);
  if (!found) return doc;
  const { location } = found;
  if (location.kind === 'section') {
    next.sections.splice(location.index, 1);
    return next;
  }
  if (location.kind === 'row') {
    const section = getSection(next, location.sectionId!);
    if (!section) return doc;
    section.rows.splice(location.index, 1);
    if (!section.rows.length) next.sections = next.sections.filter(s => s.id !== section.id);
    return next;
  }
  if (location.kind === 'column') {
    const section = getSection(next, location.sectionId!);
    const row = section?.rows.find(r => r.id === location.rowId);
    if (!row) return doc;
    if (row.columns.length <= 1) return doc;
    row.columns.splice(location.index, 1);
    normalizeColumnWidths(row);
    return next;
  }
  const list = resolveBlockList(next, location);
  if (!list) return doc;
  list.splice(location.index, 1);
  return next;
}

// ── Duplication ───────────────────────────────────────────────────────────────

function regenerateBlockIds(block: Block): Block {
  block.id = newId('blk');
  if (block.type === 'table') {
    block.rows = block.rows.map(row => ({
      ...row,
      id: newId('trow'),
      cells: row.cells.map(cell => ({ ...cell, id: newId('tcel') })),
    }));
  }
  if (block.type === 'social') {
    block.links = block.links.map(link => ({ ...link, id: newId('soc') }));
  }
  if (block.type === 'navLinks') {
    block.items = block.items.map(item => ({ ...item, id: newId('nav') }));
  }
  const nested = containerBlocks(block);
  if (nested) nested.forEach(regenerateBlockIds);
  return block;
}

function regenerateColumnIds(column: Column): Column {
  column.id = newId('col');
  column.blocks.forEach(regenerateBlockIds);
  return column;
}

function regenerateRowIds(row: Row): Row {
  row.id = newId('row');
  row.columns.forEach(regenerateColumnIds);
  return row;
}

export function regenerateSectionIds(section: Section): Section {
  section.id = newId('sec');
  section.rows.forEach(regenerateRowIds);
  return section;
}

/** Deep-copy any node with fresh ids so it can be inserted alongside the original. */
export function copyNodeForInsert<T extends Section | Row | Column | Block>(node: T): T {
  const copy = cloneDocument(node);
  const kind = (copy as Section).rows
    ? 'section'
    : (copy as Row).columns
      ? 'row'
      : (copy as Column).blocks
        ? 'column'
        : 'block';
  if (kind === 'section') regenerateSectionIds(copy as unknown as Section);
  else if (kind === 'row') regenerateRowIds(copy as unknown as Row);
  else if (kind === 'column') regenerateColumnIds(copy as unknown as Column);
  else regenerateBlockIds(copy as unknown as Block);
  return copy;
}

export function duplicateNode(doc: EmailDocument, id: string): { doc: EmailDocument; newId: string | null } {
  const found = findNode(doc, id);
  if (!found) return { doc, newId: null };
  const copy = copyNodeForInsert(found.node);
  const { location } = found;

  if (location.kind === 'section') {
    return { doc: insertSection(doc, copy as Section, location.index + 1), newId: (copy as Section).id };
  }
  if (location.kind === 'row') {
    return {
      doc: insertRow(doc, location.sectionId!, copy as Row, location.index + 1),
      newId: (copy as Row).id,
    };
  }
  if (location.kind === 'column') {
    const next = cloneDocument(doc);
    const section = getSection(next, location.sectionId!);
    const row = section?.rows.find(r => r.id === location.rowId);
    if (!row) return { doc, newId: null };
    row.columns.splice(location.index + 1, 0, copy as Column);
    normalizeColumnWidths(row);
    return { doc: next, newId: (copy as Column).id };
  }
  return {
    doc: insertBlock(doc, location.columnId!, copy as Block, location.index + 1, location.blockTrail),
    newId: (copy as Block).id,
  };
}

// ── Movement ──────────────────────────────────────────────────────────────────

export function moveSection(doc: EmailDocument, sectionId: string, toIndex: number): EmailDocument {
  const next = cloneDocument(doc);
  const from = next.sections.findIndex(s => s.id === sectionId);
  if (from < 0) return doc;
  const clamped = Math.max(0, Math.min(toIndex, next.sections.length - 1));
  if (clamped === from) return doc;
  const [section] = next.sections.splice(from, 1);
  next.sections.splice(clamped, 0, section);
  return next;
}

export function moveRow(
  doc: EmailDocument,
  rowId: string,
  toSectionId: string,
  toIndex: number
): EmailDocument {
  const next = cloneDocument(doc);
  const found = findNode(next, rowId);
  if (!found || found.location.kind !== 'row') return doc;
  const fromSection = getSection(next, found.location.sectionId!);
  const toSection = getSection(next, toSectionId);
  if (!fromSection || !toSection) return doc;
  const [row] = fromSection.rows.splice(found.location.index, 1);
  const at = Math.max(0, Math.min(toIndex, toSection.rows.length));
  toSection.rows.splice(at, 0, row);
  if (!fromSection.rows.length && fromSection.id !== toSection.id) {
    next.sections = next.sections.filter(s => s.id !== fromSection.id);
  }
  return next;
}

export function moveBlock(
  doc: EmailDocument,
  blockId: string,
  toColumnId: string,
  toIndex: number,
  toBlockTrail: string[] = []
): EmailDocument {
  const next = cloneDocument(doc);
  const found = findNode(next, blockId);
  if (!found || found.location.kind !== 'block') return doc;
  const fromList = resolveBlockList(next, found.location);
  if (!fromList) return doc;

  const sameContainer =
    found.location.columnId === toColumnId &&
    found.location.blockTrail.join('/') === toBlockTrail.join('/');

  const [block] = fromList.splice(found.location.index, 1);

  const toColumn = findColumn(next, toColumnId);
  if (!toColumn) return doc;
  let toList = toColumn.blocks;
  for (const ancestorId of toBlockTrail) {
    const ancestor = toList.find(b => b.id === ancestorId);
    const nested = ancestor ? containerBlocks(ancestor) : null;
    if (!nested) return doc;
    toList = nested;
  }

  let at = toIndex;
  if (sameContainer && toIndex > found.location.index) at -= 1;
  at = Math.max(0, Math.min(at, toList.length));
  toList.splice(at, 0, block);
  return next;
}

/** Shift a node one position within its parent. Returns the same doc when at an edge. */
export function nudgeNode(doc: EmailDocument, id: string, delta: -1 | 1): EmailDocument {
  const found = findNode(doc, id);
  if (!found) return doc;
  const { location } = found;
  if (location.kind === 'section') return moveSection(doc, id, location.index + delta);
  if (location.kind === 'row') return moveRow(doc, id, location.sectionId!, location.index + delta);
  if (location.kind === 'column') {
    const next = cloneDocument(doc);
    const section = getSection(next, location.sectionId!);
    const row = section?.rows.find(r => r.id === location.rowId);
    if (!row) return doc;
    const to = location.index + delta;
    if (to < 0 || to >= row.columns.length) return doc;
    const [column] = row.columns.splice(location.index, 1);
    row.columns.splice(to, 0, column);
    return next;
  }
  const next = cloneDocument(doc);
  const list = resolveBlockList(next, location);
  if (!list) return doc;
  const to = location.index + delta;
  if (to < 0 || to >= list.length) return doc;
  const [block] = list.splice(location.index, 1);
  list.splice(to, 0, block);
  return next;
}

// ── Column structure ──────────────────────────────────────────────────────────

export function normalizeColumnWidths(row: Row): void {
  const count = row.columns.length;
  if (!count) return;
  const total = row.columns.reduce((sum, c) => sum + (Number(c.widthPct) || 0), 0);
  if (total <= 0) {
    const even = Math.floor(100 / count);
    row.columns.forEach((column, index) => {
      column.widthPct = index === count - 1 ? 100 - even * (count - 1) : even;
    });
    return;
  }
  let running = 0;
  row.columns.forEach((column, index) => {
    if (index === count - 1) {
      column.widthPct = Math.max(1, 100 - running);
    } else {
      const value = Math.max(1, Math.round(((Number(column.widthPct) || 0) / total) * 100));
      column.widthPct = value;
      running += value;
    }
  });
}

/** Change a row's column count, preserving existing content where possible. */
export function setColumnCount(doc: EmailDocument, rowId: string, count: number): EmailDocument {
  const target = Math.max(1, Math.min(4, count));
  const next = cloneDocument(doc);
  const found = findNode(next, rowId);
  if (!found || found.location.kind !== 'row') return doc;
  const row = found.node as Row;
  if (row.columns.length === target) return doc;

  while (row.columns.length < target) row.columns.push(createColumn(0));
  if (row.columns.length > target) {
    const removed = row.columns.splice(target);
    const last = row.columns[row.columns.length - 1];
    removed.forEach(column => last.blocks.push(...column.blocks));
  }
  const even = Math.floor(100 / target);
  row.columns.forEach((column, index) => {
    column.widthPct = index === target - 1 ? 100 - even * (target - 1) : even;
  });
  return next;
}

export function setColumnProportions(doc: EmailDocument, rowId: string, widths: number[]): EmailDocument {
  const next = cloneDocument(doc);
  const found = findNode(next, rowId);
  if (!found || found.location.kind !== 'row') return doc;
  const row = found.node as Row;
  row.columns.forEach((column, index) => {
    if (widths[index] !== undefined) column.widthPct = Math.max(1, Math.round(widths[index]));
  });
  normalizeColumnWidths(row);
  return next;
}

// ── Traversal helpers ─────────────────────────────────────────────────────────

export function forEachBlock(
  doc: EmailDocument,
  visit: (block: Block, ctx: { section: Section; row: Row; column: Column; trail: string[] }) => void
): void {
  for (const section of doc.sections) {
    for (const row of section.rows) {
      for (const column of row.columns) {
        const walk = (blocks: Block[], trail: string[]) => {
          for (const block of blocks) {
            visit(block, { section, row, column, trail });
            const nested = containerBlocks(block);
            if (nested) walk(nested, [...trail, block.id]);
          }
        };
        walk(column.blocks, []);
      }
    }
  }
}

export function allBlocks(doc: EmailDocument): Block[] {
  const out: Block[] = [];
  forEachBlock(doc, block => out.push(block));
  return out;
}

export function countBlocks(doc: EmailDocument): number {
  return allBlocks(doc).length;
}

export function isDocumentEmpty(doc: EmailDocument): boolean {
  const blocks = allBlocks(doc);
  if (!blocks.length) return true;
  return !blocks.some(block => {
    switch (block.type) {
      case 'text':
      case 'heading':
      case 'quote':
      case 'signature':
        return stripHtml(block.html).length > 0;
      case 'image':
        return !!block.src;
      case 'button':
        return !!block.text.trim();
      case 'list':
        return block.items.some(item => stripHtml(item).length > 0);
      case 'table':
        return block.rows.some(row => row.cells.some(cell => stripHtml(cell.html).length > 0));
      case 'rawHtml':
        return stripHtml(block.html).length > 0;
      case 'preformatted':
        return block.text.trim().length > 0;
      case 'spacer':
      case 'divider':
        return false;
      default:
        return true;
    }
  });
}

export function stripHtml(html: string): string {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function documentText(doc: EmailDocument): string {
  const parts: string[] = [];
  forEachBlock(doc, block => {
    switch (block.type) {
      case 'text':
      case 'heading':
      case 'quote':
      case 'signature':
      case 'orgFooter':
      case 'legal':
        parts.push(stripHtml(block.html));
        break;
      case 'button':
        parts.push(block.text);
        break;
      case 'list':
        parts.push(block.items.map(stripHtml).join(' '));
        break;
      case 'preformatted':
        parts.push(block.text);
        break;
      default:
        break;
    }
  });
  return parts.filter(Boolean).join('\n');
}

// ── Locking / visibility helpers ──────────────────────────────────────────────

export function toggleLock(doc: EmailDocument, id: string): EmailDocument {
  const found = findNode(doc, id);
  if (!found) return doc;
  const locked = !(found.node as { locked?: boolean }).locked;
  return updateNode(doc, id, { locked } as Record<string, unknown>);
}

export function setVisibility(
  doc: EmailDocument,
  id: string,
  surface: 'desktop' | 'mobile',
  visible: boolean
): EmailDocument {
  const found = findNode(doc, id);
  if (!found) return doc;
  const current = (found.node as { visibility: { desktop: boolean; mobile: boolean } }).visibility;
  return updateNode(doc, id, {
    visibility: { ...current, [surface]: visible },
  } as Record<string, unknown>);
}

export function isNodeLocked(doc: EmailDocument, id: string): boolean {
  const found = findNode(doc, id);
  if (!found) return false;
  if ((found.node as { locked?: boolean }).locked) return true;
  const { location } = found;
  for (const ancestorId of [location.sectionId, location.rowId, location.columnId]) {
    if (!ancestorId || ancestorId === id) continue;
    const ancestor = findNode(doc, ancestorId);
    if (ancestor && (ancestor.node as { locked?: boolean }).locked) return true;
  }
  return false;
}

// ── Formatting reset ──────────────────────────────────────────────────────────

const RESETTABLE_STYLE_KEYS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'color',
  'textTransform',
  'align',
  'direction',
] as const;

export function resetFormatting(doc: EmailDocument, id: string): EmailDocument {
  const next = cloneDocument(doc);
  const found = findNode(next, id);
  if (!found) return doc;
  const node = found.node as unknown as Record<string, unknown>;
  if (node.style && typeof node.style === 'object') {
    const style = node.style as Record<string, unknown>;
    RESETTABLE_STYLE_KEYS.forEach(key => {
      style[key] = null;
    });
  }
  node.padding = { top: 0, right: 0, bottom: 0, left: 0 } as Spacing;
  node.background = { mode: 'inherit' };
  node.border = { style: 'none', width: { top: 0, right: 0, bottom: 0, left: 0 }, color: '#e5e7eb', radius: 0 };
  node.mobile = null;
  if ('backgroundColor' in node) node.backgroundColor = null;
  if ('textColor' in node) node.textColor = null;
  return next;
}

// ── Layers tree ───────────────────────────────────────────────────────────────

export interface LayerNode {
  id: string;
  kind: NodeKind;
  label: string;
  typeLabel: string;
  locked: boolean;
  hiddenDesktop: boolean;
  hiddenMobile: boolean;
  invalid: boolean;
  children: LayerNode[];
}

function blockLabel(block: Block, fallback: string): string {
  if (block.name) return block.name;
  switch (block.type) {
    case 'heading':
    case 'text':
    case 'quote': {
      const text = stripHtml(block.html);
      return text ? text.slice(0, 40) : fallback;
    }
    case 'button':
      return block.text || fallback;
    case 'image':
      return block.alt || block.src?.split('/').pop() || fallback;
    case 'mergeField':
      return block.fieldKey ? `{{${block.fieldKey}}}` : fallback;
    default:
      return fallback;
  }
}

function blockIsInvalid(block: Block): boolean {
  switch (block.type) {
    case 'image':
      return !block.src || !block.alt;
    case 'button':
      return !block.text.trim() || !block.link.value.trim();
    case 'mergeField':
      return !block.fieldKey;
    case 'reusable':
      return !block.reusableCode;
    case 'videoThumb':
      return !block.thumbnailUrl || !block.videoUrl;
    default:
      return false;
  }
}

export function buildLayerTree(doc: EmailDocument, labels: Record<BlockType, string>): LayerNode[] {
  const mapBlocks = (blocks: Block[]): LayerNode[] =>
    blocks.map(block => ({
      id: block.id,
      kind: 'block' as NodeKind,
      label: blockLabel(block, labels[block.type] || block.type),
      typeLabel: labels[block.type] || block.type,
      locked: !!block.locked,
      hiddenDesktop: !block.visibility.desktop,
      hiddenMobile: !block.visibility.mobile,
      invalid: blockIsInvalid(block),
      children: block.type === 'conditional' ? mapBlocks(block.blocks) : [],
    }));

  return doc.sections.map((section, sIdx) => ({
    id: section.id,
    kind: 'section' as NodeKind,
    label: section.name || `Section ${sIdx + 1}`,
    typeLabel: section.role === 'body' ? 'Section' : section.role === 'header' ? 'Header' : 'Footer',
    locked: !!section.locked,
    hiddenDesktop: !section.visibility.desktop,
    hiddenMobile: !section.visibility.mobile,
    invalid: !section.rows.length,
    children: section.rows.map((row, rIdx) => ({
      id: row.id,
      kind: 'row' as NodeKind,
      label: row.name || `Row ${rIdx + 1}`,
      typeLabel: 'Row',
      locked: !!row.locked,
      hiddenDesktop: !row.visibility.desktop,
      hiddenMobile: !row.visibility.mobile,
      invalid: !row.columns.length,
      children: row.columns.map((column, cIdx) => ({
        id: column.id,
        kind: 'column' as NodeKind,
        label: column.name || `Column ${cIdx + 1}`,
        typeLabel: `Column ${column.widthPct}%`,
        locked: !!column.locked,
        hiddenDesktop: !column.visibility.desktop,
        hiddenMobile: !column.visibility.mobile,
        invalid: false,
        children: mapBlocks(column.blocks),
      })),
    })),
  }));
}
