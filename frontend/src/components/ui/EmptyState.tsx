import React from 'react';
import { motion } from 'framer-motion';

interface Props {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Tailwind classes for the icon tile background. */
  iconTone?: string;
  iconColor?: string;
  compact?: boolean;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  iconTone = 'bg-gradient-to-br from-brand-100 to-accent-100',
  iconColor = 'text-brand-500',
  compact = false,
}: Props) {
  return (
    <motion.div
      initial={{ scale: 0.97, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`text-center card-static ${compact ? 'py-10 px-5' : 'py-16'}`}
    >
      <div className={`${compact ? 'w-14 h-14' : 'w-16 h-16'} mx-auto mb-4 rounded-2xl ${iconTone} flex items-center justify-center`}>
        <Icon size={compact ? 24 : 28} className={iconColor} />
      </div>
      <h3 className="font-display font-semibold text-gray-900 text-lg">{title}</h3>
      {description && (
        <p className="text-gray-500 mt-1.5 text-sm max-w-sm mx-auto">{description}</p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </motion.div>
  );
}
