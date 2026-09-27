import { useState, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import { X, ChevronUp, ChevronDown, Replace, ReplaceAll, CaseSensitive, WholeWord } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  editor: Editor;
}

export default function FindReplace({ open, onClose, editor }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const storage = editor.storage.searchReplace;
  const currentIndex = storage?.currentIndex ?? 0;
  const totalMatches = storage?.totalMatches ?? 0;

  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
      // Pre-populate from selection
      const { from, to } = editor.state.selection;
      const selected = editor.state.doc.textBetween(from, to, '');
      if (selected) setSearchTerm(selected);
    } else {
      (editor.commands as any).clearSearch?.();
    }
  }, [open]);

  useEffect(() => {
    (editor.commands as any).setSearchTerm?.(searchTerm);
  }, [searchTerm, editor]);

  useEffect(() => {
    (editor.commands as any).setReplaceTerm?.(replaceTerm);
  }, [replaceTerm, editor]);

  useEffect(() => {
    (editor.commands as any).setMatchCase?.(matchCase);
  }, [matchCase, editor]);

  useEffect(() => {
    (editor.commands as any).setWholeWord?.(wholeWord);
  }, [wholeWord, editor]);

  if (!open) return null;

  const goNext = () => (editor.commands as any).goToNextMatch?.();
  const goPrev = () => (editor.commands as any).goToPreviousMatch?.();
  const replaceOne = () => (editor.commands as any).replaceCurrentMatch?.();
  const replaceAll = () => (editor.commands as any).replaceAllMatches?.();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) goPrev();
      else goNext();
    }
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="border-b border-gray-200 bg-gray-50/80 px-3 py-2 flex items-center gap-2 flex-wrap">
      {/* Search */}
      <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
        <div className="relative flex-1">
          <input
            ref={searchRef}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full pl-2.5 pr-16 py-1.5 text-sm border border-gray-200 rounded-lg focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 outline-none"
            placeholder="Find..."
            aria-label="Find text"
          />
          {searchTerm && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 tabular-nums" aria-live="polite">
              {totalMatches > 0 ? `${currentIndex + 1} of ${totalMatches}` : 'No results'}
            </span>
          )}
        </div>
        <button type="button" onClick={goPrev} title="Previous (Shift+Enter)" aria-label="Previous match" disabled={totalMatches === 0}
          className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 cursor-pointer">
          <ChevronUp size={14} />
        </button>
        <button type="button" onClick={goNext} title="Next (Enter)" aria-label="Next match" disabled={totalMatches === 0}
          className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 cursor-pointer">
          <ChevronDown size={14} />
        </button>
      </div>

      {/* Replace */}
      <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
        <input
          value={replaceTerm}
          onChange={e => setReplaceTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 outline-none"
          placeholder="Replace with..."
          aria-label="Replace with"
        />
        <button type="button" onClick={replaceOne} title="Replace" aria-label="Replace current match" disabled={totalMatches === 0}
          className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 cursor-pointer">
          <Replace size={14} />
        </button>
        <button type="button" onClick={replaceAll} title="Replace All" aria-label="Replace all matches" disabled={totalMatches === 0}
          className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 cursor-pointer">
          <ReplaceAll size={14} />
        </button>
      </div>

      {/* Options */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setMatchCase(!matchCase)}
          title="Match Case"
          aria-label="Match case"
          aria-pressed={matchCase}
          className={`p-1 rounded text-xs font-mono transition-colors cursor-pointer ${matchCase ? 'bg-brand-100 text-brand-700' : 'text-gray-500 hover:bg-gray-200'}`}
        >
          <CaseSensitive size={14} />
        </button>
        <button
          type="button"
          onClick={() => setWholeWord(!wholeWord)}
          title="Whole Word"
          aria-label="Match whole word"
          aria-pressed={wholeWord}
          className={`p-1 rounded text-xs font-mono transition-colors cursor-pointer ${wholeWord ? 'bg-brand-100 text-brand-700' : 'text-gray-500 hover:bg-gray-200'}`}
        >
          <WholeWord size={14} />
        </button>
      </div>

      <button type="button" onClick={onClose} aria-label="Close find and replace" className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 ml-auto cursor-pointer">
        <X size={14} />
      </button>
    </div>
  );
}
