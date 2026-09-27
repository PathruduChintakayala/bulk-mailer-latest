import { ReactNode } from 'react';

interface EmailCanvasProps {
  children: ReactNode;
  /** Kept for API compatibility; compose area is always full width. */
  contentWidth?: number;
  backgroundColor?: string;
  contentBackground?: string;
}

/**
 * Full-width compose canvas — fills the available editor pane.
 * Email content width (for preview / generated HTML) is controlled separately via Layout tab.
 */
export default function EmailCanvas({
  children,
  backgroundColor = '#ffffff',
  contentBackground = '#ffffff',
}: EmailCanvasProps) {
  return (
    <div
      className="flex-1 overflow-y-auto min-h-0 w-full"
      style={{ backgroundColor }}
    >
      <div
        className="w-full min-h-full"
        style={{
          backgroundColor: contentBackground,
          minHeight: '500px',
        }}
      >
        {children}
      </div>
    </div>
  );
}
