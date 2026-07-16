import { useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export default function Modal({
  open, title, onClose, children, size = 'md',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const widths: Record<typeof size, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  // Rendered through a portal on <body> so the fixed overlay is always
  // positioned relative to the viewport — not to a transformed ancestor (the
  // page-transition motion.div applies a CSS transform, which would otherwise
  // make `position: fixed` resolve against it and drop the modal off-centre).
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/30"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className={`bg-white dark:bg-bg-deep rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 w-full ${widths[size]} pointer-events-auto flex flex-col max-h-[85vh]`}
            >
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-white/10 shrink-0">
                <h3 className="font-semibold text-slate-900 dark:text-white min-w-0 break-words [overflow-wrap:anywhere]">{title}</h3>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-white shrink-0">
                  <X size={20} />
                </button>
              </div>
              <div className="p-5 overflow-y-auto flex-1">{children}</div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
