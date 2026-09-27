/**
 * Scoped rich-text editing for a single block (spec 5).
 *
 * One TipTap instance is mounted for the block being edited, so the canvas stays
 * cheap and formatting is always applied within the block boundary. Merge fields
 * are protected atomic nodes, and pastes go through the sanitizing pipeline.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import TextStyleExtension from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import FontFamily from '@tiptap/extension-font-family';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Placeholder from '@tiptap/extension-placeholder';
import type { CSSProperties } from 'react';
import { MergeFieldNode, chipsToTokens, tokensToChips } from './extensions/MergeFieldNode';
import { TextStyleExtras } from './extensions/TextStyleExtras';
import { pasteAsPlainText, sanitizePaste } from './paste';

export interface RichTextHandle {
  editor: Editor | null;
}

export function useRichTextEditor({
  value,
  onChange,
  onPasteNotes,
  placeholder,
  singleLine = false,
  editable = true,
  autoFocus = false,
}: {
  value: string;
  onChange: (html: string) => void;
  onPasteNotes?: (notes: string[]) => void;
  placeholder?: string;
  singleLine?: boolean;
  editable?: boolean;
  autoFocus?: boolean;
}): Editor | null {
  const latestValue = useRef(value);
  const suppress = useRef(false);
  const plainTextPaste = useRef(false);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: singleLine ? false : { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false,
        horizontalRule: false,
        dropcursor: { color: '#6366f1', width: 2 },
      }),
      Underline,
      Subscript,
      Superscript,
      TextStyleExtension,
      TextStyleExtras,
      Color,
      FontFamily.configure({ types: ['textStyle'] }),
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({
        openOnClick: false,
        autolink: false,
        protocols: ['http', 'https', 'mailto', 'tel'],
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      MergeFieldNode,
      Placeholder.configure({ placeholder: placeholder || 'Write your message…' }),
    ],
    [placeholder, singleLine]
  );

  const editor = useEditor(
    {
      extensions,
      editable,
      autofocus: autoFocus ? 'end' : false,
      content: tokensToChips(value),
      editorProps: {
        attributes: {
          class: 'cn-richtext',
          spellcheck: 'true',
          role: 'textbox',
          'aria-multiline': singleLine ? 'false' : 'true',
        },
        handleKeyDown: (_view, event) => {
          if (singleLine && event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            return true;
          }
          // Ctrl+Shift+V pastes without formatting.
          if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'v') {
            plainTextPaste.current = true;
          }
          // Ctrl+Shift+Space inserts a non-breaking space.
          if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'Space') {
            event.preventDefault();
            editor?.commands.insertContent('\u00a0');
            return true;
          }
          return false;
        },
        handlePaste: (_view, event) => {
          const clipboard = event.clipboardData;
          if (!clipboard) return false;
          const html = clipboard.getData('text/html');
          const text = clipboard.getData('text/plain');
          if (!html && !text) return false;
          event.preventDefault();

          if (plainTextPaste.current || !html) {
            plainTextPaste.current = false;
            const asText = html ? pasteAsPlainText(html) : `<p>${text.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`;
            editor?.commands.insertContent(tokensToChips(asText));
            onPasteNotes?.(html ? ['Pasted without formatting.'] : []);
            return true;
          }

          const result = sanitizePaste(html, { plainTextFallback: text });
          editor?.commands.insertContent(tokensToChips(result.html));
          if (result.notes.length) onPasteNotes?.(result.notes);
          return true;
        },
      },
      onUpdate: ({ editor: instance }) => {
        if (suppress.current) return;
        const html = chipsToTokens(instance.getHTML());
        latestValue.current = html;
        onChange(html);
      },
    },
    [editable]
  );

  // Adopt external changes (undo, property panel edits) without losing the caret.
  useEffect(() => {
    if (!editor) return;
    if (value === latestValue.current) return;
    latestValue.current = value;
    suppress.current = true;
    const { from, to } = editor.state.selection;
    editor.commands.setContent(tokensToChips(value), false);
    try {
      const size = editor.state.doc.content.size;
      editor.commands.setTextSelection({ from: Math.min(from, size), to: Math.min(to, size) });
    } catch {
      /* selection may not survive a structural change; that is acceptable */
    }
    suppress.current = false;
  }, [value, editor]);

  return editor;
}

export function RichTextSurface({
  editor,
  style,
  className,
  onBlur,
}: {
  editor: Editor | null;
  style?: CSSProperties;
  className?: string;
  onBlur?: () => void;
}) {
  const handleBlur = useCallback(() => onBlur?.(), [onBlur]);
  if (!editor) return null;
  return (
    <div style={style} className={className} onBlur={handleBlur}>
      <EditorContent editor={editor} />
    </div>
  );
}

/** Read-only rendering of stored HTML with merge tokens shown as chips. */
export function RichTextStatic({
  html,
  style,
  className,
}: {
  html: string;
  style?: CSSProperties;
  className?: string;
}) {
  const decorated = useMemo(() => tokensToChips(html || ''), [html]);
  return (
    <div
      style={style}
      className={className}
      // The value is already sanitized on save and re-sanitized on the server.
      dangerouslySetInnerHTML={{ __html: decorated }}
    />
  );
}
