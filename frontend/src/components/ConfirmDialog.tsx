import { useEffect, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

const variantStyles = {
  danger: {
    icon: 'bg-red-100 text-red-600',
    button: 'btn-danger',
  },
  warning: {
    icon: 'bg-amber-100 text-amber-600',
    button: 'btn-warning',
  },
  info: {
    icon: 'bg-blue-100 text-blue-600',
    button: 'btn-primary',
  },
};

export default function ConfirmDialog({
  open,
  title = 'Confirm',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const styles = variantStyles[variant];
  const titleId = useId();
  const descId = useId();
  const panelRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />

          {/* Dialog */}
          <motion.div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            className="relative bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 focus:outline-none"
          >
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close dialog"
              className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <X size={16} />
            </button>

            <div className="flex items-start gap-4">
              <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${styles.icon}`}>
                <AlertTriangle size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 id={titleId} className="text-sm font-semibold text-gray-900">{title}</h3>
                <p id={descId} className="text-sm text-gray-600 mt-1">{message}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6">
              <button type="button" onClick={onCancel} className="btn-secondary btn-sm">
                {cancelLabel}
              </button>
              <button type="button" onClick={onConfirm} className={`${styles.button} btn-sm`}>
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
