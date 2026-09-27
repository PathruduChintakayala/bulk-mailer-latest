import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Image as ImageIcon, Link as LinkIcon,
  Table as TableIcon, Heading1, Heading2, Heading3,
  Code, Quote, Undo, Redo, Type, Palette,
} from 'lucide-react';

interface Props {
  content: string;
  onChange: (html: string) => void;
  onJsonChange: (json: string) => void;
  mergeFields: string[];
}

export default function TipTapEditor({ content, onChange, onJsonChange, mergeFields }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: true, allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({ placeholder: 'Start composing your email...' }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      onJsonChange(JSON.stringify(editor.getJSON()));
    },
  });

  if (!editor) return null;

  const addImage = () => {
    const url = prompt('Enter image URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const addLink = () => {
    const url = prompt('Enter URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const insertMergeField = (field: string) => {
    editor.chain().focus().insertContent(`{{${field}}}`).run();
  };

  const addTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="border-b border-gray-200 bg-gray-50 px-2 py-1.5 flex flex-wrap items-center gap-0.5">
        {/* Text formatting */}
        <ToolbarGroup>
          <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
            <Bold size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
            <Italic size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
            <UnderlineIcon size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
            <Strikethrough size={16} />
          </ToolbarButton>
        </ToolbarGroup>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Headings */}
        <ToolbarGroup>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1">
            <Heading1 size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
            <Heading2 size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">
            <Heading3 size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setParagraph().run()} active={editor.isActive('paragraph')} title="Paragraph">
            <Type size={16} />
          </ToolbarButton>
        </ToolbarGroup>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Alignment */}
        <ToolbarGroup>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align Left">
            <AlignLeft size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align Center">
            <AlignCenter size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align Right">
            <AlignRight size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="Justify">
            <AlignJustify size={16} />
          </ToolbarButton>
        </ToolbarGroup>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Lists */}
        <ToolbarGroup>
          <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
            <List size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered List">
            <ListOrdered size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote">
            <Quote size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code Block">
            <Code size={16} />
          </ToolbarButton>
        </ToolbarGroup>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Insert */}
        <ToolbarGroup>
          <ToolbarButton onClick={addImage} title="Insert Image">
            <ImageIcon size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={addLink} title="Insert Link">
            <LinkIcon size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={addTable} title="Insert Table">
            <TableIcon size={16} />
          </ToolbarButton>
        </ToolbarGroup>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Text Color */}
        <ToolbarGroup>
          <label className="p-1.5 rounded hover:bg-gray-200 cursor-pointer" title="Text Color">
            <Palette size={16} />
            <input
              type="color"
              className="sr-only"
              onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            />
          </label>
        </ToolbarGroup>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Undo/Redo */}
        <ToolbarGroup>
          <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo">
            <Undo size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo">
            <Redo size={16} />
          </ToolbarButton>
        </ToolbarGroup>

        {/* Merge Fields */}
        {mergeFields.length > 0 && (
          <>
            <div className="w-px h-6 bg-gray-300 mx-1" />
            <select
              onChange={(e) => { if (e.target.value) insertMergeField(e.target.value); e.target.value = ''; }}
              className="px-2 py-1 text-xs border border-gray-300 rounded bg-white"
            >
              <option value="">Insert merge field...</option>
              {mergeFields.map((f) => (
                <option key={f} value={f}>{`{{${f}}}`}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Editor Content */}
      <div className="prose max-w-none">
        <EditorContent editor={editor} className="min-h-[400px]" />
      </div>

      {/* Bubble Menu for inline formatting */}
      {editor && (
        <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
          <div className="flex items-center gap-0.5 bg-gray-900 rounded-lg px-1 py-0.5 shadow-lg">
            <BubbleButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')}>
              <Bold size={14} className="text-white" />
            </BubbleButton>
            <BubbleButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')}>
              <Italic size={14} className="text-white" />
            </BubbleButton>
            <BubbleButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')}>
              <UnderlineIcon size={14} className="text-white" />
            </BubbleButton>
            <BubbleButton onClick={addLink}>
              <LinkIcon size={14} className="text-white" />
            </BubbleButton>
          </div>
        </BubbleMenu>
      )}
    </div>
  );
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function ToolbarButton({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded hover:bg-gray-200 transition ${active ? 'bg-gray-200 text-brand-600' : 'text-gray-600'}`}
    >
      {children}
    </button>
  );
}

function BubbleButton({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`p-1 rounded ${active ? 'bg-gray-700' : 'hover:bg-gray-700'}`}
    >
      {children}
    </button>
  );
}
