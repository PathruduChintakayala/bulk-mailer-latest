import React from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ElementType;
  count?: number;
}

interface Props<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  size?: 'sm' | 'md';
}

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
  size = 'sm',
}: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex gap-1.5 bg-gray-100/80 p-1 rounded-xl overflow-x-auto ${className}`}
    >
      {options.map(opt => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`flex items-center gap-1.5 rounded-lg font-medium transition-all whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'
            } ${active ? 'bg-white text-gray-900 shadow-soft' : 'text-gray-600 hover:text-gray-900'}`}
          >
            {Icon && <Icon size={size === 'sm' ? 13 : 15} />}
            {opt.label}
            {opt.count !== undefined && (
              <span className={active ? 'text-gray-500' : 'text-gray-400'}>({opt.count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
