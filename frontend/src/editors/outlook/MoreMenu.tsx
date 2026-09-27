import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Code, Eye, Copy, Maximize2, Keyboard, Search, MoreHorizontal,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  editor: Editor;
  isAdmin?: boolean;
  onFocusMode?: () => void;
  onFindReplace?: () => void;
  onViewHtml?: () => void;
  onEditHtml?: () => void;
}

export default function MoreMenu({ editor, isAdmin, onFocusMode, onFindReplace, onViewHtml, onEditHtml }: Props) {
  const [open, setOpen] = useState(false);

  const copyHtml = () => {
    const html = editor.getHTML();
    navigator.clipboard.writeText(html).then(() => {
      toast.success('HTML copied to clipboard');
    }).catch(() => {
      toast.error('Failed to copy');
    });
    setOpen(false);
  };

  const items = [
    { icon: Eye, label: 'View generated HTML', onClick: () => { onViewHtml?.(); setOpen(false); } },
    { icon: Copy, label: 'Copy HTML', onClick: copyHtml },
    ...(isAdmin ? [{ icon: Code, label: 'Edit HTML source', onClick: () => { onEditHtml?.(); setOpen(false); }, danger: true }] : []),
    { divider: true } as any,
    { icon: Maximize2, label: 'Focus mode', onClick: () => { onFocusMode?.(); setOpen(false); }, shortcut: 'Ctrl+Shift+F' },
    { icon: Search, label: 'Find & Replace', onClick: () => { onFindReplace?.(); setOpen(false); }, shortcut: 'Ctrl+H' },
    { icon: Keyboard, label: 'Keyboard shortcuts', onClick: () => { showShortcuts(); setOpen(false); } },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="More actions"
        aria-expanded={open}
      >
        <MoreHorizontal size={14} />
        <span className="hidden sm:inline">More</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px]">
            {items.map((item, i) => {
              if (item.divider) {
                return <div key={i} className="h-px bg-gray-100 my-1" />;
              }
              const Icon = item.icon;
              return (
                <button
                  key={i}
                  onClick={item.onClick}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-gray-50 transition-colors ${
                    item.danger ? 'text-red-600' : 'text-gray-700'
                  }`}
                >
                  <Icon size={14} className={item.danger ? 'text-red-500' : 'text-gray-400'} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.shortcut && <span className="text-[10px] text-gray-400">{item.shortcut}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function showShortcuts() {
  toast((_t) => (
    <div className="text-xs space-y-1">
      <p className="font-semibold mb-2">Keyboard Shortcuts</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-gray-500">Bold</span><span className="font-mono">Ctrl+B</span>
        <span className="text-gray-500">Italic</span><span className="font-mono">Ctrl+I</span>
        <span className="text-gray-500">Underline</span><span className="font-mono">Ctrl+U</span>
        <span className="text-gray-500">Link</span><span className="font-mono">Ctrl+K</span>
        <span className="text-gray-500">Undo</span><span className="font-mono">Ctrl+Z</span>
        <span className="text-gray-500">Redo</span><span className="font-mono">Ctrl+Y</span>
        <span className="text-gray-500">Find</span><span className="font-mono">Ctrl+F</span>
        <span className="text-gray-500">Merge field</span><span className="font-mono">Ctrl+Shift+M</span>
        <span className="text-gray-500">Focus mode</span><span className="font-mono">Ctrl+Shift+F</span>
        <span className="text-gray-500">Save</span><span className="font-mono">Ctrl+S</span>
      </div>
    </div>
  ), { duration: 6000, position: 'bottom-right' });
}
