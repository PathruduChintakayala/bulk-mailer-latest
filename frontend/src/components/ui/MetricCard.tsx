import React from 'react';
import { ArrowUpRight } from 'lucide-react';

interface Props {
  icon: React.ElementType;
  label: string;
  value: string | number;
  /** `stat` = large gradient tile, `mini` = compact inline row. */
  variant?: 'stat' | 'mini';
  gradient?: string;
  lightBg?: string;
  tone?: string;
  toneBg?: string;
  pulse?: boolean;
}

export default function MetricCard({
  icon: Icon,
  label,
  value,
  variant = 'stat',
  gradient = 'from-brand-500 to-accent-500',
  lightBg = 'bg-brand-50',
  tone = 'text-brand-600',
  toneBg = 'bg-brand-100',
  pulse,
}: Props) {
  if (variant === 'mini') {
    return (
      <div className="card-static px-4 py-3.5 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl ${toneBg} flex items-center justify-center flex-shrink-0`}>
          <Icon size={16} className={tone} />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-gray-500 font-medium truncate">{label}</div>
          <div className="text-lg font-bold text-gray-900">{value}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card-static p-5 group hover:shadow-card-hover transition-all duration-300">
      <div className="flex items-start justify-between">
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md ${pulse ? 'animate-pulse-soft' : ''}`}>
          <Icon size={20} className="text-white" />
        </div>
        <div className={`w-8 h-8 rounded-lg ${lightBg} flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity`}>
          <ArrowUpRight size={14} className="text-gray-500" />
        </div>
      </div>
      <div className="mt-4">
        <div className="text-2xl font-bold text-gray-900 font-display tracking-tight">{value}</div>
        <div className="text-sm text-gray-500 mt-0.5">{label}</div>
      </div>
    </div>
  );
}
