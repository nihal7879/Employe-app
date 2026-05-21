import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  danger = false, onConfirm, onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/30"
            onClick={onClose}
          />
          {/* dialog */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="bg-white dark:bg-bg-deep rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-md pointer-events-auto overflow-hidden"
            >
              <div className="flex items-start gap-4 p-6">
                <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${danger ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400' : 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400'}`}>
                  <AlertTriangle size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <h3 className="font-semibold text-slate-900 dark:text-white flex-1">{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
                      <X size={18} />
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{message}</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 px-6 py-4 bg-slate-50/60 border-t border-slate-100 dark:bg-white/[0.02] dark:border-white/10">
                <button onClick={onClose} className="btn-secondary">{cancelLabel}</button>
                <button
                  onClick={() => { onConfirm(); onClose(); }}
                  className={danger ? 'btn-danger' : 'btn-primary'}
                >
                  {confirmLabel}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
