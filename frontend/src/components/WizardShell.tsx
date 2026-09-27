import React from 'react';

interface WizardShellProps {
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}

export default function WizardShell({ header, footer, children }: WizardShellProps) {
  return (
    <div className="flex flex-col h-[calc(100dvh-0px)] lg:h-screen overflow-hidden">
      {/* Header: non-scrolling wizard progress */}
      <div className="shrink-0">{header}</div>

      {/* Content: scrollable wizard step */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </div>
      </div>

      {/* Footer: persistent action bar */}
      <div className="shrink-0">{footer}</div>
    </div>
  );
}
