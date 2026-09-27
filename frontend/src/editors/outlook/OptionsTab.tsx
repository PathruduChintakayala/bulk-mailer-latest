import type { Editor } from '@tiptap/react';
import {
  Undo, Redo, RemoveFormatting, Copy, FileText,
  ExternalLink, Minimize,
} from 'lucide-react';
import ToolbarButton from './ToolbarButton';
import toast from 'react-hot-toast';

interface Props {
  editor: Editor;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export default function OptionsTab({ editor, isFullscreen, onToggleFullscreen }: Props) {
  const copyHtml = () => {
    const html = editor.getHTML();
    navigator.clipboard.writeText(html).then(() => toast.success('HTML copied'));
  };

  const copyPlainText = () => {
    const text = editor.getText();
    navigator.clipboard.writeText(text).then(() => toast.success('Plain text copied'));
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-3 py-1.5">
      {/* ── Undo / Redo ── */}
      <div className="flex items-center gap-0.5 bg-gray-50 rounded-lg px-1 py-0.5">
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo (Ctrl+Z)">
          <Undo size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo (Ctrl+Y)">
          <Redo size={15} />
        </ToolbarButton>
      </div>

      <div className="w-px h-6 bg-gray-200 mx-1.5" />

      {/* ── Formatting ── */}
      <ToolbarButton onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="Clear Formatting">
        <RemoveFormatting size={15} />
      </ToolbarButton>

      <div className="w-px h-6 bg-gray-200 mx-1.5" />

      {/* ── Copy ── */}
      <div className="flex items-center gap-0.5 bg-gray-50 rounded-lg px-1 py-0.5">
        <ToolbarButton onClick={copyHtml} title="Copy HTML">
          <Copy size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={copyPlainText} title="Copy Plain Text">
          <FileText size={15} />
        </ToolbarButton>
      </div>

      <div className="w-px h-6 bg-gray-200 mx-1.5" />

      {/* ── Pop-out ── */}
      <ToolbarButton onClick={onToggleFullscreen} title={isFullscreen ? 'Close pop-out' : 'Pop-out editor'}>
        {isFullscreen ? <Minimize size={15} /> : <ExternalLink size={15} />}
      </ToolbarButton>
    </div>
  );
}
