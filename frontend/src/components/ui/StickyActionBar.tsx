import React from 'react';

interface StickyActionBarProps {
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
  /** Pins the bar to the viewport bottom for pages that scroll normally. */
  sticky?: boolean;
}

/**
 * Persistent action bar used by the campaign wizard and other long forms.
 */
export default function StickyActionBar({ left, center, right, sticky = false }: StickyActionBarProps) {
  return (
    <div
      className={`border-t border-gray-200 bg-white/95 backdrop-blur-sm shadow-[0_-2px_8px_rgba(0,0,0,0.04)] ${
        sticky ? 'sticky bottom-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8' : ''
      }`}
    >
      <div className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            {left}
          </div>

          <div className="hidden sm:flex items-center justify-center flex-1 min-w-0">
            {center}
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {right}
          </div>
        </div>
      </div>
      <div className="pb-[env(safe-area-inset-bottom)]" />
    </div>
  );
}
