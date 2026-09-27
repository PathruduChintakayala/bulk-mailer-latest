import type { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline, Strikethrough, Subscript, Superscript,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Indent, Outdent,
  Heading1, Heading2, Heading3, Type, Quote, Code,
  Palette, Highlighter, Search,
} from 'lucide-react';
import ToolbarButton from './ToolbarButton';

interface Props {
  editor: Editor;
  onFindReplace: () => void;
}

const FONT_FAMILIES = [
  'Arial', 'Georgia', 'Helvetica', 'Times New Roman', 'Courier New',
  'Verdana', 'Tahoma', 'Trebuchet MS', 'Lucida Sans', 'Palatino',
  'Segoe UI', 'Calibri',
];

const FONT_SIZES = [
  { label: '10', value: '10px' }, { label: '12', value: '12px' }, { label: '14', value: '14px' },
  { label: '16', value: '16px' }, { label: '18', value: '18px' }, { label: '20', value: '20px' },
  { label: '24', value: '24px' }, { label: '28', value: '28px' }, { label: '32', value: '32px' },
  { label: '36', value: '36px' }, { label: '48', value: '48px' }, { label: '64', value: '64px' },
];

export default function FormatTab({ editor, onFindReplace }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5">
      {/* ── Font ── */}
      <div className="flex items-center gap-1 bg-gray-50 rounded-lg px-1.5 py-0.5">
        <select
          value={editor.getAttributes('textStyle').fontFamily || 'Arial'}
          onChange={e => editor.chain().focus().setFontFamily(e.target.value).run()}
          className="h-7 text-[11px] border-0 bg-transparent rounded px-1 focus:ring-1 focus:ring-brand-500/30 outline-none w-[100px] cursor-pointer text-gray-700"
          title="Font Family"
        >
          {FONT_FAMILIES.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
        </select>
        <div className="w-px h-4 bg-gray-200" />
        <select
          value={editor.getAttributes('textStyle').fontSize || '16px'}
          onChange={e => editor.chain().focus().setMark('textStyle', { fontSize: e.target.value }).run()}
          className="h-7 text-[11px] border-0 bg-transparent rounded px-1 focus:ring-1 focus:ring-brand-500/30 outline-none w-[48px] cursor-pointer text-gray-700"
          title="Font Size"
        >
          {FONT_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="w-px h-7 bg-gray-200 mx-0.5" />

      {/* ── Text Style ── */}
      <div className="flex items-center gap-0.5 bg-gray-50 rounded-lg px-0.5 py-0.5">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold (Ctrl+B)">
          <Bold size={14} strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic (Ctrl+I)">
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline (Ctrl+U)">
          <Underline size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
          <Strikethrough size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleSubscript().run()} active={editor.isActive('subscript')} title="Subscript">
          <Subscript size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleSuperscript().run()} active={editor.isActive('superscript')} title="Superscript">
          <Superscript size={14} />
        </ToolbarButton>
      </div>

      <div className="w-px h-7 bg-gray-200 mx-0.5" />

      {/* ── Colors ── */}
      <div className="flex items-center gap-0.5 bg-gray-50 rounded-lg px-0.5 py-0.5">
        <label className="relative" title="Text Color">
          <div className="p-1.5 rounded-md hover:bg-gray-200/70 cursor-pointer flex flex-col items-center transition-colors">
            <Palette size={14} className="text-gray-600" />
            <div className="w-3.5 h-0.5 rounded-full mt-px" style={{ backgroundColor: editor.getAttributes('textStyle').color || '#000000' }} />
          </div>
          <input type="color" className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            value={editor.getAttributes('textStyle').color || '#000000'}
            onChange={e => editor.chain().focus().setColor(e.target.value).run()} />
        </label>
        <label className="relative" title="Highlight Color">
          <div className="p-1.5 rounded-md hover:bg-gray-200/70 cursor-pointer flex flex-col items-center transition-colors">
            <Highlighter size={14} className="text-gray-600" />
            <div className="w-3.5 h-0.5 rounded-full mt-px" style={{ backgroundColor: editor.getAttributes('highlight')?.color || '#fef08a' }} />
          </div>
          <input type="color" className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            value={editor.getAttributes('highlight')?.color || '#fef08a'}
            onChange={e => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()} />
        </label>
      </div>

      <div className="w-px h-7 bg-gray-200 mx-0.5" />

      {/* ── Alignment ── */}
      <div className="flex items-center gap-0.5 bg-gray-50 rounded-lg px-0.5 py-0.5">
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align Left">
          <AlignLeft size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align Center">
          <AlignCenter size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align Right">
          <AlignRight size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="Justify">
          <AlignJustify size={14} />
        </ToolbarButton>
      </div>

      <div className="w-px h-7 bg-gray-200 mx-0.5" />

      {/* ── Lists ── */}
      <div className="flex items-center gap-0.5 bg-gray-50 rounded-lg px-0.5 py-0.5">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered List">
          <ListOrdered size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => { try { editor.chain().focus().sinkListItem('listItem').run(); } catch { /* not in list */ } }} title="Increase Indent">
          <Indent size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => { try { editor.chain().focus().liftListItem('listItem').run(); } catch { /* not in list */ } }} title="Decrease Indent">
          <Outdent size={14} />
        </ToolbarButton>
      </div>

      <div className="w-px h-7 bg-gray-200 mx-0.5" />

      {/* ── Styles ── */}
      <div className="flex items-center gap-0.5 bg-gray-50 rounded-lg px-0.5 py-0.5">
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1">
          <Heading1 size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
          <Heading2 size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">
          <Heading3 size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setParagraph().run()} active={editor.isActive('paragraph')} title="Normal Text">
          <Type size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Quote">
          <Quote size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code Block">
          <Code size={14} />
        </ToolbarButton>
      </div>

      <div className="w-px h-7 bg-gray-200 mx-0.5" />

      {/* ── Find ── */}
      <ToolbarButton onClick={onFindReplace} title="Find & Replace (Ctrl+H)">
        <Search size={14} />
      </ToolbarButton>
    </div>
  );
}
