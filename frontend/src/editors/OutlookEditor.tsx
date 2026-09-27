import { useState, useCallback, useEffect } from 'react';
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Placeholder from '@tiptap/extension-placeholder';
import Dropcursor from '@tiptap/extension-dropcursor';
import Gapcursor from '@tiptap/extension-gapcursor';
import CharacterCount from '@tiptap/extension-character-count';
import {
  Bold, Italic, Underline as UnderlineIcon, Link as LinkIcon,
  Strikethrough, Highlighter,
  Braces, Eraser,
} from 'lucide-react';
import type { ThemeConfig, MergeFieldDefinition, SenderIdentity } from '../types';
import api from '../services/api';
import { absoluteAssetUrl } from '../constants/assets';
import toast from 'react-hot-toast';

// Custom extensions
import {
  MergeFieldExtension,
  DividerExtension,
  SpacerExtension,
  CalloutExtension,
  CTAButtonExtension,
  ColumnsExtension,
  ColumnLeft,
  ColumnRight,
  ResizableImage,
} from './outlook/extensions/email-blocks';
import { SearchReplace } from './outlook/extensions/search-replace';
import { PasteHandler } from './outlook/extensions/paste-handler';
import { useEditorValidation } from './outlook/useEditorValidation';

// Outlook sub-components
import RibbonToolbar from './outlook/RibbonToolbar';
import StatusBar from './outlook/StatusBar';
import ImageDialog from './outlook/ImageDialog';
import LinkDialog from './outlook/LinkDialog';
import TableDialog from './outlook/TableDialog';
import { TableFloatingToolbar } from './outlook/TableDialog';
import FindReplace from './outlook/FindReplace';
import EmailCanvas from './outlook/EmailCanvas';
import ComposeWorkspace from './outlook/ComposeWorkspace';

// ─── Font Size Extension (via TextStyle mark) ───
const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.fontSize || null,
        renderHTML: (attributes: Record<string, any>) => {
          if (!attributes.fontSize) return {};
          return { style: `font-size: ${attributes.fontSize}` };
        },
      },
    };
  },
});

interface OutlookEditorProps {
  initialHtml?: string;
  onChange?: (html: string) => void;
  onJsonChange?: (json: string) => void;
  mergeFields?: { name: string; label: string }[];
  themeConfig?: ThemeConfig | null;
  // Compose workspace props (optional — used when embedded in campaign/template)
  editorContext?: 'campaign' | 'template';
  subject?: string;
  onSubjectChange?: (value: string) => void;
  preheader?: string;
  onPreheaderChange?: (value: string) => void;
  senderIdentity?: SenderIdentity | null;
  onChangeSender?: () => void;
  totalRecipients?: number;
  suppressedCount?: number;
  onViewRecipients?: () => void;
  campaignMergeFields?: MergeFieldDefinition[];
  onInsertMergeField?: (key: string) => void;
  onThemeChange?: (theme: ThemeConfig | null) => void;
  sidePanel?: React.ReactNode;
  isAdmin?: boolean;
  onFocusMode?: () => void;
  onSave?: () => void;
  onReviewSend?: () => void;
  onRequestHtmlMode?: () => void;
}

export default function OutlookEditor({
  initialHtml,
  onChange,
  onJsonChange,
  mergeFields: _mergeFields = [],
  themeConfig,
  editorContext,
  subject = '',
  onSubjectChange,
  preheader = '',
  onPreheaderChange,
  senderIdentity,
  onChangeSender,
  totalRecipients,
  suppressedCount,
  onViewRecipients,
  campaignMergeFields = [],
  onInsertMergeField,
  onThemeChange,
  sidePanel,
  isAdmin,
  onFocusMode,
  onSave,
  onReviewSend,
  onRequestHtmlMode,
}: OutlookEditorProps) {
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showTableDialog, setShowTableDialog] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [isPoppedOut, setIsPoppedOut] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        dropcursor: false,
        gapcursor: false,
      }),
      Underline,
      Subscript,
      Superscript,
      FontSize,
      FontFamily.configure({ types: ['textStyle'] }),
      Color.configure({ types: ['textStyle'] }),
      Highlight.configure({ multicolor: true }),
      Typography,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer' },
      }),
      ResizableImage,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({ placeholder: 'Start composing your email...' }),
      Dropcursor.configure({ color: '#6366f1', width: 2 }),
      Gapcursor,
      CharacterCount,
      MergeFieldExtension,
      DividerExtension,
      SpacerExtension,
      CalloutExtension,
      CTAButtonExtension,
      ColumnsExtension,
      ColumnLeft,
      ColumnRight,
      SearchReplace,
      PasteHandler,
    ],
    content: initialHtml || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange?.(html);
      onJsonChange?.(JSON.stringify(editor.getJSON()));
    },
    editorProps: {
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false;
        const file = event.dataTransfer?.files?.[0];
        if (file && file.type.startsWith('image/')) {
          event.preventDefault();
          uploadAndInsertImage(file);
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) uploadAndInsertImage(file);
            return true;
          }
        }
        return false;
      },
    },
  });

  // Image upload via server
  const uploadAndInsertImage = useCallback(async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/assets/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = absoluteAssetUrl(res.data.url);
      editor?.chain().focus().setImage({ src: url }).run();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Image upload failed');
    }
  }, [editor]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!editor) return;
    const handleKeyboard = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'k' || e.key === 'K') { e.preventDefault(); setShowLinkDialog(true); }
        if (e.key === 'f' || e.key === 'F') { e.preventDefault(); setShowFindReplace(true); }
        if (e.key === 'h' || e.key === 'H') { e.preventDefault(); setShowFindReplace(true); }
        if (e.key === 's' || e.key === 'S') { e.preventDefault(); onSave?.(); }
        if (e.shiftKey && (e.key === 'm' || e.key === 'M')) {
          e.preventDefault();
          // Insert merge field — trigger picker
          if (campaignMergeFields.length > 0 && onInsertMergeField) {
            onInsertMergeField(campaignMergeFields[0].key);
          }
        }
        if (e.shiftKey && (e.key === 'f' || e.key === 'F') && !e.altKey) {
          // Ctrl+Shift+F → Focus mode (only if not Ctrl+F find)
          if (e.shiftKey) { e.preventDefault(); onFocusMode?.(); }
        }
        if (e.key === 'Enter') { e.preventDefault(); onReviewSend?.(); }
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [editor, onSave, onFocusMode, onReviewSend, campaignMergeFields, onInsertMergeField]);

  // Pop-out toggle
  const handlePopout = useCallback(() => {
    setIsPoppedOut(prev => !prev);
    if (!isPoppedOut) toast.success('Editor expanded');
  }, [isPoppedOut]);

  // Basic validation issues
  const validationIssues = useEditorValidation(editor, {
    subject,
    preheader,
    mergeFields: campaignMergeFields,
    editorContext,
  });

  // Handle merge field insertion. Declared before the early return below so
  // the hooks run in the same order on every render.
  const handleMergeFieldInsert = useCallback((key: string) => {
    if (editor && key) {
      editor.chain().focus().insertContent({
        type: 'mergeField',
        attrs: { name: key },
      }).run();
    }
    onInsertMergeField?.(key);
  }, [editor, onInsertMergeField]);

  if (!editor) return null;

  // Theme CSS variables
  const themeVars: React.CSSProperties = themeConfig ? {
    '--theme-bg': themeConfig.backgroundColor,
    '--theme-text': themeConfig.textColor,
    '--theme-heading': themeConfig.headingColor,
    '--theme-link': themeConfig.linkColor,
    '--theme-primary': themeConfig.primaryColor,
    '--theme-secondary': themeConfig.secondaryColor,
    '--theme-accent': themeConfig.accentColor,
    '--theme-btn': themeConfig.buttonColor,
    '--theme-btn-text': themeConfig.buttonTextColor,
  } as React.CSSProperties : {};

  // ─── Ribbon component ─────────────────────────────────────────────
  const ribbonNode = (
    <>
      <RibbonToolbar
        editor={editor}
        onFindReplace={() => setShowFindReplace(!showFindReplace)}
        onImageDialog={() => setShowImageDialog(true)}
        onLinkDialog={() => setShowLinkDialog(true)}
        onTableDialog={() => setShowTableDialog(true)}
        onFocusMode={onFocusMode}
        onViewHtml={onRequestHtmlMode}
        onEditHtml={onRequestHtmlMode}
        isAdmin={isAdmin}
        mergeFields={campaignMergeFields}
        onInsertMergeField={handleMergeFieldInsert}
        themeConfig={themeConfig}
        onThemeChange={onThemeChange}
        validationIssues={validationIssues}
        editorMode="visual"
        onEditorModeChange={(mode) => { if (mode === 'html') onRequestHtmlMode?.(); }}
      />
      {/* Find & Replace bar */}
      <FindReplace open={showFindReplace} onClose={() => setShowFindReplace(false)} editor={editor} />
      {/* Table floating toolbar */}
      {editor.isActive('table') && (
        <div className="flex justify-center px-3 pt-1 bg-white">
          <TableFloatingToolbar editor={editor} />
        </div>
      )}
    </>
  );

  // ─── Canvas (email body) — full width of compose pane ─────────────
  const canvasNode = (
    <EmailCanvas contentBackground={themeConfig?.backgroundColor || '#ffffff'}>
      <div className="outlook-editor-content w-full" style={{ ...themeVars, color: themeConfig?.textColor || '#1f2937' }}>
        <div className="prose prose-sm max-w-none w-full p-4 sm:p-6 min-h-[400px]">
          <EditorContent editor={editor} />
        </div>
      </div>
    </EmailCanvas>
  );

  // ─── Bubble Menu ──────────────────────────────────────────────────
  const bubbleMenuNode = (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 150, placement: 'top', maxWidth: 'none' }}
      shouldShow={({ editor, from, to }) => {
        if (editor.isActive('image') || editor.isActive('table')) return false;
        return from !== to;
      }}
    >
      <div className="flex items-center gap-0.5 bg-gray-900/95 backdrop-blur-sm rounded-xl px-1.5 py-1 shadow-xl border border-gray-700">
        <BubbleBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
          <Bold size={13} />
        </BubbleBtn>
        <BubbleBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
          <Italic size={13} />
        </BubbleBtn>
        <BubbleBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
          <UnderlineIcon size={13} />
        </BubbleBtn>
        <BubbleBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
          <Strikethrough size={13} />
        </BubbleBtn>
        <div className="w-px h-4 bg-gray-600 mx-0.5" />
        <BubbleBtn onClick={() => setShowLinkDialog(true)} title="Link">
          <LinkIcon size={13} />
        </BubbleBtn>
        <label className="p-1 rounded-md hover:bg-white/10 cursor-pointer text-white/90" title="Highlight">
          <Highlighter size={13} />
          <input type="color" className="sr-only" onChange={e => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()} />
        </label>
        <div className="w-px h-4 bg-gray-600 mx-0.5" />
        <BubbleBtn
          onClick={() => {
            const first = campaignMergeFields[0]?.key;
            if (first) handleMergeFieldInsert(first);
            else toast.error('No merge fields yet. Add recipients with columns first.');
          }}
          title="Insert merge field"
        >
          <Braces size={13} />
        </BubbleBtn>
        <BubbleBtn onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="Clear formatting">
          <Eraser size={13} />
        </BubbleBtn>
      </div>
    </BubbleMenu>
  );

  // ─── If editorContext is set, render full ComposeWorkspace ─────────
  if (editorContext) {
    return (
      <div className={`outlook-editor flex flex-col h-full min-h-0 ${isPoppedOut ? 'fixed inset-4 z-50 shadow-2xl rounded-xl' : ''}`} style={themeVars}>
        <ComposeWorkspace
          editorContext={editorContext}
          senderIdentity={senderIdentity}
          onChangeSender={onChangeSender}
          totalRecipients={totalRecipients}
          suppressedCount={suppressedCount}
          onViewRecipients={onViewRecipients}
          subject={subject}
          onSubjectChange={onSubjectChange || (() => {})}
          preheader={preheader}
          onPreheaderChange={onPreheaderChange || (() => {})}
          mergeFields={campaignMergeFields}
          onInsertMergeField={handleMergeFieldInsert}
          ribbon={ribbonNode}
          canvas={canvasNode}
          sidePanel={sidePanel}
        />
        {bubbleMenuNode}
        {/* Dialogs */}
        <ImageDialog open={showImageDialog} onClose={() => setShowImageDialog(false)} editor={editor} />
        <LinkDialog open={showLinkDialog} onClose={() => setShowLinkDialog(false)} editor={editor} />
        <TableDialog open={showTableDialog} onClose={() => setShowTableDialog(false)} editor={editor} />
        {/* Pop-out backdrop */}
        {isPoppedOut && <div className="fixed inset-0 bg-black/30 backdrop-blur-sm -z-10" onClick={handlePopout} />}
      </div>
    );
  }

  // Standalone (no editorContext): still full-width canvas + ribbon HTML tab
  return (
    <div className={`outlook-editor flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden ${isPoppedOut ? 'fixed inset-4 z-50 shadow-2xl' : ''}`} style={themeVars}>
      {ribbonNode}
      {themeConfig && (
        <div className="h-1 flex-shrink-0" style={{
          background: `linear-gradient(to right, ${themeConfig.primaryColor || '#4f46e5'}, ${themeConfig.secondaryColor || '#6366f1'}, ${themeConfig.accentColor || '#818cf8'})`,
        }} />
      )}
      {canvasNode}
      {bubbleMenuNode}
      <StatusBar editor={editor} />
      <ImageDialog open={showImageDialog} onClose={() => setShowImageDialog(false)} editor={editor} />
      <LinkDialog open={showLinkDialog} onClose={() => setShowLinkDialog(false)} editor={editor} />
      <TableDialog open={showTableDialog} onClose={() => setShowTableDialog(false)} editor={editor} />
      {isPoppedOut && <div className="fixed inset-0 bg-black/30 backdrop-blur-sm -z-10" onClick={handlePopout} />}
    </div>
  );
}

function BubbleBtn({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      className={`p-1 rounded-md text-white/90 transition-colors ${active ? 'bg-white/20 text-white' : 'hover:bg-white/10'}`}>
      {children}
    </button>
  );
}
