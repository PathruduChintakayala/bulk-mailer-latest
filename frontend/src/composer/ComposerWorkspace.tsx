/**
 * Composer workspace (spec 2, 27).
 *
 * Owns the full-width layout, the six compose/preview arrangements, every dialog, the
 * command menu and the keyboard map. All editing state lives in the store; this file is
 * purely composition and wiring.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  AlignLeft,
  Code2,
  Eye,
  History,
  Image as ImageIcon,
  LayoutTemplate,
  Link2,
  Maximize2,
  Palette,
  Paperclip,
  Redo2,
  Replace,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Table2,
  Undo2,
  Users,
} from 'lucide-react';
import * as composerApi from './api/composerApi';
import type { ReusableBlockRecord, TargetType } from './api/types';
import { findNode } from './model/mutations';
import type { ValidationIssue } from './model/issues';
import { useComposer } from './store/composerStore';
import {
  LAYOUTS,
  composeFirst,
  layoutOrientation,
  layoutShowsCompose,
  layoutShowsPreview,
  setPref,
  usePref,
  usePreferences,
} from './store/preferences';
import { ComposerHeader } from './shell/ComposerHeader';
import { SplitPane } from './shell/SplitPane';
import { LeftPanel } from './panels/LeftPanel';
import { RightPanel } from './panels/RightPanel';
import type { InspectorActions, PickedAsset } from './panels/inspectorParts';
import { usePalette } from './panels/inspectorParts';
import { Canvas } from './visual/Canvas';
import { ComposerDndProvider } from './visual/dnd';
import { RichTextToolbar } from './visual/RichTextToolbar';
import { useActiveEditor } from './visual/activeEditor';
import { PreviewPane } from './preview/PreviewPane';
import { HtmlMode } from './code/HtmlMode';
import { LiveRegion, Spinner } from './ui/primitives';
import { AssetLibrary, type AssetPickerRequest } from './dialogs/AssetLibrary';
import { AttachmentsDialog } from './dialogs/AttachmentsDialog';
import { CommandPalette, type PaletteCommand } from './dialogs/CommandPalette';
import { FindReplaceDialog } from './dialogs/FindReplaceDialog';
import { ImageCropper } from './dialogs/ImageCropper';
import { LinkDialog } from './dialogs/LinkDialog';
import { MergeFieldPicker, type MergePickerRequest } from './dialogs/MergeFieldPicker';
import { MergeFieldsDialog } from './dialogs/MergeFieldsDialog';
import { RawHtmlDialog } from './dialogs/RawHtmlDialog';
import { ConflictDialog, RecoveryDialog } from './dialogs/RecoveryDialogs';
import { ReusableLibraryDialog, SaveReusableDialog, type SaveReusableRequest } from './dialogs/ReusableDialogs';
import { ReviewDashboard } from './dialogs/ReviewDashboard';
import { RevisionHistory } from './dialogs/RevisionHistory';
import { SaveAsTemplateDialog } from './dialogs/SaveAsTemplateDialog';
import { TableEditor } from './dialogs/TableEditor';
import { TestSendDialog } from './dialogs/TestSendDialog';
import { ThemeEditor } from './dialogs/ThemeEditor';

import type { LinkDialogRequest } from './dialogs/LinkDialog';

export function ComposerWorkspace({ targetType, targetCode }: { targetType: TargetType; targetCode: string }) {
  const navigate = useNavigate();
  const store = useComposer();
  const {
    ready,
    loading,
    bootError,
    boot,
    open,
    teardown,
    saveStatus,
    saveMessage,
    canEdit,
    kind,
    doc,
  } = store;

  const mode = usePref('mode');
  const layout = usePref('layout');
  const splitRatio = usePref('splitRatio');
  const fullScreen = usePref('fullScreen');
  const { patch: patchPrefs } = usePreferences();

  const tokens = store.themeTokens();
  const palette = usePalette(tokens);
  const activeEditor = useActiveEditor(state => state.editor);

  // ── dialog state ────────────────────────────────────────────────────────────
  const [assetRequest, setAssetRequest] = useState<AssetPickerRequest | null>(null);
  const [mergeRequest, setMergeRequest] = useState<MergePickerRequest | null>(null);
  const [linkRequest, setLinkRequest] = useState<LinkDialogRequest | null>(null);
  const [cropBlockId, setCropBlockId] = useState<string | null>(null);
  const [tableBlockId, setTableBlockId] = useState<string | null>(null);
  const [rawBlockId, setRawBlockId] = useState<string | null>(null);
  const [saveReusable, setSaveReusable] = useState<SaveReusableRequest | null>(null);
  const [reusableLibraryOpen, setReusableLibraryOpen] = useState(false);
  const [reusablePick, setReusablePick] = useState<((code: string, label: string) => void) | null>(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const [testSendOpen, setTestSendOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mergeFieldsOpen, setMergeFieldsOpen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);

  const [reusables, setReusables] = useState<ReusableBlockRecord[]>([]);
  const [reusablesLoading, setReusablesLoading] = useState(false);
  const announceRef = useRef<string | null>(null);

  // ── lifecycle ───────────────────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      await boot();
      await open(targetType, targetCode);
    })();
    return () => teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetCode, targetType]);

  const loadReusables = useCallback(async () => {
    setReusablesLoading(true);
    try {
      setReusables(await composerApi.listReusableBlocks({}));
    } catch {
      setReusables([]);
    } finally {
      setReusablesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready) void loadReusables();
  }, [loadReusables, ready]);

  // Warn before leaving with unsaved work.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (saveStatus === 'dirty' || saveStatus === 'saving' || saveStatus === 'failed') {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveStatus]);

  const leave = useCallback(() => {
    if (saveStatus === 'dirty' || saveStatus === 'failed') {
      const choice = window.confirm('You have unsaved changes. Save before leaving?\n\nOK saves, Cancel discards.');
      if (choice) {
        void store.save().then(ok => {
          if (ok) navigate(-1);
        });
        return;
      }
    }
    navigate(-1);
  }, [navigate, saveStatus, store]);

  // ── inspector actions ───────────────────────────────────────────────────────
  const actions: InspectorActions = useMemo(
    () => ({
      pickAsset: (onPick: (asset: PickedAsset) => void, purpose?: string) => setAssetRequest({ onPick, purpose }),
      editLink: (link, onApply) => setLinkRequest({ link, onApply: next => onApply(next) }),
      pickMergeField: onPick => setMergeRequest({ context: 'body', onPick: key => onPick(key) }),
      cropImage: setCropBlockId,
      editTable: setTableBlockId,
      editRawHtml: setRawBlockId,
      saveReusable: (nodeId, nodeKind) => setSaveReusable({ nodeId, kind: nodeKind }),
      pickReusable: onPick => {
        setReusablePick(() => onPick);
        setReusableLibraryOpen(true);
      },
      openThemeEditor: () => setThemeOpen(true),
    }),
    []
  );

  /** Inserts a protected merge chip at the caret of the active rich-text block. */
  const insertMergeChip = useCallback(
    (key: string, options: { fallback?: string | null; format?: string | null }) => {
      const editor = useActiveEditor.getState().editor;
      if (!editor) {
        toast.error('Place the cursor in a text block first.');
        return;
      }
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'mergeField',
          attrs: { field: key, fallback: options.fallback ?? null, format: options.format ?? null },
        })
        .run();
    },
    []
  );

  /** Opens the link dialog for the current inline selection. */
  const openInlineLink = useCallback(() => {
    const editor = useActiveEditor.getState().editor;
    if (!editor) return;
    const attrs = editor.getAttributes('link') as { href?: string; target?: string; title?: string };
    const { from, to } = editor.state.selection;
    setLinkRequest({
      link: attrs.href
        ? {
            type: 'url',
            value: attrs.href,
            title: attrs.title ?? null,
            target: attrs.target === '_self' ? '_self' : '_blank',
            trackingEnabled: true,
          }
        : null,
      displayText: editor.state.doc.textBetween(from, to, ' '),
      onApply: (link, displayText) => {
        const chain = editor.chain().focus();
        if (!link) {
          chain.unsetLink().run();
          return;
        }
        if (displayText && displayText !== editor.state.doc.textBetween(from, to, ' ')) {
          chain.insertContentAt({ from, to }, displayText).setTextSelection({ from, to: from + displayText.length });
        }
        chain.setLink({ href: link.value, target: link.target ?? '_blank' }).run();
      },
    });
  }, []);

  const insertReusable = useCallback(
    async (code: string) => {
      try {
        const detail = await composerApi.getReusableBlock(code);
        const fragment = detail.fragment as Record<string, unknown>;
        if (detail.fragment_kind === 'section') {
          store.addSection(fragment as never);
        } else {
          const blocks = (fragment.blocks as unknown[]) || [];
          blocks.forEach(block => store.addBlock(block as never));
        }
        void composerApi.markReusableBlockUsed(code);
        toast.success(`Inserted “${detail.name}”.`);
      } catch (error) {
        toast.error(composerApi.describeError(error, 'That saved block could not be inserted.'));
      }
    },
    [store]
  );

  const navigateToIssue = useCallback(
    (issue: ValidationIssue) => {
      if (issue.nodeId && findNode(doc, issue.nodeId)) {
        setPref('mode', 'visual');
        store.select(issue.nodeId);
        announceRef.current = `Selected the element for ${issue.code}`;
        return;
      }
      if (issue.line) setPref('mode', 'html');
    },
    [doc, store]
  );

  // ── keyboard map ────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey;
      const target = event.target as HTMLElement | null;
      const typing =
        !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void store.save();
        return;
      }
      if (meta && event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        store.redo();
        return;
      }
      if (meta && event.key.toLowerCase() === 'z' && !typing) {
        event.preventDefault();
        store.undo();
        return;
      }
      if (meta && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        store.redo();
        return;
      }
      if (meta && event.key.toLowerCase() === 'h' && mode === 'visual') {
        event.preventDefault();
        setFindOpen(true);
        return;
      }
      if (meta && event.key === '/') {
        event.preventDefault();
        setPref('mode', mode === 'visual' ? 'html' : 'visual');
        return;
      }
      if (event.key === 'F11' || (meta && event.shiftKey && event.key.toLowerCase() === 'f')) {
        event.preventDefault();
        setPref('fullScreen', !fullScreen);
        return;
      }
      if (meta && event.key.toLowerCase() === 'p' && event.shiftKey) {
        event.preventDefault();
        setPref('layout', layoutShowsPreview(layout) ? 'compose-only' : 'compose-left');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullScreen, layout, mode, store]);

  // Full screen covers everything behind the editor, so the page must not scroll.
  useEffect(() => {
    if (!fullScreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [fullScreen]);

  const commands: PaletteCommand[] = useMemo(
    () => [
      { id: 'save', group: 'File', label: 'Save', shortcut: 'Ctrl+S', icon: <Save size={13} />, run: () => void store.save() },
      {
        id: 'save-close',
        group: 'File',
        label: 'Save and close',
        icon: <Save size={13} />,
        run: () => void store.save().then(ok => ok && leave()),
      },
      { id: 'save-as', group: 'File', label: 'Save as a new template', icon: <LayoutTemplate size={13} />, run: () => setSaveAsOpen(true) },
      { id: 'history', group: 'File', label: 'Version history', icon: <History size={13} />, run: () => setHistoryOpen(true) },
      { id: 'undo', group: 'Edit', label: 'Undo', shortcut: 'Ctrl+Z', icon: <Undo2 size={13} />, disabled: !store.canUndo(), run: store.undo },
      { id: 'redo', group: 'Edit', label: 'Redo', shortcut: 'Ctrl+Shift+Z', icon: <Redo2 size={13} />, disabled: !store.canRedo(), run: store.redo },
      {
        id: 'find',
        group: 'Edit',
        label: 'Find and replace',
        shortcut: 'Ctrl+H',
        icon: <Replace size={13} />,
        run: () => setFindOpen(true),
      },
      {
        id: 'mode',
        group: 'View',
        label: mode === 'visual' ? 'Switch to HTML mode' : 'Switch to the visual editor',
        shortcut: 'Ctrl+/',
        icon: mode === 'visual' ? <Code2 size={13} /> : <LayoutTemplate size={13} />,
        run: () => setPref('mode', mode === 'visual' ? 'html' : 'visual'),
      },
      ...LAYOUTS.map(entry => ({
        id: `layout-${entry.id}`,
        group: 'View',
        label: `Layout: ${entry.label}`,
        keywords: entry.description,
        icon: <Eye size={13} />,
        run: () => setPref('layout', entry.id),
      })),
      {
        id: 'fullscreen',
        group: 'View',
        label: fullScreen ? 'Exit full screen' : 'Full screen',
        shortcut: 'F11',
        icon: <Maximize2 size={13} />,
        run: () => setPref('fullScreen', !fullScreen),
      },
      { id: 'theme', group: 'Design', label: 'Themes and brand', icon: <Palette size={13} />, run: () => setThemeOpen(true) },
      { id: 'assets', group: 'Design', label: 'Image library', icon: <ImageIcon size={13} />, run: () => setAssetRequest({ onPick: () => {} }) },
      { id: 'reusable', group: 'Design', label: 'Reusable content', icon: <Sparkles size={13} />, run: () => setReusableLibraryOpen(true) },
      {
        id: 'merge',
        group: 'Personalization',
        label: 'Merge fields and data mapping',
        icon: <Users size={13} />,
        run: () => setMergeFieldsOpen(true),
      },
      {
        id: 'insert-merge',
        group: 'Personalization',
        label: 'Insert a merge field',
        icon: <Users size={13} />,
        disabled: !activeEditor,
        run: () => setMergeRequest({ context: 'body', onPick: insertMergeChip }),
      },
      { id: 'review', group: 'Quality', label: 'Review and validation', icon: <ShieldCheck size={13} />, run: () => setReviewOpen(true) },
      { id: 'test', group: 'Quality', label: 'Send a test email', icon: <Send size={13} />, run: () => setTestSendOpen(true) },
      {
        id: 'plain',
        group: 'Quality',
        label: 'Edit the plain-text version',
        icon: <AlignLeft size={13} />,
        run: () => {
          setPref('mode', 'html');
          setPref('codeTab', 'plain');
        },
      },
      {
        id: 'attachments',
        group: 'Campaign',
        label: 'Attachments',
        icon: <Paperclip size={13} />,
        disabled: store.targetType !== 'campaign',
        run: () => setAttachmentsOpen(true),
      },
    ],
    [activeEditor, fullScreen, leave, mode, store]
  );

  if (bootError) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md text-center">
          <p className="text-sm font-semibold text-gray-900">The composer could not start</p>
          <p className="mt-1 text-[13px] text-gray-600">{bootError}</p>
          <button
            type="button"
            onClick={() => void boot()}
            className="mt-3 rounded-lg bg-brand-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-700"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!ready || loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-gray-500">
        <Spinner size={18} />
        <span className="text-[13px]">Opening the composer…</span>
      </div>
    );
  }

  const composePane = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-gray-50">
      {mode === 'visual' ? (
        <>
          <div className="shrink-0 overflow-x-auto border-b border-gray-200 bg-white">
            <RichTextToolbar
              editor={activeEditor}
              palette={palette}
              tokens={tokens}
              onInsertMergeField={() => setMergeRequest({ context: 'body', onPick: insertMergeChip })}
              onEditLink={openInlineLink}
              onOpenFindReplace={() => setFindOpen(true)}
            />
          </div>
          <div className="flex min-h-0 flex-1">
            <LeftPanel
              reusables={reusables}
              reusablesLoading={reusablesLoading}
              onInsertReusable={insertReusable}
              onOpenLibrary={() => setReusableLibraryOpen(true)}
            />
            <Canvas
              onSaveReusable={(nodeId, nodeKind) => setSaveReusable({ nodeId, kind: nodeKind })}
              onEditRawHtml={setRawBlockId}
              onEditTable={setTableBlockId}
              onRequestBlock={() => setPref('leftPanelOpen', true)}
            />
            <RightPanel actions={actions} />
          </div>
        </>
      ) : (
        <HtmlMode onSelectNode={nodeId => store.select(nodeId)} />
      )}
    </div>
  );

  const previewPane = <PreviewPane onSelectNode={nodeId => store.select(nodeId)} />;
  const orientation = layoutOrientation(layout);
  const showCompose = layoutShowsCompose(layout);
  const showPreview = layoutShowsPreview(layout);
  const composeIsFirst = composeFirst(layout);

  return (
    <ComposerDndProvider onInsertReusable={code => void insertReusable(code)}>
      <div
        className={clsx(
          'flex min-h-0 flex-col bg-white',
          fullScreen ? 'fixed inset-0 z-50 h-screen' : 'h-full'
        )}
      >
        <ComposerHeader
          onOpenTestSend={() => setTestSendOpen(true)}
          onOpenReview={() => setReviewOpen(true)}
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenTheme={() => setThemeOpen(true)}
          onOpenMergeFields={() => setMergeFieldsOpen(true)}
          onOpenSaveAsTemplate={() => setSaveAsOpen(true)}
          onOpenAttachments={() => setAttachmentsOpen(true)}
          onClose={leave}
        />

        {!canEdit && (
          <p className="border-b border-amber-100 bg-amber-50 px-4 py-1.5 text-[12px] text-amber-900">
            {store.lockedReason || 'This content is read-only.'}
          </p>
        )}

        <main className="flex min-h-0 flex-1 flex-col">
          {orientation === 'single' || !showCompose || !showPreview ? (
            showCompose ? (
              composePane
            ) : (
              previewPane
            )
          ) : (
            <SplitPane
              orientation={orientation}
              ratio={composeIsFirst ? splitRatio : 1 - splitRatio}
              onRatioChange={ratio => patchPrefs({ splitRatio: composeIsFirst ? ratio : 1 - ratio })}
              first={composeIsFirst ? composePane : previewPane}
              second={composeIsFirst ? previewPane : composePane}
              firstLabel={composeIsFirst ? 'Editor' : 'Preview'}
              secondLabel={composeIsFirst ? 'Preview' : 'Editor'}
              minFirstPx={orientation === 'horizontal' ? 420 : 220}
              minSecondPx={orientation === 'horizontal' ? 320 : 200}
            />
          )}
        </main>

        <LiveRegion message={saveMessage || announceRef.current} />
      </div>

      {/* ── dialogs ─────────────────────────────────────────────────────────── */}
      <AssetLibrary request={assetRequest} onClose={() => setAssetRequest(null)} />
      <MergeFieldPicker request={mergeRequest} onClose={() => setMergeRequest(null)} />
      <LinkDialog request={linkRequest} onClose={() => setLinkRequest(null)} />
      <ImageCropper blockId={cropBlockId} onClose={() => setCropBlockId(null)} />
      <TableEditor blockId={tableBlockId} onClose={() => setTableBlockId(null)} />
      <RawHtmlDialog blockId={rawBlockId} onClose={() => setRawBlockId(null)} />
      <SaveReusableDialog
        request={saveReusable}
        onClose={() => setSaveReusable(null)}
        onSaved={() => void loadReusables()}
      />
      <ReusableLibraryDialog
        open={reusableLibraryOpen}
        onClose={() => {
          setReusableLibraryOpen(false);
          setReusablePick(null);
        }}
        onInsert={(code, label) => {
          if (reusablePick) {
            reusablePick(code, label);
            setReusablePick(null);
            return;
          }
          void insertReusable(code);
        }}
      />
      <ThemeEditor
        open={themeOpen}
        onClose={() => setThemeOpen(false)}
        onPickAsset={(onPick, purpose) => setAssetRequest({ onPick, purpose })}
      />
      <TestSendDialog open={testSendOpen} onClose={() => setTestSendOpen(false)} />
      <ReviewDashboard open={reviewOpen} onClose={() => setReviewOpen(false)} onNavigate={navigateToIssue} />
      <RevisionHistory open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <MergeFieldsDialog open={mergeFieldsOpen} onClose={() => setMergeFieldsOpen(false)} />
      <AttachmentsDialog open={attachmentsOpen} onClose={() => setAttachmentsOpen(false)} />
      <FindReplaceDialog open={findOpen} onClose={() => setFindOpen(false)} />
      <SaveAsTemplateDialog open={saveAsOpen} onClose={() => setSaveAsOpen(false)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <RecoveryDialog />
      <ConflictDialog />

      {kind === 'custom_html' && mode === 'visual' && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
          <p className="pointer-events-auto flex items-center gap-2 rounded-full bg-gray-900/90 px-3 py-1.5 text-[12px] text-white shadow-lg">
            <Link2 size={12} />
            This template uses custom HTML, so the visual editor is read-only.
            <button
              type="button"
              onClick={() => setPref('mode', 'html')}
              className="font-semibold text-brand-200 underline"
            >
              Open HTML mode
            </button>
          </p>
        </div>
      )}

      {store.compiling && (
        <span className="sr-only" role="status">
          Updating the preview
        </span>
      )}

      {/* Table blocks are edited in a dialog; make the entry point discoverable. */}
      {store.primaryKind === 'block' && store.primaryId && isTable(doc, store.primaryId) && (
        <button
          type="button"
          onClick={() => setTableBlockId(store.primaryId)}
          className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-2 text-[12.5px] font-semibold text-white shadow-lg hover:bg-brand-700"
        >
          <Table2 size={13} />
          Edit table
        </button>
      )}
    </ComposerDndProvider>
  );
}

function isTable(doc: ReturnType<typeof useComposer.getState>['doc'], id: string): boolean {
  const found = findNode(doc, id);
  return found?.location.kind === 'block' && (found.node as { type?: string }).type === 'table';
}
