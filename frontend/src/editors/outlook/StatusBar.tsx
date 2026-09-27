import type { Editor } from '@tiptap/react';
import { Type, Hash, Clock, ImageIcon } from 'lucide-react';

interface Props {
  editor: Editor;
}

export default function StatusBar({ editor }: Props) {
  const text = editor.getText();
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  const readTime = Math.max(1, Math.ceil(words / 200));

  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-gray-50/80 text-[11px] text-gray-400 select-none flex-shrink-0">
      <div className="flex items-center gap-5">
        <span className="flex items-center gap-1.5">
          <Type size={11} className="text-gray-300" />
          <span className="tabular-nums font-medium">{words.toLocaleString()}</span> words
        </span>
        <span className="flex items-center gap-1.5">
          <Hash size={11} className="text-gray-300" />
          <span className="tabular-nums font-medium">{chars.toLocaleString()}</span> chars
        </span>
        <span className="flex items-center gap-1.5">
          <Clock size={11} className="text-gray-300" />
          ~{readTime} min read
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-gray-300">
        <ImageIcon size={11} />
        <span>Paste or drag images into editor</span>
      </div>
    </div>
  );
}
