import { useState, useRef, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered,
  Highlighter, Link, Undo2, Redo2,
  ChevronDown, Search, Eraser,
} from 'lucide-react';
import ToolbarButton from './ToolbarButton';

interface Props {
  editor: Editor;
  onFindReplace: () => void;
  onLinkDialog: () => void;
  expanded?: boolean;
}

const FONT_FAMILIES = [
  'Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS',
  'Georgia', 'Times New Roman', 'Courier New',
];

const FONT_SIZES = [
  { label: '10', value: '10px' }, { label: '12', value: '12px' }, { label: '14', value: '14px' },
  { label: '16', value: '16px' }, { label: '18', value: '18px' }, { label: '20', value: '20px' },
  { label: '24', value: '24px' }, { label: '28', value: '28px' }, { label: '32', value: '32px' },
  { label: '36', value: '36px' }, { label: '48', value: '48px' },
];

const STYLES = [
  { label: 'Normal', action: (e: Editor) => e.chain().focus().setParagraph().run(), check: (e: Editor) => e.isActive('paragraph') },
  { label: 'Heading 1', action: (e: Editor) => e.chain().focus().toggleHeading({ level: 1 }).run(), check: (e: Editor) => e.isActive('heading', { level: 1 }) },
  { label: 'Heading 2', action: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run(), check: (e: Editor) => e.isActive('heading', { level: 2 }) },
  { label: 'Heading 3', action: (e: Editor) => e.chain().focus().toggleHeading({ level: 3 }).run(), check: (e: Editor) => e.isActive('heading', { level: 3 }) },
  { label: 'Quote', action: (e: Editor) => e.chain().focus().toggleBlockquote().run(), check: (e: Editor) => e.isActive('blockquote') },
  { label: 'Code', action: (e: Editor) => e.chain().focus().toggleCodeBlock().run(), check: (e: Editor) => e.isActive('codeBlock') },
];

export default function MessageTab({ editor, onFindReplace, onLinkDialog, expanded = false }: Props) {
  const [showStyles, setShowStyles] = useState(false);
  const [showColor, setShowColor] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);

  const currentStyle = STYLES.find(s => s.check(editor))?.label || 'Normal';
  const currentColor = editor.getAttributes('textStyle').color as string | undefined;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) setShowColor(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5">
      {/* ── Undo / Redo ── */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Undo2 size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
        >
          <Redo2 size={14} />
        </ToolbarButton>
      </div>

      <div className="w-px h-7 bg-gray-200 mx-0.5" />

      {/* ── Styles Dropdown ── */}
      <div className="relative">
        <button
          onClick={() => setShowStyles(!showStyles)}
          className="flex items-center gap-1 h-7 px-2 text-[11px] text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors min-w-[90px]"
          aria-label="Paragraph style"
        >
          <span className="truncate">{currentStyle}</span>
          <ChevronDown size={12} className="text-gray-400 flex-shrink-0" />
        </button>
        {showStyles && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowStyles(false)} />
            <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
              {STYLES.map(s => (
                <button
                  key={s.label}
                  onClick={() => { s.action(editor); setShowStyles(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${s.check(editor) ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="w-px h-7 bg-gray-200 mx-0.5" />

      {/* ── Font ── */}
      <div className="flex items-center gap-1 bg-gray-50 rounded-lg px-1 py-0.5">
        <select
          value={editor.getAttributes('textStyle').fontFamily || 'Arial'}
          onChange={e => editor.chain().focus().setFontFamily(e.target.value).run()}
          className="h-7 text-[11px] border-0 bg-transparent rounded px-0.5 focus:ring-1 focus:ring-brand-500/30 outline-none w-[88px] cursor-pointer text-gray-700"
          title="Font Family"
          aria-label="Font family"
        >
          {FONT_FAMILIES.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
        </select>
        <div className="w-px h-4 bg-gray-200" />
        <select
          value={editor.getAttributes('textStyle').fontSize || '16px'}
          onChange={e => editor.chain().focus().setMark('textStyle', { fontSize: e.target.value }).run()}
          className="h-7 text-[11px] border-0 bg-transparent rounded px-0.5 focus:ring-1 focus:ring-brand-500/30 outline-none w-[44px] cursor-pointer text-gray-700"
          title="Font Size"
          aria-label="Font size"
        >
          {FONT_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="w-px h-7 bg-gray-200 mx-0.5" />

      {/* ── B I U ── */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold (Ctrl+B)" aria-label="Bold">
          <Bold size={14} strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic (Ctrl+I)" aria-label="Italic">
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline (Ctrl+U)" aria-label="Underline">
          <Underline size={14} />
        </ToolbarButton>
        {expanded && (
          <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough" aria-label="Strikethrough">
            <Strikethrough size={14} />
          </ToolbarButton>
        )}
      </div>

      <div className="w-px h-7 bg-gray-200 mx-0.5" />

      {/* ── Color (Word/Outlook-style A) ── */}
      <div className="flex items-center gap-0.5">
        <div className="relative" ref={colorRef}>
          <button
            type="button"
            title="Font Color"
            aria-label="Font color"
            aria-expanded={showColor}
            onClick={() => setShowColor(v => !v)}
            className="p-1.5 rounded-md hover:bg-gray-100 cursor-pointer flex flex-col items-center transition-colors min-w-[28px]"
          >
            <span className="text-[13px] font-bold leading-none text-gray-800" style={{ color: currentColor || undefined }}>A</span>
            <div
              className="w-3.5 h-0.5 rounded-full mt-0.5"
              style={{ backgroundColor: currentColor || '#000000' }}
            />
          </button>
          {showColor && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-[180px]">
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().unsetColor().run();
                  setShowColor(false);
                }}
                className="w-full text-left px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 rounded-md cursor-pointer mb-1"
              >
                Automatic
              </button>
              <label className="flex items-center gap-2 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 rounded-md cursor-pointer">
                <span
                  className="w-4 h-4 rounded border border-gray-300 flex-shrink-0"
                  style={{ backgroundColor: currentColor || '#000000' }}
                />
                Custom color…
                <input
                  type="color"
                  className="sr-only"
                  value={currentColor || '#000000'}
                  onChange={e => {
                    editor.chain().focus().setColor(e.target.value).run();
                  }}
                />
              </label>
            </div>
          )}
        </div>
        {expanded && (
          <label className="relative" title="Highlight Color">
            <div className="p-1.5 rounded-md hover:bg-gray-100 cursor-pointer flex flex-col items-center transition-colors" role="button" aria-label="Highlight color">
              <Highlighter size={14} className="text-gray-600" />
              <div className="w-3.5 h-0.5 rounded-full mt-px" style={{ backgroundColor: editor.getAttributes('highlight')?.color || '#fef08a' }} />
            </div>
            <input type="color" className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              value={editor.getAttributes('highlight')?.color || '#fef08a'}
              onChange={e => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()} />
          </label>
        )}
      </div>

      <div className="w-px h-7 bg-gray-200 mx-0.5" />

      {/* ── Lists ── */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List" aria-label="Bullet list">
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered List" aria-label="Numbered list">
          <ListOrdered size={14} />
        </ToolbarButton>
      </div>

      <div className="w-px h-7 bg-gray-200 mx-0.5" />

      {/* ── Alignment ── */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align Left" aria-label="Align left">
          <AlignLeft size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align Center" aria-label="Align center">
          <AlignCenter size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align Right" aria-label="Align right">
          <AlignRight size={14} />
        </ToolbarButton>
      </div>

      <div className="w-px h-7 bg-gray-200 mx-0.5" />

      {/* ── Link ── */}
      <ToolbarButton onClick={onLinkDialog} active={editor.isActive('link')} title="Insert Link (Ctrl+K)" aria-label="Insert link">
        <Link size={14} />
      </ToolbarButton>

      {/* ── Expanded: extra controls ── */}
      {expanded && (
        <>
          <div className="w-px h-7 bg-gray-200 mx-0.5" />
          <ToolbarButton onClick={onFindReplace} title="Find & Replace (Ctrl+H)" aria-label="Find and replace">
            <Search size={14} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="Clear Formatting" aria-label="Clear formatting">
            <Eraser size={14} />
          </ToolbarButton>
        </>
      )}
    </div>
  );
}
