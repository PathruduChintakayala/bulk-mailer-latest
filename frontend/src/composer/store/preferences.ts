/**
 * Editor preferences (spec 25).
 *
 * Written to localStorage immediately so a reload feels instant, and pushed to
 * the server on a debounce so preferences follow the user between machines.
 */

import { create } from 'zustand';
import * as composerApi from '../api/composerApi';

export type EditorMode = 'visual' | 'html';

/** The six compose/preview arrangements from spec 2.3. */
export type LayoutId =
  | 'compose-only'
  | 'preview-only'
  | 'compose-left'
  | 'compose-right'
  | 'compose-above'
  | 'compose-below';

export const LAYOUTS: { id: LayoutId; label: string; description: string; orientation: 'single' | 'horizontal' | 'vertical' }[] = [
  { id: 'compose-only', label: 'Compose only', description: 'Hide the preview and use the full width to edit.', orientation: 'single' },
  { id: 'preview-only', label: 'Preview only', description: 'Hide the editor and review the rendered email.', orientation: 'single' },
  { id: 'compose-left', label: 'Compose left, preview right', description: 'Edit on the left with a live preview beside it.', orientation: 'horizontal' },
  { id: 'compose-right', label: 'Preview left, compose right', description: 'Preview on the left with the editor beside it.', orientation: 'horizontal' },
  { id: 'compose-above', label: 'Compose above, preview below', description: 'Stack the editor over the preview.', orientation: 'vertical' },
  { id: 'compose-below', label: 'Preview above, compose below', description: 'Stack the preview over the editor.', orientation: 'vertical' },
];

export type PreviewDevice = 'desktop' | 'tablet' | 'mobile' | 'custom';
export type PreviewContent = 'html' | 'plain';
export type LeftPanelView = 'blocks' | 'layers';
export type CodeTab = 'source' | 'compiled' | 'plain';

export interface EditorPreferences {
  mode: EditorMode;
  layout: LayoutId;
  /** Fraction of the workspace given to the compose pane, 0.2–0.8. */
  splitRatio: number;
  leftPanelOpen: boolean;
  leftPanelWidth: number;
  leftPanelView: LeftPanelView;
  rightPanelOpen: boolean;
  rightPanelWidth: number;
  fullScreen: boolean;

  previewDevice: PreviewDevice;
  previewCustomWidth: number;
  previewZoom: number;
  previewFit: boolean;
  previewImagesEnabled: boolean;
  previewDarkSimulation: boolean;
  previewContent: PreviewContent;
  previewShowEmailHeader: boolean;
  previewAutoRefresh: boolean;

  codeTheme: 'light' | 'dark';
  codeFontSize: number;
  codeTabSize: number;
  codeWordWrap: boolean;
  codeMinimap: boolean;
  codeTab: CodeTab;
  problemsPanelOpen: boolean;
  problemsPanelHeight: number;

  showGuides: boolean;
  showBoundaries: boolean;
  reducedMotion: boolean;
}

export const DEFAULT_PREFERENCES: EditorPreferences = {
  mode: 'visual',
  layout: 'compose-left',
  splitRatio: 0.58,
  leftPanelOpen: true,
  leftPanelWidth: 264,
  leftPanelView: 'blocks',
  rightPanelOpen: true,
  rightPanelWidth: 320,
  fullScreen: false,

  previewDevice: 'desktop',
  previewCustomWidth: 700,
  previewZoom: 1,
  previewFit: true,
  previewImagesEnabled: true,
  previewDarkSimulation: false,
  previewContent: 'html',
  previewShowEmailHeader: true,
  previewAutoRefresh: true,

  codeTheme: 'light',
  codeFontSize: 13,
  codeTabSize: 2,
  codeWordWrap: true,
  codeMinimap: true,
  codeTab: 'source',
  problemsPanelOpen: true,
  problemsPanelHeight: 200,

  showGuides: true,
  showBoundaries: true,
  reducedMotion: false,
};

const STORAGE_KEY = 'composer2:preferences';

export const PANEL_MIN = { left: 200, right: 260, problems: 120 };
export const PANEL_MAX = { left: 420, right: 480, problems: 480 };
export const SPLIT_MIN = 0.22;
export const SPLIT_MAX = 0.82;

function readLocal(): Partial<EditorPreferences> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<EditorPreferences>) : {};
  } catch {
    return {};
  }
}

function writeLocal(prefs: EditorPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* private browsing or a full quota must not break editing */
  }
}

function coerce(input: Record<string, unknown> | null | undefined): Partial<EditorPreferences> {
  if (!input) return {};
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_PREFERENCES) as (keyof EditorPreferences)[]) {
    const value = input[key];
    if (value === undefined || value === null) continue;
    if (typeof DEFAULT_PREFERENCES[key] === typeof value) out[key] = value;
  }
  return out as Partial<EditorPreferences>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface PreferencesState {
  prefs: EditorPreferences;
  hydrated: boolean;
  set: <K extends keyof EditorPreferences>(key: K, value: EditorPreferences[K]) => void;
  patch: (patch: Partial<EditorPreferences>) => void;
  hydrateFromServer: (serverPrefs: Record<string, unknown> | null | undefined) => void;
  reset: () => void;
  /** Push pending changes immediately; used before navigating away. */
  flush: () => Promise<void>;
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pending: Partial<EditorPreferences> = {};

function scheduleSync(patch: Partial<EditorPreferences>): void {
  pending = { ...pending, ...patch };
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const payload = pending;
    pending = {};
    syncTimer = null;
    if (!Object.keys(payload).length) return;
    composerApi.savePreferences(payload as Record<string, unknown>).catch(() => {
      /* preferences are convenience state; localStorage already has them */
    });
  }, 1200);
}

/** Values that only make sense for the current session are not persisted upward. */
const SESSION_ONLY: (keyof EditorPreferences)[] = ['fullScreen'];

function persistable(patch: Partial<EditorPreferences>): Partial<EditorPreferences> {
  const out = { ...patch };
  SESSION_ONLY.forEach(key => delete out[key]);
  return out;
}

function normalize(prefs: EditorPreferences): EditorPreferences {
  return {
    ...prefs,
    splitRatio: clamp(prefs.splitRatio, SPLIT_MIN, SPLIT_MAX),
    leftPanelWidth: clamp(prefs.leftPanelWidth, PANEL_MIN.left, PANEL_MAX.left),
    rightPanelWidth: clamp(prefs.rightPanelWidth, PANEL_MIN.right, PANEL_MAX.right),
    problemsPanelHeight: clamp(prefs.problemsPanelHeight, PANEL_MIN.problems, PANEL_MAX.problems),
    previewZoom: clamp(prefs.previewZoom, 0.25, 2),
    previewCustomWidth: clamp(prefs.previewCustomWidth, 280, 1400),
    codeFontSize: clamp(prefs.codeFontSize, 10, 24),
  };
}

export const usePreferences = create<PreferencesState>((set, get) => ({
  prefs: normalize({
    ...DEFAULT_PREFERENCES,
    ...coerce(readLocal() as Record<string, unknown>),
    fullScreen: false,
    reducedMotion:
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false,
  }),
  hydrated: false,

  set: (key, value) => get().patch({ [key]: value } as Partial<EditorPreferences>),

  patch: patch => {
    const next = normalize({ ...get().prefs, ...patch });
    set({ prefs: next });
    writeLocal(next);
    const upward = persistable(patch);
    if (Object.keys(upward).length) scheduleSync(upward);
  },

  hydrateFromServer: serverPrefs => {
    // Local wins for the current session; the server fills anything untouched here.
    const local = coerce(readLocal() as Record<string, unknown>);
    const remote = coerce(serverPrefs);
    const next = normalize({
      ...DEFAULT_PREFERENCES,
      ...remote,
      ...local,
      fullScreen: false,
      reducedMotion: get().prefs.reducedMotion,
    });
    set({ prefs: next, hydrated: true });
    writeLocal(next);
  },

  reset: () => {
    const next = normalize({ ...DEFAULT_PREFERENCES, reducedMotion: get().prefs.reducedMotion });
    set({ prefs: next });
    writeLocal(next);
    scheduleSync(persistable(next));
  },

  flush: async () => {
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    const payload = pending;
    pending = {};
    if (!Object.keys(payload).length) return;
    try {
      await composerApi.savePreferences(payload as Record<string, unknown>);
    } catch {
      /* ignore */
    }
  },
}));

/** Subscribe to a single preference without re-rendering on unrelated changes. */
export function usePref<K extends keyof EditorPreferences>(key: K): EditorPreferences[K] {
  return usePreferences(state => state.prefs[key]);
}

export function setPref<K extends keyof EditorPreferences>(key: K, value: EditorPreferences[K]): void {
  usePreferences.getState().set(key, value);
}

export function layoutOrientation(layout: LayoutId): 'single' | 'horizontal' | 'vertical' {
  return LAYOUTS.find(entry => entry.id === layout)?.orientation ?? 'horizontal';
}

export function layoutShowsCompose(layout: LayoutId): boolean {
  return layout !== 'preview-only';
}

export function layoutShowsPreview(layout: LayoutId): boolean {
  return layout !== 'compose-only';
}

/** True when the compose pane comes first in document order for this layout. */
export function composeFirst(layout: LayoutId): boolean {
  return layout === 'compose-left' || layout === 'compose-above' || layout === 'compose-only';
}

export const PREVIEW_DEVICE_WIDTHS: Record<Exclude<PreviewDevice, 'custom'>, number> = {
  desktop: 700,
  tablet: 600,
  mobile: 375,
};

export function previewWidthFor(prefs: EditorPreferences): number {
  if (prefs.previewDevice === 'custom') return prefs.previewCustomWidth;
  return PREVIEW_DEVICE_WIDTHS[prefs.previewDevice];
}
