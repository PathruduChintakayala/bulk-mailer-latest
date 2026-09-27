/**
 * The composer's working state.
 *
 * Holds the canonical document (or HTML source), undo history, selection, save
 * lifecycle and the compiled output that both the preview and delivery use. The
 * backend remains authoritative for compilation and validation; this store only
 * orchestrates when to ask for it.
 */

import { create } from 'zustand';
import type { Block, EmailDocument, NodeKind, Row, Section } from '../model/document';
import { BLOCK_LABELS } from '../model/document';
import {
  createColumn,
  createEmptyDocument,
  createRow,
  createSection,
  createStarterDocument,
} from '../model/defaults';
import {
  LayerNode,
  buildLayerTree,
  cloneDocument,
  copyNodeForInsert,
  duplicateNode,
  findNode,
  insertBlock,
  insertRow,
  insertSection,
  isNodeLocked,
  moveBlock,
  moveRow,
  moveSection,
  nudgeNode,
  removeNode,
  resetFormatting,
  setVisibility,
  toggleLock,
  updateDocumentSettings,
  updateNode,
} from '../model/mutations';
import { normalizeDocument } from '../model/normalize';
import { DEFAULT_THEME_TOKENS, ThemeRecord, ThemeTokens, resolveTokens } from '../model/theme';
import type { ValidationIssue, ValidationReport } from '../model/issues';
import * as composerApi from '../api/composerApi';
import { ConcurrencyError, ValidationBlockedError, describeError, isOfflineError } from '../api/composerApi';
import type {
  ComposerSettings,
  MergeFieldDefinitionDto,
  PermissionKey,
  PlainTextMode,
  RevisionContent,
  RevisionKind,
  RevisionStatus,
  RevisionSummary,
  TargetType,
} from '../api/types';
import { clearRecoveryCopy, markCleanExit, writeRecoveryCopy, type RecoveryCopy } from './recovery';
import { usePreferences } from './preferences';

export type SaveStatus =
  | 'clean'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'failed'
  | 'offline'
  | 'conflict'
  | 'blocked';

export interface CompiledOutput {
  html: string;
  plainText: string;
  validation: ValidationReport;
  warnings: string[];
  removed: string[];
  autoAppended: string[];
  sizeBytes: number;
  /** Monotonic id so late responses can be discarded. */
  requestId: number;
  at: number;
}

interface Snapshot {
  doc: EmailDocument;
  htmlSource: string;
  subject: string;
  preheader: string;
  plainText: string;
  plainTextMode: PlainTextMode;
  mergeDefs: MergeFieldDefinitionDto[];
  themeCode: string | null;
  themeOverrides: Record<string, unknown> | null;
  label: string;
  at: number;
}

export interface ClipboardEntry {
  kind: NodeKind;
  node: Section | Row | Block;
  label: string;
}

const HISTORY_LIMIT = 80;
const COALESCE_MS = 700;
const COMPILE_DEBOUNCE_MS = 500;

const EMPTY_VALIDATION: ValidationReport = {
  issues: [],
  summary: { blockers: 0, errors: 0, warnings: 0, info: 0, passed: true },
  blocks: { save: false, publish: false, test_send: false, launch: false },
};

interface ComposerState {
  // ── bootstrap ──────────────────────────────────────────────────────────────
  ready: boolean;
  loading: boolean;
  bootError: string | null;
  settings: ComposerSettings | null;
  permissions: Partial<Record<PermissionKey, boolean>>;
  themes: ThemeRecord[];
  fonts: { label: string; stack: string }[];
  systemFields: MergeFieldDefinitionDto[];
  capabilities: { sanitizer: boolean; css_inliner: boolean; user_role: string; user_code: string } | null;

  // ── target ─────────────────────────────────────────────────────────────────
  targetType: TargetType;
  targetCode: string;
  targetName: string;
  targetDescription: string;
  targetStatus: string;
  breadcrumb: { label: string; to: string | null }[];
  canEdit: boolean;
  lockedReason: string | null;
  recipientCount: number;
  sender: { code: string | null; from_email: string | null; from_name: string | null; reply_to: string | null } | null;

  // ── revision ───────────────────────────────────────────────────────────────
  draftCode: string | null;
  revisionNo: number;
  revisionStatus: RevisionStatus;
  kind: RevisionKind;
  publishedRevision: RevisionSummary | null;
  revisions: RevisionSummary[];

  // ── content ────────────────────────────────────────────────────────────────
  doc: EmailDocument;
  htmlSource: string;
  subject: string;
  preheader: string;
  themeCode: string | null;
  themeOverrides: Record<string, unknown> | null;
  mergeDefs: MergeFieldDefinitionDto[];
  plainText: string;
  plainTextMode: PlainTextMode;
  /** True when hand-edited plain text no longer reflects the current content. */
  plainTextStale: boolean;

  // ── history ────────────────────────────────────────────────────────────────
  past: Snapshot[];
  future: Snapshot[];

  // ── selection ──────────────────────────────────────────────────────────────
  selectedIds: string[];
  primaryId: string | null;
  primaryKind: NodeKind;
  editingId: string | null;
  hoverId: string | null;
  clipboard: ClipboardEntry | null;

  // ── save ───────────────────────────────────────────────────────────────────
  saveStatus: SaveStatus;
  saveMessage: string | null;
  lastSavedAt: number | null;
  conflict: RevisionSummary | null;
  savePending: boolean;

  // ── compile ────────────────────────────────────────────────────────────────
  compiling: boolean;
  compiled: CompiledOutput | null;
  lastGoodHtml: string;
  lastGoodAt: number | null;
  previewStale: boolean;
  compileError: string | null;

  // ── recovery ───────────────────────────────────────────────────────────────
  recoveryOffer: RecoveryCopy | null;

  // ── actions ────────────────────────────────────────────────────────────────
  boot: () => Promise<void>;
  open: (targetType: TargetType, targetCode: string) => Promise<void>;
  teardown: () => void;

  commit: (producer: (doc: EmailDocument) => EmailDocument, label: string) => void;
  setHtmlSource: (value: string, label?: string) => void;
  setSubject: (value: string) => void;
  setPreheader: (value: string) => void;
  setPlainText: (value: string) => void;
  setPlainTextMode: (mode: PlainTextMode) => void;
  regeneratePlainText: () => void;
  setMergeDefs: (defs: MergeFieldDefinitionDto[]) => void;
  setThemeCode: (code: string | null) => void;
  setThemeOverrides: (overrides: Record<string, unknown> | null) => void;
  setTargetName: (name: string) => void;
  setTargetDescription: (description: string) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  undoLabel: () => string | null;
  redoLabel: () => string | null;

  select: (id: string | null, options?: { additive?: boolean; kind?: NodeKind }) => void;
  selectMany: (ids: string[]) => void;
  setEditing: (id: string | null) => void;
  setHover: (id: string | null) => void;
  selectedNode: () => { node: Section | Row | Row['columns'][number] | Block; kind: NodeKind } | null;

  updateSelected: (patch: Record<string, unknown>, label?: string) => void;
  updateNodeById: (id: string, patch: Record<string, unknown>, label?: string) => void;
  updateSettings: (patch: Partial<EmailDocument['settings']>) => void;

  addBlock: (block: Block, target?: { columnId?: string; index?: number }) => void;
  addSection: (section: Section, index?: number) => void;
  addRow: (sectionId: string, row: Row, index?: number) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  nudge: (id: string, delta: -1 | 1) => void;
  moveBlockTo: (blockId: string, columnId: string, index: number) => void;
  moveRowTo: (rowId: string, sectionId: string, index: number) => void;
  moveSectionTo: (sectionId: string, index: number) => void;
  copy: (id: string) => void;
  paste: (target?: { columnId?: string; index?: number; sectionIndex?: number }) => void;
  toggleLocked: (id: string) => void;
  setNodeVisibility: (id: string, surface: 'desktop' | 'mobile', visible: boolean) => void;
  clearFormatting: (id: string) => void;
  renameNode: (id: string, name: string) => void;

  layers: () => LayerNode[];
  themeTokens: () => ThemeTokens;
  isLocked: (id: string) => boolean;
  can: (permission: PermissionKey) => boolean;

  requestCompile: (immediate?: boolean) => void;
  save: (options?: { summary?: string; silent?: boolean }) => Promise<boolean>;
  publish: (summary?: string, overrideReason?: string) => Promise<boolean>;
  restore: (revisionCode: string) => Promise<boolean>;
  forkToHtml: () => Promise<boolean>;
  reloadFromServer: () => Promise<void>;
  applyRecovery: (copy: RecoveryCopy) => void;
  dismissRecovery: () => void;
  markDirty: () => void;
  issues: () => ValidationIssue[];
}

// ── module-level timers (kept out of state so they never trigger re-render) ────

let compileTimer: ReturnType<typeof setTimeout> | null = null;
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
let compileSeq = 0;
let saveRetries = 0;

function snapshotOf(state: ComposerState, label: string): Snapshot {
  return {
    doc: state.doc,
    htmlSource: state.htmlSource,
    subject: state.subject,
    preheader: state.preheader,
    plainText: state.plainText,
    plainTextMode: state.plainTextMode,
    mergeDefs: state.mergeDefs,
    themeCode: state.themeCode,
    themeOverrides: state.themeOverrides,
    label,
    at: Date.now(),
  };
}

function restoreSnapshot(snapshot: Snapshot): Partial<ComposerState> {
  return {
    doc: snapshot.doc,
    htmlSource: snapshot.htmlSource,
    subject: snapshot.subject,
    preheader: snapshot.preheader,
    plainText: snapshot.plainText,
    plainTextMode: snapshot.plainTextMode,
    mergeDefs: snapshot.mergeDefs,
    themeCode: snapshot.themeCode,
    themeOverrides: snapshot.themeOverrides,
  };
}

function kindOfId(doc: EmailDocument, id: string | null): NodeKind {
  if (!id) return 'document';
  const found = findNode(doc, id);
  return found ? found.location.kind : 'document';
}

// Memoize themeTokens to return the same reference when inputs haven't changed.
let _ttCache: { key: string; result: ThemeTokens } | null = null;

function memoizedThemeTokens(themes: ThemeRecord[], themeCode: string | null, themeOverrides: Record<string, unknown> | null): ThemeTokens {
  const theme = themes.find(entry => entry.public_code === themeCode);
  const base = theme?.tokens || themes.find(entry => entry.is_org_default)?.tokens || DEFAULT_THEME_TOKENS;
  const key = JSON.stringify([base, themeOverrides]);
  if (_ttCache && _ttCache.key === key) return _ttCache.result;
  const result = resolveTokens(base as ThemeTokens, themeOverrides);
  _ttCache = { key, result };
  return result;
}

export const useComposer = create<ComposerState>((set, get) => ({
  ready: false,
  loading: false,
  bootError: null,
  settings: null,
  permissions: {},
  themes: [],
  fonts: [],
  systemFields: [],
  capabilities: null,

  targetType: 'template',
  targetCode: '',
  targetName: '',
  targetDescription: '',
  targetStatus: 'draft',
  breadcrumb: [],
  canEdit: true,
  lockedReason: null,
  recipientCount: 0,
  sender: null,

  draftCode: null,
  revisionNo: 1,
  revisionStatus: 'draft',
  kind: 'visual',
  publishedRevision: null,
  revisions: [],

  doc: createEmptyDocument(),
  htmlSource: '',
  subject: '',
  preheader: '',
  themeCode: null,
  themeOverrides: null,
  mergeDefs: [],
  plainText: '',
  plainTextMode: 'generated',
  plainTextStale: false,

  past: [],
  future: [],

  selectedIds: [],
  primaryId: null,
  primaryKind: 'document',
  editingId: null,
  hoverId: null,
  clipboard: null,

  saveStatus: 'clean',
  saveMessage: null,
  lastSavedAt: null,
  conflict: null,
  savePending: false,

  compiling: false,
  compiled: null,
  lastGoodHtml: '',
  lastGoodAt: null,
  previewStale: false,
  compileError: null,

  recoveryOffer: null,

  // ── bootstrap ──────────────────────────────────────────────────────────────

  boot: async () => {
    if (get().ready) return;
    set({ loading: true, bootError: null });
    try {
      const data = await composerApi.bootstrap();
      usePreferences.getState().hydrateFromServer(data.prefs);
      set({
        ready: true,
        loading: false,
        settings: data.settings,
        permissions: data.permissions as Partial<Record<PermissionKey, boolean>>,
        themes: data.themes,
        fonts: data.fonts?.length ? data.fonts : [],
        systemFields: data.system_fields || [],
        capabilities: data.capabilities,
      });
    } catch (error) {
      set({ loading: false, bootError: describeError(error, 'The composer could not be loaded.') });
    }
  },

  open: async (targetType, targetCode) => {
    set({ loading: true, bootError: null });
    try {
      const target = await composerApi.loadTarget(targetType, targetCode);
      const draft: RevisionContent | null = target.draft;
      const doc = draft?.document ? normalizeDocument(draft.document) : createStarterDocument();
      const defs = (draft?.merge_field_definitions?.length
        ? draft.merge_field_definitions
        : target.merge_field_definitions) as MergeFieldDefinitionDto[];

      set({
        loading: false,
        targetType: target.target_type,
        targetCode: target.target_code,
        targetName: target.name,
        targetDescription: target.description || '',
        targetStatus: target.status,
        breadcrumb: target.breadcrumb || [],
        canEdit: target.can_edit,
        lockedReason: target.locked_reason,
        recipientCount: target.recipient_count || 0,
        sender: target.sender || null,

        draftCode: draft?.public_code || null,
        revisionNo: draft?.revision_no || 1,
        revisionStatus: draft?.status || 'draft',
        kind: draft?.kind || 'visual',
        publishedRevision: target.published,
        revisions: target.revisions || [],

        doc,
        htmlSource: draft?.html_source || '',
        subject: draft?.subject ?? target.subject ?? '',
        preheader: draft?.preheader ?? target.preheader ?? '',
        themeCode: draft?.theme_code ?? target.theme_code ?? null,
        themeOverrides: draft?.theme_overrides ?? null,
        mergeDefs: defs || [],
        plainText: draft?.plain_text || '',
        plainTextMode: draft?.plain_text_mode || 'generated',
        plainTextStale: false,

        past: [],
        future: [],
        selectedIds: [],
        primaryId: null,
        primaryKind: 'document',
        editingId: null,
        saveStatus: 'clean',
        saveMessage: null,
        lastSavedAt: draft?.updated_at ? new Date(draft.updated_at).getTime() : null,
        conflict: null,
        compiled: null,
        lastGoodHtml: draft?.compiled_html || '',
        lastGoodAt: null,
        previewStale: false,
        compileError: null,
      });

      get().requestCompile(true);
    } catch (error) {
      set({ loading: false, bootError: describeError(error, 'This content could not be opened.') });
    }
  },

  teardown: () => {
    if (compileTimer) clearTimeout(compileTimer);
    if (autosaveTimer) clearTimeout(autosaveTimer);
    if (recoveryTimer) clearTimeout(recoveryTimer);
    compileTimer = autosaveTimer = recoveryTimer = null;
    const { targetType, targetCode, saveStatus } = get();
    if (targetCode && saveStatus !== 'dirty') markCleanExit(targetType, targetCode);
  },

  // ── editing ────────────────────────────────────────────────────────────────

  markDirty: () => {
    const state = get();
    if (state.saveStatus !== 'saving' && state.saveStatus !== 'conflict') {
      set({ saveStatus: 'dirty' });
    }
    set({ previewStale: true });
    scheduleAutosave(get, set);
    scheduleRecovery(get);
    get().requestCompile();
  },

  commit: (producer, label) => {
    const state = get();
    if (!state.canEdit) return;
    const nextDoc = producer(state.doc);
    if (nextDoc === state.doc) return;

    // Coalesce rapid edits of the same kind so undo steps stay meaningful.
    const last = state.past[state.past.length - 1];
    const coalesce = !!last && last.label === label && Date.now() - last.at < COALESCE_MS;
    const past = coalesce ? state.past : [...state.past, snapshotOf(state, label)].slice(-HISTORY_LIMIT);

    set({
      doc: nextDoc,
      past,
      future: [],
      plainTextStale: state.plainTextMode === 'manual' ? true : state.plainTextStale,
    });
    get().markDirty();
  },

  setHtmlSource: (value, label = 'Edit HTML') => {
    const state = get();
    if (!state.canEdit || value === state.htmlSource) return;
    const last = state.past[state.past.length - 1];
    const coalesce = !!last && last.label === label && Date.now() - last.at < COALESCE_MS;
    const past = coalesce ? state.past : [...state.past, snapshotOf(state, label)].slice(-HISTORY_LIMIT);
    set({
      htmlSource: value,
      past,
      future: [],
      plainTextStale: state.plainTextMode === 'manual' ? true : state.plainTextStale,
    });
    get().markDirty();
  },

  setSubject: value => {
    const state = get();
    if (value === state.subject) return;
    const last = state.past[state.past.length - 1];
    const coalesce = !!last && last.label === 'Edit subject' && Date.now() - last.at < COALESCE_MS;
    set({
      subject: value,
      past: coalesce ? state.past : [...state.past, snapshotOf(state, 'Edit subject')].slice(-HISTORY_LIMIT),
      future: [],
    });
    get().markDirty();
  },

  setPreheader: value => {
    const state = get();
    if (value === state.preheader) return;
    const last = state.past[state.past.length - 1];
    const coalesce = !!last && last.label === 'Edit preheader' && Date.now() - last.at < COALESCE_MS;
    set({
      preheader: value,
      past: coalesce ? state.past : [...state.past, snapshotOf(state, 'Edit preheader')].slice(-HISTORY_LIMIT),
      future: [],
    });
    get().markDirty();
  },

  setPlainText: value => {
    const state = get();
    if (value === state.plainText) return;
    const last = state.past[state.past.length - 1];
    const coalesce = !!last && last.label === 'Edit plain text' && Date.now() - last.at < COALESCE_MS;
    set({
      plainText: value,
      plainTextMode: 'manual',
      plainTextStale: false,
      past: coalesce ? state.past : [...state.past, snapshotOf(state, 'Edit plain text')].slice(-HISTORY_LIMIT),
      future: [],
    });
    get().markDirty();
  },

  setPlainTextMode: mode => {
    set(state => ({
      plainTextMode: mode,
      past: [...state.past, snapshotOf(state, 'Change plain-text mode')].slice(-HISTORY_LIMIT),
      future: [],
    }));
    get().markDirty();
  },

  regeneratePlainText: () => {
    set(state => ({
      plainText: '',
      plainTextMode: 'generated',
      plainTextStale: false,
      past: [...state.past, snapshotOf(state, 'Regenerate plain text')].slice(-HISTORY_LIMIT),
      future: [],
    }));
    get().markDirty();
    get().requestCompile(true);
  },

  setMergeDefs: defs => {
    set(state => ({
      mergeDefs: defs,
      past: [...state.past, snapshotOf(state, 'Change merge fields')].slice(-HISTORY_LIMIT),
      future: [],
    }));
    get().markDirty();
  },

  setThemeCode: code => {
    set(state => ({
      themeCode: code,
      past: [...state.past, snapshotOf(state, 'Change theme')].slice(-HISTORY_LIMIT),
      future: [],
    }));
    get().markDirty();
    get().requestCompile(true);
  },

  setThemeOverrides: overrides => {
    set(state => ({
      themeOverrides: overrides,
      past: [...state.past, snapshotOf(state, 'Change theme overrides')].slice(-HISTORY_LIMIT),
      future: [],
    }));
    get().markDirty();
  },

  setTargetName: name => {
    if (name === get().targetName) return;
    set({ targetName: name });
    get().markDirty();
  },

  setTargetDescription: description => {
    if (description === get().targetDescription) return;
    set({ targetDescription: description });
    get().markDirty();
  },

  // ── history ────────────────────────────────────────────────────────────────

  undo: () => {
    const state = get();
    const snapshot = state.past[state.past.length - 1];
    if (!snapshot) return;
    set({
      ...restoreSnapshot(snapshot),
      past: state.past.slice(0, -1),
      future: [snapshotOf(state, snapshot.label), ...state.future].slice(0, HISTORY_LIMIT),
    });
    get().markDirty();
  },

  redo: () => {
    const state = get();
    const snapshot = state.future[0];
    if (!snapshot) return;
    set({
      ...restoreSnapshot(snapshot),
      past: [...state.past, snapshotOf(state, snapshot.label)].slice(-HISTORY_LIMIT),
      future: state.future.slice(1),
    });
    get().markDirty();
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
  undoLabel: () => get().past[get().past.length - 1]?.label ?? null,
  redoLabel: () => get().future[0]?.label ?? null,

  // ── selection ──────────────────────────────────────────────────────────────

  select: (id, options = {}) => {
    const state = get();
    if (!id) {
      set({ selectedIds: [], primaryId: null, primaryKind: 'document', editingId: null });
      return;
    }
    if (options.additive) {
      const already = state.selectedIds.includes(id);
      const selectedIds = already ? state.selectedIds.filter(x => x !== id) : [...state.selectedIds, id];
      set({
        selectedIds,
        primaryId: selectedIds[selectedIds.length - 1] || null,
        primaryKind: kindOfId(state.doc, selectedIds[selectedIds.length - 1] || null),
        editingId: null,
      });
      return;
    }
    set({
      selectedIds: [id],
      primaryId: id,
      primaryKind: options.kind || kindOfId(state.doc, id),
      editingId: state.editingId === id ? id : null,
    });
  },

  selectMany: ids => {
    set(state => ({
      selectedIds: ids,
      primaryId: ids[ids.length - 1] || null,
      primaryKind: kindOfId(state.doc, ids[ids.length - 1] || null),
    }));
  },

  setEditing: id => set({ editingId: id }),
  setHover: id => set({ hoverId: id }),

  selectedNode: () => {
    const { doc, primaryId } = get();
    if (!primaryId) return null;
    const found = findNode(doc, primaryId);
    if (!found) return null;
    return { node: found.node as Section | Row | Block, kind: found.location.kind };
  },

  updateSelected: (patch, label) => {
    const id = get().primaryId;
    if (!id) return;
    get().updateNodeById(id, patch, label);
  },

  updateNodeById: (id, patch, label = 'Change properties') => {
    get().commit(doc => updateNode(doc, id, patch), label);
  },

  updateSettings: patch => {
    get().commit(doc => updateDocumentSettings(doc, patch), 'Change email settings');
  },

  // ── structure ──────────────────────────────────────────────────────────────

  addBlock: (block, target) => {
    const state = get();
    const label = `Add ${BLOCK_LABELS[block.type] || 'block'}`;
    const columnId = target?.columnId || resolveDefaultColumn(state.doc, state.primaryId);
    if (!columnId) {
      // No structure yet: create a section that holds the block.
      get().commit(doc => {
        const section = createStarterSectionFor(block);
        return insertSection(doc, section);
      }, label);
      set({ selectedIds: [block.id], primaryId: block.id, primaryKind: 'block' });
      return;
    }
    const index = target?.index ?? insertIndexFor(state.doc, state.primaryId, columnId);
    get().commit(doc => insertBlock(doc, columnId, block, index), label);
    set({ selectedIds: [block.id], primaryId: block.id, primaryKind: 'block', editingId: null });
  },

  addSection: (section, index) => {
    get().commit(doc => insertSection(doc, section, index), 'Add section');
    set({ selectedIds: [section.id], primaryId: section.id, primaryKind: 'section' });
  },

  addRow: (sectionId, row, index) => {
    get().commit(doc => insertRow(doc, sectionId, row, index), 'Add row');
    set({ selectedIds: [row.id], primaryId: row.id, primaryKind: 'row' });
  },

  duplicate: id => {
    const state = get();
    if (state.isLocked(id)) return;
    let createdId: string | null = null;
    get().commit(doc => {
      const result = duplicateNode(doc, id);
      createdId = result.newId;
      return result.doc;
    }, 'Duplicate');
    if (createdId) {
      set({ selectedIds: [createdId], primaryId: createdId, primaryKind: kindOfId(get().doc, createdId) });
    }
  },

  remove: id => {
    const state = get();
    if (state.isLocked(id)) return;
    get().commit(doc => removeNode(doc, id), 'Delete');
    if (state.primaryId === id || state.selectedIds.includes(id)) {
      set({
        selectedIds: state.selectedIds.filter(x => x !== id),
        primaryId: null,
        primaryKind: 'document',
        editingId: null,
      });
    }
  },

  nudge: (id, delta) => {
    if (get().isLocked(id)) return;
    get().commit(doc => nudgeNode(doc, id, delta), delta < 0 ? 'Move up' : 'Move down');
  },

  moveBlockTo: (blockId, columnId, index) => {
    if (get().isLocked(blockId)) return;
    get().commit(doc => moveBlock(doc, blockId, columnId, index), 'Move block');
  },

  moveRowTo: (rowId, sectionId, index) => {
    if (get().isLocked(rowId)) return;
    get().commit(doc => moveRow(doc, rowId, sectionId, index), 'Move row');
  },

  moveSectionTo: (sectionId, index) => {
    if (get().isLocked(sectionId)) return;
    get().commit(doc => moveSection(doc, sectionId, index), 'Move section');
  },

  copy: id => {
    const found = findNode(get().doc, id);
    if (!found || found.location.kind === 'column') return;
    const kind = found.location.kind;
    const label =
      kind === 'block'
        ? BLOCK_LABELS[(found.node as Block).type] || 'Block'
        : kind === 'section'
          ? 'Section'
          : 'Row';
    set({ clipboard: { kind, node: cloneDocument(found.node) as Section | Row | Block, label } });
  },

  paste: target => {
    const state = get();
    const entry = state.clipboard;
    if (!entry) return;
    const copy = copyNodeForInsert(entry.node as Section);
    if (entry.kind === 'section') {
      const index = target?.sectionIndex ?? state.doc.sections.length;
      get().commit(doc => insertSection(doc, copy as unknown as Section, index), 'Paste section');
      return;
    }
    if (entry.kind === 'row') {
      const sectionId =
        state.primaryId && findNode(state.doc, state.primaryId)?.location.sectionId
          ? findNode(state.doc, state.primaryId)!.location.sectionId!
          : state.doc.sections[state.doc.sections.length - 1]?.id;
      if (!sectionId) return;
      get().commit(doc => insertRow(doc, sectionId, copy as unknown as Row), 'Paste row');
      return;
    }
    const columnId = target?.columnId || resolveDefaultColumn(state.doc, state.primaryId);
    if (!columnId) return;
    const index = target?.index ?? insertIndexFor(state.doc, state.primaryId, columnId);
    get().commit(doc => insertBlock(doc, columnId, copy as unknown as Block, index), 'Paste block');
  },

  toggleLocked: id => {
    get().commit(doc => toggleLock(doc, id), 'Change lock');
  },

  setNodeVisibility: (id, surface, visible) => {
    get().commit(
      doc => setVisibility(doc, id, surface, visible),
      visible ? `Show on ${surface}` : `Hide on ${surface}`
    );
  },

  clearFormatting: id => {
    get().commit(doc => resetFormatting(doc, id), 'Reset formatting');
  },

  renameNode: (id, name) => {
    get().commit(doc => updateNode(doc, id, { name: name || null }), 'Rename');
  },

  // ── derived ────────────────────────────────────────────────────────────────

  layers: () => buildLayerTree(get().doc, BLOCK_LABELS),

  themeTokens: () => {
    const { themes, themeCode, themeOverrides } = get();
    return memoizedThemeTokens(themes, themeCode, themeOverrides);
  },

  isLocked: id => isNodeLocked(get().doc, id),

  can: permission => !!get().permissions[permission],

  issues: () => get().compiled?.validation?.issues || [],

  // ── compile ────────────────────────────────────────────────────────────────

  requestCompile: (immediate = false) => {
    if (compileTimer) {
      clearTimeout(compileTimer);
      compileTimer = null;
    }
    const run = async () => {
      const state = get();
      if (!state.targetCode && !state.doc.sections.length && !state.htmlSource) return;
      const requestId = ++compileSeq;
      set({ compiling: true });
      try {
        const response = await composerApi.compile({
          kind: state.kind,
          document: state.kind === 'visual' ? state.doc : null,
          html_source: state.kind === 'custom_html' ? state.htmlSource : null,
          subject: state.subject,
          preheader: state.preheader,
          theme_code: state.themeCode,
          theme_overrides: state.themeOverrides,
          merge_field_definitions: state.mergeDefs,
          plain_text: state.plainTextMode === 'manual' ? state.plainText : null,
          plain_text_mode: state.plainTextMode,
          target_type: state.targetType,
          target_code: state.targetCode || null,
          run_validation: true,
        });
        if (requestId !== compileSeq) return; // a newer request already answered
        const output: CompiledOutput = {
          html: response.compiled_html,
          plainText: response.plain_text,
          validation: response.validation && response.validation.summary ? response.validation : EMPTY_VALIDATION,
          warnings: response.warnings || [],
          removed: response.removed || [],
          autoAppended: response.auto_appended || [],
          sizeBytes: response.size_bytes || 0,
          requestId,
          at: Date.now(),
        };
        set(current => ({
          compiling: false,
          compiled: output,
          lastGoodHtml: response.compiled_html || current.lastGoodHtml,
          lastGoodAt: Date.now(),
          previewStale: false,
          compileError: null,
          // Only adopt generated text when the author has not taken it over.
          plainText: current.plainTextMode === 'manual' ? current.plainText : response.plain_text,
        }));
      } catch (error) {
        if (requestId !== compileSeq) return;
        set({ compiling: false, compileError: describeError(error, 'The preview could not be refreshed.') });
      }
    };
    if (immediate) {
      void run();
      return;
    }
    compileTimer = setTimeout(() => {
      compileTimer = null;
      void run();
    }, COMPILE_DEBOUNCE_MS);
  },

  // ── persistence ────────────────────────────────────────────────────────────

  save: async (options = {}) => {
    const state = get();
    if (!state.targetCode || !state.canEdit) return false;
    if (state.saveStatus === 'saving') {
      set({ savePending: true });
      return false;
    }
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    set({ saveStatus: 'saving', saveMessage: null });
    try {
      const response = await composerApi.saveRevision({
        target_type: state.targetType,
        target_code: state.targetCode,
        base_revision_code: state.draftCode,
        kind: state.kind,
        document: state.kind === 'visual' ? state.doc : null,
        html_source: state.kind === 'custom_html' ? state.htmlSource : null,
        subject: state.subject,
        preheader: state.preheader,
        theme_code: state.themeCode,
        merge_field_definitions: state.mergeDefs,
        plain_text: state.plainTextMode === 'manual' ? state.plainText : null,
        plain_text_mode: state.plainTextMode,
        change_summary: options.summary || null,
        name: state.targetType === 'template' ? state.targetName : null,
        description: state.targetType === 'template' ? state.targetDescription : null,
      });
      saveRetries = 0;
      const revision = response.revision;
      clearRecoveryCopy(state.targetType, state.targetCode);
      set(current => ({
        saveStatus: 'saved',
        saveMessage: null,
        lastSavedAt: Date.now(),
        draftCode: revision.public_code,
        revisionNo: revision.revision_no,
        revisionStatus: revision.status,
        conflict: null,
        compiled: current.compiled
          ? { ...current.compiled, validation: response.validation || current.compiled.validation }
          : current.compiled,
        lastGoodHtml: revision.compiled_html || current.lastGoodHtml,
        revisions: mergeRevision(current.revisions, revision),
      }));
      if (get().savePending) {
        set({ savePending: false });
        return get().save(options);
      }
      return true;
    } catch (error) {
      if (error instanceof ConcurrencyError) {
        set({
          saveStatus: 'conflict',
          conflict: error.detail.latest_revision,
          saveMessage: error.detail.message,
        });
        return false;
      }
      if (error instanceof ValidationBlockedError) {
        set({ saveStatus: 'blocked', saveMessage: error.message });
        return false;
      }
      if (isOfflineError(error)) {
        set({ saveStatus: 'offline', saveMessage: 'Your changes are kept on this device until the server responds.' });
        scheduleSaveRetry(get);
        return false;
      }
      set({ saveStatus: 'failed', saveMessage: describeError(error, 'The draft could not be saved.') });
      scheduleSaveRetry(get);
      return false;
    }
  },

  publish: async (summary, overrideReason) => {
    const state = get();
    if (!state.draftCode) {
      const saved = await get().save({ summary });
      if (!saved) return false;
    }
    const code = get().draftCode;
    if (!code) return false;
    try {
      const response = await composerApi.publishRevision(code, {
        change_summary: summary,
        override_reason: overrideReason,
      });
      const revision = response.revision;
      set(current => ({
        revisionStatus: revision.status,
        publishedRevision: revision,
        revisions: mergeRevision(current.revisions, revision),
        saveStatus: 'saved',
        saveMessage: null,
        lastSavedAt: Date.now(),
        lastGoodHtml: revision.compiled_html || current.lastGoodHtml,
      }));
      return true;
    } catch (error) {
      if (error instanceof ValidationBlockedError) {
        set({ saveMessage: error.message, saveStatus: 'blocked' });
        return false;
      }
      set({ saveMessage: describeError(error, 'This revision could not be published.'), saveStatus: 'failed' });
      return false;
    }
  },

  restore: async revisionCode => {
    try {
      const response = await composerApi.restoreRevision(revisionCode);
      const revision = response.revision;
      set(current => ({
        draftCode: revision.public_code,
        revisionNo: revision.revision_no,
        revisionStatus: revision.status,
        kind: revision.kind,
        doc: revision.document ? normalizeDocument(revision.document) : current.doc,
        htmlSource: revision.html_source || '',
        subject: revision.subject || '',
        preheader: revision.preheader || '',
        themeCode: revision.theme_code,
        mergeDefs: revision.merge_field_definitions || current.mergeDefs,
        plainText: revision.plain_text || '',
        plainTextMode: revision.plain_text_mode,
        past: [],
        future: [],
        saveStatus: 'saved',
        saveMessage: null,
        lastSavedAt: Date.now(),
        revisions: mergeRevision(current.revisions, revision),
      }));
      get().requestCompile(true);
      return true;
    } catch (error) {
      set({ saveMessage: describeError(error, 'That revision could not be restored.') });
      return false;
    }
  },

  forkToHtml: async () => {
    const state = get();
    if (!state.draftCode) {
      const saved = await get().save({ summary: 'Saved before switching to custom HTML' });
      if (!saved) return false;
    }
    const code = get().draftCode;
    if (!code) return false;
    try {
      const response = await composerApi.forkToCustomHtml(code, 'Switched to custom HTML');
      const revision = response.revision;
      set(current => ({
        draftCode: revision.public_code,
        revisionNo: revision.revision_no,
        revisionStatus: revision.status,
        kind: 'custom_html',
        htmlSource: revision.html_source || '',
        plainText: revision.plain_text || '',
        plainTextMode: revision.plain_text_mode,
        past: [],
        future: [],
        saveStatus: 'saved',
        lastSavedAt: Date.now(),
        revisions: mergeRevision(current.revisions, revision),
      }));
      usePreferences.getState().set('mode', 'html');
      get().requestCompile(true);
      return true;
    } catch (error) {
      set({ saveMessage: describeError(error, 'Custom HTML could not be enabled.') });
      return false;
    }
  },

  reloadFromServer: async () => {
    const { targetType, targetCode } = get();
    if (!targetCode) return;
    clearRecoveryCopy(targetType, targetCode);
    set({ conflict: null, saveStatus: 'clean' });
    await get().open(targetType, targetCode);
  },

  applyRecovery: copy => {
    set(current => ({
      kind: copy.kind,
      doc: copy.document ? normalizeDocument(copy.document) : current.doc,
      htmlSource: copy.htmlSource || '',
      subject: copy.subject,
      preheader: copy.preheader,
      plainText: copy.plainText || '',
      plainTextMode: copy.plainTextMode,
      themeCode: copy.themeCode,
      mergeDefs: copy.mergeFieldDefinitions?.length ? copy.mergeFieldDefinitions : current.mergeDefs,
      recoveryOffer: null,
      saveStatus: 'dirty',
      past: [],
      future: [],
    }));
    get().requestCompile(true);
  },

  dismissRecovery: () => {
    const { targetType, targetCode } = get();
    clearRecoveryCopy(targetType, targetCode);
    set({ recoveryOffer: null });
  },
}));

// ── helpers used by the store ─────────────────────────────────────────────────

function mergeRevision(revisions: RevisionSummary[], revision: RevisionSummary): RevisionSummary[] {
  const index = revisions.findIndex(entry => entry.public_code === revision.public_code);
  if (index < 0) return [revision, ...revisions];
  const next = [...revisions];
  next[index] = { ...next[index], ...revision };
  return next;
}

/** Which column a new block should land in, given the current selection. */
function resolveDefaultColumn(doc: EmailDocument, primaryId: string | null): string | null {
  if (primaryId) {
    const found = findNode(doc, primaryId);
    if (found) {
      if (found.location.kind === 'column') return found.location.id;
      if (found.location.columnId) return found.location.columnId;
      if (found.location.kind === 'row') return (found.node as Row).columns[0]?.id ?? null;
      if (found.location.kind === 'section') {
        return (found.node as Section).rows[0]?.columns[0]?.id ?? null;
      }
    }
  }
  for (let index = doc.sections.length - 1; index >= 0; index -= 1) {
    const section = doc.sections[index];
    const row = section.rows[section.rows.length - 1];
    const column = row?.columns[row.columns.length - 1];
    if (column) return column.id;
  }
  return null;
}

/** Insert just after the selected block, otherwise at the end of the column. */
function insertIndexFor(doc: EmailDocument, primaryId: string | null, columnId: string): number {
  if (primaryId) {
    const found = findNode(doc, primaryId);
    if (found && found.location.kind === 'block' && found.location.columnId === columnId) {
      return found.location.index + 1;
    }
  }
  const found = findNode(doc, columnId);
  if (found && found.location.kind === 'column') {
    return (found.node as Row['columns'][number]).blocks.length;
  }
  return -1;
}

function createStarterSectionFor(block: Block): Section {
  return createSection([createRow([createColumn(100, [block])])]);
}

function scheduleAutosave(get: () => ComposerState, _set: unknown): void {
  const state = get();
  if (!state.canEdit || !state.targetCode) return;
  const idle = Number(state.settings?.autosave_idle_ms ?? 2500);
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    const current = get();
    if (current.saveStatus === 'dirty' || current.saveStatus === 'offline' || current.saveStatus === 'failed') {
      void current.save({ silent: true });
    }
  }, Math.max(800, idle));
}

function scheduleSaveRetry(get: () => ComposerState): void {
  saveRetries = Math.min(saveRetries + 1, 5);
  const delay = Math.min(30000, 2000 * 2 ** (saveRetries - 1));
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    const state = get();
    if (state.saveStatus === 'offline' || state.saveStatus === 'failed') void state.save({ silent: true });
  }, delay);
}

function scheduleRecovery(get: () => ComposerState): void {
  if (recoveryTimer) clearTimeout(recoveryTimer);
  recoveryTimer = setTimeout(() => {
    recoveryTimer = null;
    const state = get();
    if (!state.targetCode) return;
    writeRecoveryCopy({
      targetType: state.targetType,
      targetCode: state.targetCode,
      baseRevisionCode: state.draftCode,
      kind: state.kind,
      document: state.kind === 'visual' ? state.doc : null,
      htmlSource: state.kind === 'custom_html' ? state.htmlSource : null,
      subject: state.subject,
      preheader: state.preheader,
      plainText: state.plainText,
      plainTextMode: state.plainTextMode,
      themeCode: state.themeCode,
      mergeFieldDefinitions: state.mergeDefs,
      selectionId: state.primaryId,
    });
  }, 1500);
}

// ── convenience selectors ─────────────────────────────────────────────────────

export function saveStatusLabel(status: SaveStatus, lastSavedAt: number | null): string {
  switch (status) {
    case 'saving':
      return 'Saving…';
    case 'saved':
      return lastSavedAt ? `Saved ${relativeTime(lastSavedAt)}` : 'Saved';
    case 'dirty':
      return 'Unsaved changes';
    case 'failed':
      return 'Save failed';
    case 'offline':
      return 'Offline changes';
    case 'conflict':
      return 'Conflict detected';
    case 'blocked':
      return 'Blocked by validation';
    default:
      return lastSavedAt ? `Saved ${relativeTime(lastSavedAt)}` : 'No changes yet';
  }
}

export function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}
