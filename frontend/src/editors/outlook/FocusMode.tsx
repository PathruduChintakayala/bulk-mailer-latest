import React, { useEffect, useCallback } from 'react';
import { X, Maximize2 } from 'lucide-react';

interface FocusModeProps {
  children: React.ReactNode;
  onExit: () => void;
}

/**
 * Full-screen focus mode overlay. Strips chrome, shows only the editor canvas.
 * Exit via Escape key or close button.
 */
export default function FocusMode({ children, onExit }: FocusModeProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onExit();
    }
  }, [onExit]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 bg-gray-100 dark:bg-gray-900 flex flex-col items-center">
      {/* Minimal header */}
      <div className="w-full flex justify-between items-center px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Maximize2 size={14} />
          <span>Focus Mode</span>
        </div>
        <button
          onClick={onExit}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
          title="Exit focus mode (Esc)"
        >
          <X size={18} />
        </button>
      </div>

      {/* Editor content */}
      <div className="flex-1 w-full max-w-[720px] overflow-y-auto py-8 px-4">
        {children}
      </div>
    </div>
  );
}
