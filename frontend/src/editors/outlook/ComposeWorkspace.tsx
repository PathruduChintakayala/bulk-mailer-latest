import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  Columns2, Rows2, PanelLeft, PanelRight, Eye, PenLine,
} from 'lucide-react';
import type { SenderIdentity, MergeFieldDefinition } from '../../types';
import MessageHeader from './MessageHeader';

export type ComposeOrientation = 'horizontal' | 'vertical';
export type ComposeFocus = 'both' | 'compose' | 'preview';

interface ComposeWorkspaceProps {
  editorContext: 'campaign' | 'template';

  // Message header props
  senderIdentity?: SenderIdentity | null;
  onChangeSender?: () => void;
  totalRecipients?: number;
  suppressedCount?: number;
  onViewRecipients?: () => void;
  subject: string;
  onSubjectChange: (value: string) => void;
  preheader: string;
  onPreheaderChange: (value: string) => void;
  mergeFields?: MergeFieldDefinition[];
  onInsertMergeField?: (key: string) => void;
  attachments?: { filename: string; size: number; id: number }[];
  onRemoveAttachment?: (id: number) => void;

  // Children slots
  ribbon: ReactNode;
  canvas: ReactNode;
  sidePanel?: ReactNode;
}

const STORAGE_KEY = 'compose-layout-mode';
const SIZE_KEY = 'compose-layout-size';

interface LayoutPrefs {
  orientation: ComposeOrientation;
  focus: ComposeFocus;
}

function loadPrefs(): LayoutPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        orientation: parsed.orientation === 'vertical' ? 'vertical' : 'horizontal',
        focus: ['both', 'compose', 'preview'].includes(parsed.focus) ? parsed.focus : 'both',
      };
    }
  } catch { /* */ }
  return { orientation: 'horizontal', focus: 'both' };
}

/**
 * Tracks the md breakpoint in JS rather than CSS so the canvas and preview are
 * mounted exactly once — TipTap moves its DOM node to the last EditorContent
 * that mounts, so a duplicated (even hidden) canvas blanks the visible one.
 */
function useIsCompact(): boolean {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = (e: MediaQueryListEvent) => setCompact(e.matches);
    mq.addEventListener('change', onChange);
    setCompact(mq.matches);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return compact;
}

function loadSize(orientation: ComposeOrientation): number {
  try {
    const raw = localStorage.getItem(SIZE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const v = Number(parsed[orientation]);
      if (Number.isFinite(v) && v > 0) return v;
    }
  } catch { /* */ }
  return orientation === 'horizontal' ? 62 : 58;
}

/**
 * Full-width compose workspace with message header, ribbon, canvas + resizable preview.
 * Used by both campaign and template editor contexts.
 */
export default function ComposeWorkspace({
  editorContext,
  senderIdentity,
  onChangeSender,
  totalRecipients,
  suppressedCount,
  onViewRecipients,
  subject,
  onSubjectChange,
  preheader,
  onPreheaderChange,
  mergeFields = [],
  onInsertMergeField,
  attachments,
  onRemoveAttachment,
  ribbon,
  canvas,
  sidePanel,
}: ComposeWorkspaceProps) {
  const [prefs, setPrefs] = useState<LayoutPrefs>(loadPrefs);
  const [splitPct, setSplitPct] = useState(() => loadSize(loadPrefs().orientation));
  const [mobileTab, setMobileTab] = useState<'compose' | 'preview'>('compose');
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const isCompact = useIsCompact();

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* */ }
  }, [prefs]);

  useEffect(() => {
    try {
      const prev = JSON.parse(localStorage.getItem(SIZE_KEY) || '{}');
      localStorage.setItem(SIZE_KEY, JSON.stringify({ ...prev, [prefs.orientation]: splitPct }));
    } catch { /* */ }
  }, [splitPct, prefs.orientation]);

  const setOrientation = (orientation: ComposeOrientation) => {
    setPrefs(p => ({ ...p, orientation, focus: p.focus === 'both' ? 'both' : p.focus }));
    setSplitPct(loadSize(orientation));
  };

  const setFocus = (focus: ComposeFocus) => {
    setPrefs(p => ({ ...p, focus }));
  };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (prefs.orientation === 'horizontal') {
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.min(78, Math.max(28, pct)));
    } else {
      const pct = ((e.clientY - rect.top) / rect.height) * 100;
      setSplitPct(Math.min(78, Math.max(28, pct)));
    }
  }, [prefs.orientation]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const showPreview = !!sidePanel && prefs.focus !== 'compose' && !isCompact;
  const showCompose = prefs.focus !== 'preview';
  const showBoth = showPreview && showCompose;
  const isHorizontal = prefs.orientation === 'horizontal';

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
      <MessageHeader
        editorContext={editorContext}
        senderIdentity={senderIdentity}
        onChangeSender={onChangeSender}
        totalRecipients={totalRecipients}
        suppressedCount={suppressedCount}
        onViewRecipients={onViewRecipients}
        subject={subject}
        onSubjectChange={onSubjectChange}
        mergeFields={mergeFields}
        onInsertMergeField={onInsertMergeField}
        preheader={preheader}
        onPreheaderChange={onPreheaderChange}
        attachments={attachments}
        onRemoveAttachment={onRemoveAttachment}
      />

      {ribbon}

      {/* Layout chrome */}
      {sidePanel && !isCompact && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-100 bg-gray-50/80 flex-shrink-0">
          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mr-1 hidden sm:inline">Layout</span>
          <LayoutBtn
            active={prefs.orientation === 'horizontal' && prefs.focus === 'both'}
            title="Compose left, preview right"
            onClick={() => { setOrientation('horizontal'); setFocus('both'); }}
          >
            <Columns2 size={14} />
          </LayoutBtn>
          <LayoutBtn
            active={prefs.orientation === 'vertical' && prefs.focus === 'both'}
            title="Compose above, preview below"
            onClick={() => { setOrientation('vertical'); setFocus('both'); }}
          >
            <Rows2 size={14} />
          </LayoutBtn>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <LayoutBtn
            active={prefs.focus === 'compose'}
            title="Compose only"
            onClick={() => setFocus('compose')}
          >
            <PenLine size={14} />
          </LayoutBtn>
          <LayoutBtn
            active={prefs.focus === 'preview'}
            title="Preview only"
            onClick={() => setFocus('preview')}
          >
            <Eye size={14} />
          </LayoutBtn>
          {prefs.focus === 'both' && (
            <>
              <div className="w-px h-4 bg-gray-200 mx-1" />
              <LayoutBtn
                active={false}
                title={isHorizontal ? 'Widen compose' : 'Taller compose'}
                onClick={() => setSplitPct(p => Math.min(78, p + 5))}
              >
                <PanelLeft size={14} />
              </LayoutBtn>
              <LayoutBtn
                active={false}
                title={isHorizontal ? 'Widen preview' : 'Taller preview'}
                onClick={() => setSplitPct(p => Math.max(28, p - 5))}
              >
                <PanelRight size={14} />
              </LayoutBtn>
            </>
          )}
        </div>
      )}

      {/* Mobile Compose / Preview tabs */}
      {sidePanel && isCompact && (
        <div role="tablist" aria-label="Compose or preview" className="flex border-b border-gray-200 flex-shrink-0">
          {(['compose', 'preview'] as const).map(t => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={mobileTab === t}
              onClick={() => setMobileTab(t)}
              className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer capitalize ${
                mobileTab === t
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Main split area — on compact widths the tabs pick a single pane */}
      <div
        ref={containerRef}
        className={`flex-1 min-h-0 overflow-hidden flex ${
          showBoth && isHorizontal ? 'flex-row' : 'flex-col'
        }`}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {(isCompact ? !sidePanel || mobileTab === 'compose' : showCompose) && (
          <div
            className="min-w-0 min-h-0 flex flex-col overflow-hidden"
            style={
              showBoth
                ? isHorizontal
                  ? { width: `${splitPct}%`, minWidth: 280 }
                  : { height: `${splitPct}%`, minHeight: 200 }
                : { flex: 1 }
            }
          >
            {canvas}
          </div>
        )}

        {showBoth && (
          <div
            role="separator"
            aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
            aria-label="Resize compose and preview"
            onPointerDown={onPointerDown}
            className={`flex-shrink-0 bg-gray-100 hover:bg-brand-200 active:bg-brand-300 transition-colors relative z-10 ${
              isHorizontal ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize'
            }`}
          />
        )}

        {(isCompact ? !!sidePanel && mobileTab === 'preview' : showPreview) && (
          <div
            className="min-w-0 min-h-0 flex flex-col overflow-hidden border-gray-200 bg-white"
            style={
              showBoth
                ? isHorizontal
                  ? { width: `${100 - splitPct}%`, minWidth: 240, borderLeftWidth: 1 }
                  : { height: `${100 - splitPct}%`, minHeight: 180, borderTopWidth: 1 }
                : { flex: 1 }
            }
          >
            {sidePanel}
          </div>
        )}
      </div>
    </div>
  );
}

function LayoutBtn({
  active, title, onClick, children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={`p-1.5 rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
        active
          ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}
