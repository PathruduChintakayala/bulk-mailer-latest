import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import Modal from '../../components/ui/Modal';
import {
  Minus, Trash2, ToggleRight,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  Merge, Split,
} from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  editor: Editor;
}

export default function TableDialog({ open, onClose, editor }: Props) {
  const [hoverRow, setHoverRow] = useState(0);
  const [hoverCol, setHoverCol] = useState(0);
  const MAX_ROWS = 8;
  const MAX_COLS = 8;

  const insertTable = (rows: number, cols: number) => {
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Insert Table" width="sm">
      <div className="space-y-4">
        {/* Grid picker */}
        <div>
          <p className="text-xs text-gray-500 mb-2">
            {hoverRow > 0 && hoverCol > 0 ? `${hoverRow} × ${hoverCol} table` : 'Hover to select size'}
          </p>
          <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `repeat(${MAX_COLS}, 1fr)` }}>
            {Array.from({ length: MAX_ROWS * MAX_COLS }).map((_, i) => {
              const r = Math.floor(i / MAX_COLS) + 1;
              const c = (i % MAX_COLS) + 1;
              const active = r <= hoverRow && c <= hoverCol;
              return (
                <div
                  key={i}
                  onMouseEnter={() => { setHoverRow(r); setHoverCol(c); }}
                  onClick={() => insertTable(r, c)}
                  className={`w-5 h-5 border rounded-sm cursor-pointer transition-colors ${
                    active ? 'bg-brand-400 border-brand-500' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                  }`}
                />
              );
            })}
          </div>
        </div>
        <div className="text-center">
          <p className="text-[11px] text-gray-400">Click a cell to insert the table</p>
        </div>
      </div>
    </Modal>
  );
}

// ─── Floating Table Toolbar (shown when cursor is inside a table) ───

interface TableToolbarProps {
  editor: Editor;
}

export function TableFloatingToolbar({ editor }: TableToolbarProps) {
  if (!editor.isActive('table')) return null;

  return (
    <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-xl shadow-lg px-2 py-1.5 mb-1">
      <TBtn onClick={() => editor.chain().focus().addRowBefore().run()} title="Add row above">
        <ArrowUp size={13} />
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().addRowAfter().run()} title="Add row below">
        <ArrowDown size={13} />
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().addColumnBefore().run()} title="Add column left">
        <ArrowLeft size={13} />
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().addColumnAfter().run()} title="Add column right">
        <ArrowRight size={13} />
      </TBtn>

      <div className="w-px h-5 bg-gray-200 mx-0.5" />

      <TBtn onClick={() => editor.chain().focus().deleteRow().run()} title="Delete row">
        <Minus size={13} className="text-red-500" />
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().deleteColumn().run()} title="Delete column">
        <Minus size={13} className="text-red-500 rotate-90" />
      </TBtn>

      <div className="w-px h-5 bg-gray-200 mx-0.5" />

      <TBtn onClick={() => editor.chain().focus().toggleHeaderRow().run()} title="Toggle header row">
        <ToggleRight size={13} />
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().mergeCells().run()} title="Merge cells">
        <Merge size={13} />
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().splitCell().run()} title="Split cell">
        <Split size={13} />
      </TBtn>

      <div className="w-px h-5 bg-gray-200 mx-0.5" />

      <TBtn onClick={() => editor.chain().focus().deleteTable().run()} title="Delete table">
        <Trash2 size={13} className="text-red-500" />
      </TBtn>
    </div>
  );
}

function TBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors">
      {children}
    </button>
  );
}
