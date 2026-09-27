/**
 * Raw HTML block editor (spec 19.3).
 *
 * The block is edited in isolation with its own validation and preview. Content is
 * sanitized locally for the preview and again on the server before it is sent, so
 * scripts and unsupported constructs can never reach a recipient.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { AlertTriangle, Eye, ShieldAlert } from 'lucide-react';
import type { RawHtmlBlock } from '../model/document';
import { findNode } from '../model/mutations';
import { useComposer } from '../store/composerStore';
import { usePref } from '../store/preferences';
import { Dialog, DialogButton } from '../ui/Dialog';
import { Pill, Segmented } from '../ui/primitives';
import { CodeEditor, type CodeEditorHandle } from '../code/CodeEditor';
import { quickDiagnostics, toMarkers } from '../code/diagnostics';

const PREVIEW_CONFIG = {
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea', 'base', 'link'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'srcdoc'],
  ALLOW_DATA_ATTR: false,
};

export function RawHtmlDialog({ blockId, onClose }: { blockId: string | null; onClose: () => void }) {
  const doc = useComposer(store => store.doc);
  const updateNodeById = useComposer(store => store.updateNodeById);
  const mergeDefs = useComposer(store => store.mergeDefs);
  const canInsert = useComposer(store => store.can('insert_raw_html'));
  const codeTheme = usePref('codeTheme');
  const fontSize = usePref('codeFontSize');
  const tabSize = usePref('codeTabSize');
  const wordWrap = usePref('codeWordWrap');

  const found = blockId ? findNode(doc, blockId) : null;
  const block = found?.location.kind === 'block' && (found.node as { type?: string }).type === 'rawHtml' ? (found.node as RawHtmlBlock) : undefined;

  const [draft, setDraft] = useState('');
  const [view, setView] = useState<'code' | 'preview'>('code');
  const editorRef = useRef<CodeEditorHandle | null>(null);

  useEffect(() => {
    if (block) setDraft(block.html);
  }, [blockId]); // eslint-disable-line react-hooks/exhaustive-deps

  const diagnostics = useMemo(() => quickDiagnostics(draft, mergeDefs), [draft, mergeDefs]);
  const markers = useMemo(() => toMarkers(diagnostics), [diagnostics]);
  const blockers = diagnostics.filter(entry => entry.severity === 'blocker');
  const errors = diagnostics.filter(entry => entry.severity === 'error');

  const sanitized = useMemo(() => DOMPurify.sanitize(draft, { ...PREVIEW_CONFIG }), [draft]);
  const strippedSomething = useMemo(() => sanitized.replace(/\s+/g, '') !== draft.replace(/\s+/g, ''), [draft, sanitized]);

  const apply = () => {
    if (!blockId) return;
    updateNodeById(blockId, { html: draft }, 'Edit raw HTML');
    onClose();
  };

  return (
    <Dialog
      open={!!blockId && !!block}
      onClose={onClose}
      size="xl"
      title="Raw HTML block"
      description="This markup is inserted as-is inside the surrounding layout."
      footer={
        <>
          <DialogButton onClick={onClose}>Cancel</DialogButton>
          <DialogButton variant="primary" onClick={apply} disabled={!canInsert || blockers.length > 0}>
            Apply
          </DialogButton>
        </>
      }
    >
      <div className="space-y-2">
        {!canInsert && (
          <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[12px] leading-snug text-amber-900">
            <ShieldAlert size={13} className="mt-px shrink-0" />
            You do not have permission to insert raw HTML, so this block is read-only.
          </p>
        )}

        <p className="flex items-start gap-1.5 rounded-lg bg-gray-50 px-2.5 py-2 text-[12px] leading-snug text-gray-700">
          <AlertTriangle size={13} className="mt-px shrink-0 text-amber-600" />
          Unclosed tags or table markup here can affect the layout around this block. Keep the snippet self-contained.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Raw HTML view"
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'code', label: 'Code' },
              { value: 'preview', label: 'Preview', icon: <Eye size={11} /> },
            ]}
          />
          {blockers.length > 0 && <Pill tone="red">{blockers.length} blocking issue{blockers.length === 1 ? '' : 's'}</Pill>}
          {errors.length > 0 && <Pill tone="amber">{errors.length} error{errors.length === 1 ? '' : 's'}</Pill>}
          {strippedSomething && <Pill tone="violet">Unsupported markup will be removed</Pill>}
          <button
            type="button"
            onClick={() => editorRef.current?.format()}
            className="ml-auto rounded-lg border border-gray-200 px-2 py-1 text-[11.5px] font-medium text-gray-700 hover:bg-gray-50"
          >
            Format
          </button>
        </div>

        {view === 'code' ? (
          <CodeEditor
            ref={editorRef}
            className="h-[46vh] overflow-hidden rounded-xl border border-gray-200"
            modelPath={`composer/raw-${blockId}.html`}
            value={draft}
            onChange={setDraft}
            readOnly={!canInsert}
            theme={codeTheme}
            fontSize={fontSize}
            tabSize={tabSize}
            wordWrap={wordWrap}
            minimap={false}
            markers={markers}
            markerOwner="composer-raw"
            ariaLabel="Raw HTML"
          />
        ) : (
          <div className="h-[46vh] overflow-auto rounded-xl border border-gray-200 bg-white p-3">
            <div
              className="prose prose-sm max-w-none"
              // Sanitized above; this preview is intentionally isolated from the document.
              dangerouslySetInnerHTML={{ __html: sanitized }}
            />
          </div>
        )}

        {diagnostics.length > 0 && (
          <ul className="max-h-28 overflow-y-auto rounded-lg bg-gray-50 p-2 text-[11.5px]">
            {diagnostics.slice(0, 20).map((entry, index) => (
              <li key={`${entry.code}-${index}`} className="flex gap-1.5 py-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setView('code');
                    editorRef.current?.goToLine(entry.line, entry.column);
                  }}
                  className="shrink-0 font-mono text-gray-400 hover:text-brand-700"
                >
                  Ln {entry.line}
                </button>
                <span className={entry.severity === 'blocker' || entry.severity === 'error' ? 'text-red-700' : 'text-amber-700'}>
                  {entry.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
