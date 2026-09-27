import React from 'react';

interface Props {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Rendered before the title, e.g. a back button. */
  leading?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, actions, leading }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {leading}
        <div className="min-w-0">
          <h1 className="page-title truncate">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap min-w-0 sm:shrink-0 sm:justify-end sm:pt-0.5">
          {actions}
        </div>
      )}
    </div>
  );
}
