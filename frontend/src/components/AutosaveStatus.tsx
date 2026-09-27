import { Loader2, Check, AlertCircle, RefreshCw } from 'lucide-react';

interface AutosaveStatusProps {
  status: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt?: Date | null;
  onRetry?: () => void;
}

export default function AutosaveStatus({ status, lastSavedAt, onRetry }: AutosaveStatusProps) {
  if (status === 'idle') return null;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      {status === 'saving' && (
        <>
          <Loader2 size={12} className="animate-spin text-gray-400" />
          <span className="text-gray-500">Saving…</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <Check size={12} className="text-emerald-500" />
          <span className="text-gray-500">
            {lastSavedAt ? `Saved at ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Saved'}
          </span>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle size={12} className="text-red-500" />
          <span className="text-red-600">Save failed</span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1 text-red-600 hover:text-red-700 underline"
            >
              <RefreshCw size={10} /> Retry
            </button>
          )}
        </>
      )}
    </div>
  );
}
