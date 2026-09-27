import { useState, useRef, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import {
  ImageIcon, Link, Table2, Minus, Smile,
  RectangleHorizontal, Columns2, ArrowDownFromLine, MessageSquareQuote,
  MousePointer2, FileSignature, ChevronDown, Search, Braces,
} from 'lucide-react';
import ToolbarButton from './ToolbarButton';
import type { MergeFieldDefinition } from '../../types';

interface Props {
  editor: Editor;
  onImageDialog: () => void;
  onLinkDialog: () => void;
  onTableDialog: () => void;
  mergeFields?: MergeFieldDefinition[];
  onInsertMergeField?: (key: string) => void;
  onSignature?: () => void;
}

const EMOJI_LIST = [
  '😀', '😂', '😊', '🥰', '😎', '🤔', '👍', '👋', '❤️', '🔥',
  '✨', '🎉', '🚀', '💡', '⭐', '✅', '❌', '⚠️', '📌', '💬',
  '📧', '📎', '🗓️', '🏷️', '💼', '🎯', '📊', '🔗', '🌟', '💪',
];

export default function InsertTab({
  editor, onImageDialog, onLinkDialog, onTableDialog,
  mergeFields = [], onInsertMergeField, onSignature,
}: Props) {
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [showBlocks, setShowBlocks] = useState(false);
  const [mergeSearch, setMergeSearch] = useState('');
  const emojiRef = useRef<HTMLDivElement>(null);
  const mergeRef = useRef<HTMLDivElement>(null);
  const blocksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmoji(false);
      if (mergeRef.current && !mergeRef.current.contains(e.target as Node)) setShowMerge(false);
      if (blocksRef.current && !blocksRef.current.contains(e.target as Node)) setShowBlocks(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const insertBlock = (type: string) => {
    setShowBlocks(false);
    switch (type) {
      case 'cta':
        editor.chain().focus().insertContent({
          type: 'ctaButton',
          attrs: { text: 'Click Here', url: '#', bgColor: '#6366f1', textColor: '#ffffff', size: 'medium', borderRadius: 8, fullWidth: false },
        }).run();
        break;
      case 'divider':
        editor.chain().focus().insertContent({ type: 'emailDivider' }).run();
        break;
      case 'spacer':
        editor.chain().focus().insertContent({ type: 'emailSpacer', attrs: { height: 32 } }).run();
        break;
      case 'callout':
        editor.chain().focus().insertContent({
          type: 'calloutBox',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Type your callout text here...' }] }],
        }).run();
        break;
      case 'columns':
        editor.chain().focus().insertContent({
          type: 'columnsLayout',
          content: [
            { type: 'columnLeft', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Left column content' }] }] },
            { type: 'columnRight', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Right column content' }] }] },
          ],
        }).run();
        break;
    }
  };

  const insertMergeField = (key: string) => {
    setShowMerge(false);
    setMergeSearch('');
    if (onInsertMergeField) {
      onInsertMergeField(key);
    } else {
      editor.chain().focus().insertContent({
        type: 'mergeField',
        attrs: { name: key },
      }).run();
    }
  };

  const insertEmoji = (emoji: string) => {
    setShowEmoji(false);
    editor.chain().focus().insertContent(emoji).run();
  };

  const filtered = mergeFields.filter(f =>
    f.key.toLowerCase().includes(mergeSearch.toLowerCase()) ||
    f.label.toLowerCase().includes(mergeSearch.toLowerCase())
  );
  const systemFields = filtered.filter(f => f.is_system);
  const uploadedFields = filtered.filter(f => f.source_kind === 'uploaded_column' && !f.is_system);
  const customFields = filtered.filter(f => (f.source_kind === 'custom' || !f.source_kind) && !f.is_system);

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1">
      <ToolbarButton onClick={onImageDialog} title="Insert Image">
        <ImageIcon size={15} />
      </ToolbarButton>
      <ToolbarButton onClick={onLinkDialog} title="Insert Link (Ctrl+K)">
        <Link size={15} />
      </ToolbarButton>
      <ToolbarButton onClick={onTableDialog} title="Insert Table">
        <Table2 size={15} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">
        <Minus size={15} />
      </ToolbarButton>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      <div className="relative" ref={blocksRef}>
        <button
          type="button"
          onClick={() => setShowBlocks(!showBlocks)}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
        >
          <RectangleHorizontal size={14} />
          Blocks
          <ChevronDown size={12} className={`transition-transform ${showBlocks ? 'rotate-180' : ''}`} />
        </button>
        {showBlocks && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 w-56 py-1.5">
            <DropdownItem icon={<MousePointer2 size={14} />} label="CTA Button" desc="Call-to-action button" onClick={() => insertBlock('cta')} />
            <DropdownItem icon={<Columns2 size={14} />} label="Two Columns" desc="Side-by-side layout" onClick={() => insertBlock('columns')} />
            <DropdownItem icon={<Minus size={14} />} label="Divider" desc="Horizontal line separator" onClick={() => insertBlock('divider')} />
            <DropdownItem icon={<ArrowDownFromLine size={14} />} label="Spacer" desc="Vertical space" onClick={() => insertBlock('spacer')} />
            <DropdownItem icon={<MessageSquareQuote size={14} />} label="Callout Box" desc="Highlighted info block" onClick={() => insertBlock('callout')} />
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      <div className="relative" ref={emojiRef}>
        <ToolbarButton onClick={() => setShowEmoji(!showEmoji)} title="Insert Emoji">
          <Smile size={15} />
        </ToolbarButton>
        {showEmoji && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-2.5 w-[260px]">
            <div className="grid grid-cols-10 gap-0.5">
              {EMOJI_LIST.map(emoji => (
                <button key={emoji} type="button" onClick={() => insertEmoji(emoji)}
                  className="w-6 h-6 flex items-center justify-center text-base hover:bg-gray-100 rounded transition-colors cursor-pointer">
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Merge Fields — always available under Insert */}
      <div className="w-px h-6 bg-gray-200 mx-1" />
      <div className="relative" ref={mergeRef}>
        <button
          type="button"
          onClick={() => setShowMerge(!showMerge)}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-md transition-colors cursor-pointer"
        >
          <Braces size={14} />
          <span>Merge Fields</span>
          <ChevronDown size={12} className={`transition-transform ${showMerge ? 'rotate-180' : ''}`} />
        </button>
        {showMerge && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 w-72 py-2">
            <div className="px-2 mb-2">
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={mergeSearch}
                  onChange={e => setMergeSearch(e.target.value)}
                  placeholder="Search fields…"
                  className="w-full text-xs pl-7 pr-2 py-1.5 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-1 focus:ring-brand-500/30 outline-none"
                  aria-label="Search merge fields"
                />
              </div>
            </div>
            <div className="max-h-[220px] overflow-y-auto px-1">
              {uploadedFields.length > 0 && (
                <MergeGroup label="Recipient" fields={uploadedFields} onInsert={insertMergeField} />
              )}
              {customFields.length > 0 && (
                <MergeGroup label="Custom" fields={customFields} onInsert={insertMergeField} />
              )}
              {systemFields.length > 0 && (
                <MergeGroup label="System" fields={systemFields} onInsert={insertMergeField} />
              )}
              {filtered.length === 0 && (
                <p className="text-xs text-gray-400 px-3 py-2">
                  {mergeSearch ? 'No fields match' : 'No merge fields configured — add them in the template or campaign setup'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {onSignature && (
        <ToolbarButton onClick={onSignature} title="Insert Signature">
          <FileSignature size={15} />
        </ToolbarButton>
      )}
    </div>
  );
}

function MergeGroup({
  label, fields, onInsert,
}: {
  label: string;
  fields: MergeFieldDefinition[];
  onInsert: (key: string) => void;
}) {
  return (
    <div className="mb-1">
      <div className="px-2 py-1 text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</div>
      {fields.map(f => (
        <button
          key={f.key}
          type="button"
          onClick={() => onInsert(f.key)}
          className="w-full text-left px-3 py-1.5 text-sm hover:bg-brand-50 transition-colors flex items-center gap-2 cursor-pointer"
          title={`Insert {{${f.key}}}${f.default_value ? ` (default: ${f.default_value})` : ''}`}
        >
          <span className="text-brand-600 font-mono text-xs">{`{{${f.key}}}`}</span>
          <span className="text-gray-500 text-xs truncate flex-1">{f.label}</span>
          {f.default_value && (
            <span className="text-[10px] text-amber-600 italic truncate max-w-[80px]">= {f.default_value}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function DropdownItem({ icon, label, desc, onClick }: { icon: React.ReactNode; label: string; desc: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors flex items-center gap-2.5 cursor-pointer">
      <div className="text-gray-400 flex-shrink-0">{icon}</div>
      <div>
        <div className="text-sm font-medium text-gray-700">{label}</div>
        <div className="text-[11px] text-gray-400">{desc}</div>
      </div>
    </button>
  );
}
