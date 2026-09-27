/**
 * Monaco wrapper used by HTML mode and the raw HTML block editor (spec 13.1).
 *
 * Cursor position and scroll offset survive tab switches and mode switches, and every
 * VS Code-style affordance the spec asks for is enabled through options rather than
 * bespoke code.
 */

import { useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as Mon from 'monaco-editor';
import { Spinner } from '../ui/primitives';
import { setupMonaco, type Monaco } from './monacoSetup';

export interface CodeEditorHandle {
  focus: () => void;
  format: () => void;
  formatSelection: () => void;
  goToLine: (line: number, column?: number) => void;
  reveal: (line: number, column?: number) => void;
  openFind: () => void;
  openReplace: () => void;
  openCommandPalette: () => void;
  getSelectionText: () => string;
  insertAtCursor: (text: string) => void;
  getPosition: () => { line: number; column: number };
  getSelectionSize: () => number;
  editor: () => Mon.editor.IStandaloneCodeEditor | null;
}

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: 'html' | 'plaintext' | 'css';
  readOnly?: boolean;
  theme: 'light' | 'dark';
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  /** Markers replace the whole owner set on every call. */
  markers?: Mon.editor.IMarkerData[];
  markerOwner?: string;
  onCursorChange?: (state: { line: number; column: number; selected: number }) => void;
  onSave?: () => void;
  ariaLabel: string;
  className?: string;
  /** Stable identity so the model, undo stack and view state are reused. */
  modelPath?: string;
}

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(
  {
    value,
    onChange,
    language = 'html',
    readOnly = false,
    theme,
    fontSize,
    tabSize,
    wordWrap,
    minimap,
    markers,
    markerOwner = 'composer',
    onCursorChange,
    onSave,
    ariaLabel,
    className,
    modelPath,
  },
  ref
) {
  const editorRef = useRef<Mon.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const viewStateRef = useRef<Mon.editor.ICodeEditorViewState | null>(null);

  useEffect(() => {
    setupMonaco();
  }, []);

  const onMount = useCallback<OnMount>(
    (instance, api) => {
      editorRef.current = instance;
      monacoRef.current = api as unknown as Monaco;

      if (viewStateRef.current) instance.restoreViewState(viewStateRef.current);

      instance.onDidChangeCursorPosition(() => {
        if (!onCursorChange) return;
        const position = instance.getPosition();
        const selection = instance.getSelection();
        const model = instance.getModel();
        const selected =
          selection && model && !selection.isEmpty() ? model.getValueInRange(selection).length : 0;
        onCursorChange({ line: position?.lineNumber ?? 1, column: position?.column ?? 1, selected });
      });

      instance.addCommand(api.KeyMod.CtrlCmd | api.KeyCode.KeyS, () => onSave?.());

      instance.addAction({
        id: 'composer.formatDocument',
        label: 'Format Document',
        keybindings: [api.KeyMod.Shift | api.KeyMod.Alt | api.KeyCode.KeyF],
        run: () => {
          void instance.getAction('editor.action.formatDocument')?.run();
        },
      });
    },
    [onCursorChange, onSave]
  );

  useEffect(() => {
    const instance = editorRef.current;
    const api = monacoRef.current;
    if (!instance || !api) return;
    const model = instance.getModel();
    if (!model) return;
    api.editor.setModelMarkers(model, markerOwner, markers || []);
  }, [markers, markerOwner]);

  useImperativeHandle(
    ref,
    (): CodeEditorHandle => ({
      focus: () => editorRef.current?.focus(),
      format: () => {
        void editorRef.current?.getAction('editor.action.formatDocument')?.run();
      },
      formatSelection: () => {
        void editorRef.current?.getAction('editor.action.formatSelection')?.run();
      },
      goToLine: (line, column = 1) => {
        const instance = editorRef.current;
        if (!instance) return;
        instance.revealLineInCenter(line);
        instance.setPosition({ lineNumber: line, column });
        instance.focus();
      },
      reveal: (line, column = 1) => {
        editorRef.current?.revealPositionInCenterIfOutsideViewport({ lineNumber: line, column });
      },
      openFind: () => {
        void editorRef.current?.getAction('actions.find')?.run();
      },
      openReplace: () => {
        void editorRef.current?.getAction('editor.action.startFindReplaceAction')?.run();
      },
      openCommandPalette: () => {
        void editorRef.current?.getAction('editor.action.quickCommand')?.run();
      },
      getSelectionText: () => {
        const instance = editorRef.current;
        const selection = instance?.getSelection();
        const model = instance?.getModel();
        return selection && model ? model.getValueInRange(selection) : '';
      },
      insertAtCursor: text => {
        const instance = editorRef.current;
        const selection = instance?.getSelection();
        if (!instance || !selection) return;
        instance.executeEdits('composer.insert', [{ range: selection, text, forceMoveMarkers: true }]);
        instance.focus();
      },
      getPosition: () => {
        const position = editorRef.current?.getPosition();
        return { line: position?.lineNumber ?? 1, column: position?.column ?? 1 };
      },
      getSelectionSize: () => {
        const instance = editorRef.current;
        const selection = instance?.getSelection();
        const model = instance?.getModel();
        return selection && model && !selection.isEmpty() ? model.getValueInRange(selection).length : 0;
      },
      editor: () => editorRef.current,
    }),
    []
  );

  // Remember the view state so switching tabs does not reset the caret.
  useEffect(
    () => () => {
      viewStateRef.current = editorRef.current?.saveViewState() ?? viewStateRef.current;
    },
    []
  );

  return (
    <div className={className}>
      <Editor
        value={value}
        onChange={next => onChange?.(next ?? '')}
        language={language}
        path={modelPath}
        theme={theme === 'dark' ? 'composer-dark' : 'composer-light'}
        loading={
          <div className="flex h-full items-center justify-center text-gray-400">
            <Spinner size={18} />
          </div>
        }
        onMount={onMount}
        options={{
          readOnly,
          domReadOnly: readOnly,
          fontSize,
          tabSize,
          insertSpaces: true,
          detectIndentation: false,
          wordWrap: wordWrap ? 'on' : 'off',
          minimap: { enabled: minimap, renderCharacters: false },
          lineNumbers: 'on',
          renderLineHighlight: 'all',
          folding: true,
          foldingHighlight: true,
          showFoldingControls: 'mouseover',
          guides: { indentation: true, bracketPairs: true, highlightActiveIndentation: true },
          bracketPairColorization: { enabled: true },
          matchBrackets: 'always',
          autoClosingBrackets: 'languageDefined',
          autoClosingQuotes: 'languageDefined',
          autoClosingOvertype: 'always',
          autoIndent: 'full',
          formatOnPaste: false,
          multiCursorModifier: 'ctrlCmd',
          columnSelection: false,
          find: { addExtraSpaceOnTop: false, seedSearchStringFromSelection: 'selection' },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          renderWhitespace: 'selection',
          stickyScroll: { enabled: true },
          suggest: { showWords: false, snippetsPreventQuickSuggestions: false },
          quickSuggestions: { other: true, comments: false, strings: true },
          tabCompletion: 'on',
          padding: { top: 10, bottom: 24 },
          fixedOverflowWidgets: true,
          ariaLabel,
          accessibilitySupport: 'auto',
          fontLigatures: false,
          fontFamily: "'JetBrains Mono', 'Cascadia Mono', Consolas, 'Courier New', monospace",
        }}
      />
    </div>
  );
});
