/**
 * HTML mode workspace (spec 13, 16, 17, 19).
 *
 * Three tabs share one editor surface: the editable source, the read-only compiled
 * output that is actually sent, and the plain-text alternative. For visual templates the
 * source is generated, so editing it is an explicit, confirmed fork.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  AlignLeft,
  Braces,
  Code2,
  GitFork,
  Lock,
  Minimize2,
  Moon,
  RefreshCw,
  Sun,
  WrapText,
} from 'lucide-react';
import type { ValidationIssue } from '../model/issues';
import { useComposer } from '../store/composerStore';
import { setPref, usePref } from '../store/preferences';
import type { CodeTab } from '../store/preferences';
import { Dialog, DialogButton } from '../ui/Dialog';
import { Pill, ToolButton, ToolbarDivider } from '../ui/primitives';
import { CodeEditor, type CodeEditorHandle } from './CodeEditor';
import { issuesToMarkers, quickDiagnostics, toMarkers } from './diagnostics';
import { setCodeIntelContext } from './monacoSetup';
import { ProblemsPanel, type OutputLine } from './ProblemsPanel';

const TABS: { id: CodeTab; label: string; icon: typeof Code2; hint: string }[] = [
  { id: 'source', label: 'Source HTML', icon: Code2, hint: 'The HTML you author.' },
  { id: 'compiled', label: 'Compiled HTML', icon: Braces, hint: 'Sanitized and inlined output. This is what recipients receive.' },
  { id: 'plain', label: 'Plain text', icon: AlignLeft, hint: 'The text alternative sent alongside the HTML.' },
];

export function HtmlMode({ onSelectNode }: { onSelectNode?: (nodeId: string) => void }) {
  const kind = useComposer(store => store.kind);
  const canEdit = useComposer(store => store.canEdit);
  const htmlSource = useComposer(store => store.htmlSource);
  const setHtmlSource = useComposer(store => store.setHtmlSource);
  const compiled = useComposer(store => store.compiled);
  const compiling = useComposer(store => store.compiling);
  const compileError = useComposer(store => store.compileError);
  const plainText = useComposer(store => store.plainText);
  const plainTextMode = useComposer(store => store.plainTextMode);
  const plainTextStale = useComposer(store => store.plainTextStale);
  const setPlainText = useComposer(store => store.setPlainText);
  const regeneratePlainText = useComposer(store => store.regeneratePlainText);
  const mergeDefs = useComposer(store => store.mergeDefs);
  const systemFields = useComposer(store => store.systemFields);
  const tokens = useComposer(store => store.themeTokens());
  const forkToHtml = useComposer(store => store.forkToHtml);
  const save = useComposer(store => store.save);
  const requestCompile = useComposer(store => store.requestCompile);
  const select = useComposer(store => store.select);
  const canUseCustomHtml = useComposer(store => store.can('use_custom_html'));

  const tab = usePref('codeTab');
  const codeTheme = usePref('codeTheme');
  const fontSize = usePref('codeFontSize');
  const tabSize = usePref('codeTabSize');
  const wordWrap = usePref('codeWordWrap');
  const minimap = usePref('codeMinimap');

  const editorRef = useRef<CodeEditorHandle | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1, selected: 0 });
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [forkOpen, setForkOpen] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<string | null>(null);

  const generated = kind === 'visual';
  const sourceReadOnly = generated || !canEdit;

  const allFields = useMemo(() => {
    const map = new Map(systemFields.map(field => [field.key, field]));
    mergeDefs.forEach(field => map.set(field.key, field));
    return [...map.values()];
  }, [mergeDefs, systemFields]);

  useEffect(() => {
    setCodeIntelContext({ mergeFields: allFields, tokens });
  }, [allFields, tokens]);

  // Compile output is appended to the Output tab so authors can see what happened.
  useEffect(() => {
    if (!compiled) return;
    const lines: OutputLine[] = [
      {
        at: compiled.at,
        level: 'info',
        message: `Compiled ${Math.round(compiled.sizeBytes / 1024)}KB · ${compiled.validation.summary.blockers} blockers, ${compiled.validation.summary.errors} errors, ${compiled.validation.summary.warnings} warnings`,
      },
      ...compiled.removed.map(entry => ({ at: compiled.at, level: 'warn' as const, message: `Removed: ${entry}` })),
      ...compiled.autoAppended.map(entry => ({ at: compiled.at, level: 'info' as const, message: `Added automatically: ${entry}` })),
      ...compiled.warnings.map(entry => ({ at: compiled.at, level: 'warn' as const, message: entry })),
    ];
    setOutput(current => [...current, ...lines].slice(-200));
  }, [compiled]);

  useEffect(() => {
    if (compileError) {
      const line: OutputLine = { at: Date.now(), level: 'error', message: compileError };
      setOutput(current => [...current, line].slice(-200));
    }
  }, [compileError]);

  const quick = useMemo(
    () => (tab === 'source' ? quickDiagnostics(htmlSource, allFields) : []),
    [allFields, htmlSource, tab]
  );

  const backendIssues = compiled?.validation.issues || [];
  const markers = useMemo(() => {
    if (tab !== 'source') return [];
    const positioned = issuesToMarkers(backendIssues);
    // Prefer the authoritative report once it has positions for this source.
    return positioned.length ? positioned : toMarkers(quick);
  }, [backendIssues, quick, tab]);

  const panelIssues: ValidationIssue[] = useMemo(() => {
    if (backendIssues.length) return backendIssues;
    return quick.map(entry => ({
      code: entry.code,
      severity: entry.severity,
      category: entry.code.split('.')[0] === 'a11y' ? 'accessibility' : ('html' as ValidationIssue['category']),
      message: entry.message,
      expected: entry.suggestion ?? null,
      line: entry.line,
      column: entry.column,
    }));
  }, [backendIssues, quick]);

  const navigate = useCallback(
    (issue: ValidationIssue) => {
      if (issue.line) {
        setPref('codeTab', 'source');
        editorRef.current?.goToLine(issue.line, issue.column ?? 1);
        return;
      }
      if (issue.nodeId) {
        select(issue.nodeId);
        onSelectNode?.(issue.nodeId);
      }
    },
    [onSelectNode, select]
  );

  const onSourceChange = (value: string) => {
    if (!generated) {
      setHtmlSource(value);
      return;
    }
    // Visual templates keep structured JSON as the source of truth; editing HTML forks.
    setPendingEdit(value);
    setForkOpen(true);
  };

  const confirmFork = async () => {
    setForkOpen(false);
    const ok = await forkToHtml();
    if (!ok) {
      setPendingEdit(null);
      return;
    }
    if (pendingEdit !== null) setHtmlSource(pendingEdit);
    setPendingEdit(null);
    toast.success('This template now uses custom HTML. The visual version is kept in the revision history.');
  };

  const value = tab === 'source' ? htmlSource : tab === 'compiled' ? compiled?.html || '' : plainText;
  const language = tab === 'plain' ? 'plaintext' : 'html';
  const readOnly = tab === 'compiled' || (tab === 'source' && sourceReadOnly && !generated) || !canEdit;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 px-2 py-1.5">
        <div role="tablist" aria-label="Code views" className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
          {TABS.map(entry => {
            const Icon = entry.icon;
            return (
              <button
                key={entry.id}
                role="tab"
                type="button"
                aria-selected={tab === entry.id}
                title={entry.hint}
                onClick={() => setPref('codeTab', entry.id)}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
                  tab === entry.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                )}
              >
                <Icon size={12} />
                {entry.label}
                {entry.id === 'compiled' && <Lock size={10} className="text-gray-400" />}
              </button>
            );
          })}
        </div>

        <ToolbarDivider />

        <ToolButton
          icon={<AlignLeft size={14} />}
          label="Format document"
          shortcut="Shift+Alt+F"
          disabled={readOnly}
          onClick={() => editorRef.current?.format()}
        />
        <ToolButton
          icon={<Minimize2 size={14} />}
          label="Format selection"
          disabled={readOnly}
          onClick={() => editorRef.current?.formatSelection()}
        />
        <ToolButton
          icon={<WrapText size={14} />}
          label="Word wrap"
          active={wordWrap}
          onClick={() => setPref('codeWordWrap', !wordWrap)}
        />
        <ToolButton
          icon={codeTheme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          label={codeTheme === 'dark' ? 'Light theme' : 'Dark theme'}
          onClick={() => setPref('codeTheme', codeTheme === 'dark' ? 'light' : 'dark')}
        />
        <ToolButton
          icon={<RefreshCw size={14} className={compiling ? 'animate-spin' : undefined} />}
          label="Recompile now"
          onClick={() => requestCompile(true)}
        />

        {generated && (
          <span className="ml-auto flex items-center gap-2">
            <Pill tone="blue" icon={<Lock size={10} />}>
              Generated from the visual editor
            </Pill>
            {canUseCustomHtml && (
              <button
                type="button"
                onClick={() => setForkOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11.5px] font-medium text-gray-700 hover:bg-gray-50"
              >
                <GitFork size={11} />
                Switch to custom HTML
              </button>
            )}
          </span>
        )}

        {tab === 'plain' && (
          <span className="ml-auto flex items-center gap-2">
            <Pill tone={plainTextStale ? 'red' : plainTextMode === 'manual' ? 'amber' : 'green'}>
              {plainTextStale ? 'Out of date' : plainTextMode === 'manual' ? 'Manually edited' : 'Generated'}
            </Pill>
            <button
              type="button"
              onClick={() => {
                if (plainTextMode === 'manual' && !window.confirm('Regenerating replaces your edited plain text. Continue?')) return;
                regeneratePlainText();
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11.5px] font-medium text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw size={11} />
              Regenerate
            </button>
          </span>
        )}
      </div>

      {tab === 'compiled' && (
        <p className="border-b border-blue-100 bg-blue-50/70 px-3 py-1.5 text-[11.5px] text-blue-900">
          This is the sanitized, CSS-inlined output that recipients receive. It is read-only: edit the source tab instead.
        </p>
      )}

      <CodeEditor
        ref={editorRef}
        className="min-h-0 flex-1"
        modelPath={`composer/${tab}.${tab === 'plain' ? 'txt' : 'html'}`}
        value={value}
        onChange={tab === 'source' ? onSourceChange : tab === 'plain' ? setPlainText : undefined}
        language={language}
        readOnly={readOnly}
        theme={codeTheme}
        fontSize={fontSize}
        tabSize={tabSize}
        wordWrap={wordWrap}
        minimap={minimap}
        markers={markers}
        onCursorChange={setCursor}
        onSave={() => void save()}
        ariaLabel={TABS.find(entry => entry.id === tab)?.label || 'Code editor'}
      />

      <StatusBar cursor={cursor} tab={tab} issues={panelIssues} sizeBytes={compiled?.sizeBytes ?? 0} compiling={compiling} />

      <ProblemsPanel issues={panelIssues} output={output} onNavigate={navigate} compiling={compiling} />

      <Dialog
        open={forkOpen}
        onClose={() => {
          setForkOpen(false);
          setPendingEdit(null);
        }}
        size="md"
        title="Switch this template to custom HTML?"
        description="The visual editor cannot represent hand-written HTML, so it becomes read-only for this template."
        footer={
          <>
            <DialogButton
              onClick={() => {
                setForkOpen(false);
                setPendingEdit(null);
              }}
            >
              Keep editing visually
            </DialogButton>
            <DialogButton variant="primary" onClick={confirmFork}>
              Switch to custom HTML
            </DialogButton>
          </>
        }
      >
        <ul className="space-y-1.5 text-[12.5px] leading-snug text-gray-700">
          <li>· A new revision is created with the current HTML as its source.</li>
          <li>· The visual revision is preserved in history, so you can restore it later.</li>
          <li>· Blocks, layers and the properties panel stop applying to this template.</li>
          <li>· Validation, preview, plain text and test sending keep working exactly as before.</li>
        </ul>
      </Dialog>
    </div>
  );
}

function StatusBar({
  cursor,
  tab,
  issues,
  sizeBytes,
  compiling,
}: {
  cursor: { line: number; column: number; selected: number };
  tab: CodeTab;
  issues: ValidationIssue[];
  sizeBytes: number;
  compiling: boolean;
}) {
  const tabSize = usePref('codeTabSize');
  const wordWrap = usePref('codeWordWrap');
  const errors = issues.filter(issue => issue.severity === 'blocker' || issue.severity === 'error').length;
  const warnings = issues.filter(issue => issue.severity === 'warning').length;

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 bg-gray-50 px-3 py-1 text-[11px] text-gray-600">
      <span className="tabular-nums">
        Ln {cursor.line}, Col {cursor.column}
      </span>
      {cursor.selected > 0 && <span className="tabular-nums">{cursor.selected} selected</span>}
      <span>Spaces: {tabSize}</span>
      <span>{tab === 'plain' ? 'Plain text' : 'HTML'}</span>
      <span>{wordWrap ? 'Wrap on' : 'Wrap off'}</span>
      <span className="tabular-nums">{sizeBytes ? `${Math.round(sizeBytes / 1024)}KB` : '—'}</span>
      <span className="ml-auto flex items-center gap-2">
        <span className={clsx('tabular-nums', errors ? 'text-red-700' : 'text-emerald-700')}>
          {errors} error{errors === 1 ? '' : 's'}
        </span>
        <span className={clsx('tabular-nums', warnings ? 'text-amber-700' : 'text-gray-500')}>
          {warnings} warning{warnings === 1 ? '' : 's'}
        </span>
        <span className={compiling ? 'text-brand-700' : 'text-gray-500'}>
          {compiling ? 'Preview updating…' : 'Preview in sync'}
        </span>
      </span>
    </div>
  );
}
