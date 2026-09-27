import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { getPreviewRecipient } from '../services/api';
import type { PreviewRecipient } from '../types';

interface RecipientPreviewNavigatorProps {
  campaignCode: string;
  onRecipientChange: (recipient: PreviewRecipient) => void;
}

export default function RecipientPreviewNavigator({ campaignCode, onRecipientChange }: RecipientPreviewNavigatorProps) {
  const [recipient, setRecipient] = useState<PreviewRecipient | null>(null);
  const [hasPrev, setHasPrev] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadRecipient = useCallback(async (index: number) => {
    // Cancel any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const data = await getPreviewRecipient(campaignCode, index);
      if (controller.signal.aborted) return;
      
      setRecipient(data.recipient);
      setHasPrev(data.has_previous);
      setHasNext(data.has_next);
      setCurrentIndex(data.recipient.index);
      onRecipientChange(data.recipient);
    } catch (err: any) {
      if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      setError('Failed to load recipient');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [campaignCode, onRecipientChange]);

  useEffect(() => {
    loadRecipient(0);
    return () => { abortRef.current?.abort(); };
  }, [campaignCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePrev = () => {
    if (hasPrev && currentIndex > 0) {
      loadRecipient(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      loadRecipient(currentIndex + 1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') handlePrev();
    if (e.key === 'ArrowRight') handleNext();
  };

  if (error && !recipient) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500">
        <span className="text-red-500">{error}</span>
        <button onClick={() => loadRecipient(currentIndex)} className="text-brand-600 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 text-xs"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="navigation"
      aria-label="Recipient preview navigation"
    >
      <button
        onClick={handlePrev}
        disabled={!hasPrev || loading}
        className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Previous recipient"
      >
        <ChevronLeft size={14} />
      </button>

      <span className="text-gray-600 font-medium whitespace-nowrap">
        {loading ? (
          <Loader2 size={12} className="animate-spin inline" />
        ) : recipient ? (
          `${recipient.display_index} of ${recipient.total.toLocaleString()}`
        ) : (
          '—'
        )}
      </span>

      <button
        onClick={handleNext}
        disabled={!hasNext || loading}
        className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Next recipient"
      >
        <ChevronRight size={14} />
      </button>

      {recipient && (
        <span className="text-gray-400 truncate max-w-[200px] ml-1" title={`${recipient.display_name} <${recipient.email}>`}>
          {recipient.display_name ? `${recipient.display_name} ` : ''}
          <span className="text-gray-300">&lt;{recipient.email}&gt;</span>
        </span>
      )}
    </div>
  );
}
