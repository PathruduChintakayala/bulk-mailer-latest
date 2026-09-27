import { useEffect, useRef, useCallback, useState } from 'react';
import type { Editor } from '@tiptap/react';

interface AutosaveOptions {
  /** Debounce delay in ms (default: 3000) */
  delay?: number;
  /** Callback to persist content */
  onSave: (html: string) => void | Promise<void>;
  /** Whether autosave is enabled */
  enabled?: boolean;
}

/**
 * Hook that autosaves editor content after a debounced delay.
 * Returns save status for display in status bar.
 */
export function useEditorAutosave(
  editor: Editor | null,
  options: AutosaveOptions
) {
  const { delay = 3000, onSave, enabled = true } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>('');
  const [status, setStatus] = useState<'idle' | 'unsaved' | 'saving' | 'saved'>('idle');

  const save = useCallback(async () => {
    if (!editor) return;
    const html = editor.getHTML();
    if (html === lastSavedRef.current) return;

    setStatus('saving');
    try {
      await onSave(html);
      lastSavedRef.current = html;
      setStatus('saved');
    } catch {
      setStatus('unsaved');
    }
  }, [editor, onSave]);

  useEffect(() => {
    if (!editor || !enabled) return;

    const handler = () => {
      setStatus('unsaved');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(save, delay);
    };

    editor.on('update', handler);
    return () => {
      editor.off('update', handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [editor, enabled, delay, save]);

  return { status, saveNow: save };
}
