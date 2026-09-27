import React from 'react';

type Tone = 'default' | 'brand' | 'danger' | 'success';

interface Props extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  icon: React.ElementType;
  /** Used for both the tooltip and the accessible name. */
  label: string;
  tone?: Tone;
  size?: 'sm' | 'md';
}

const TONES: Record<Tone, string> = {
  default: 'text-gray-500 hover:text-gray-900 hover:bg-gray-100',
  brand: 'text-gray-500 hover:text-brand-600 hover:bg-brand-50',
  danger: 'text-gray-500 hover:text-red-600 hover:bg-red-50',
  success: 'text-gray-500 hover:text-emerald-600 hover:bg-emerald-50',
};

export default function IconButton({
  icon: Icon,
  label,
  tone = 'default',
  size = 'md',
  className = '',
  ...rest
}: Props) {
  const iconSize = size === 'sm' ? 14 : 16;

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`${size === 'sm' ? 'p-1.5' : 'p-2'} rounded-lg transition-colors cursor-pointer ${TONES[tone]} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...rest}
    >
      <Icon size={iconSize} />
    </button>
  );
}
