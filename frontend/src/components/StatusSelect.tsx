import { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import type { AssignedTaskStatus } from '../types';

export const STATUS_LIST: AssignedTaskStatus[] = ['Open', 'In Progress', 'Completed'];

// Solid colored pill styling per status — gives the dropdown its colourful look.
export const statusPill: Record<string, string> = {
  'Open': 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200',
  'In Progress': 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  'Completed': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
};
export const statusDot: Record<string, string> = {
  'Open': 'bg-slate-400',
  'In Progress': 'bg-blue-500',
  'Completed': 'bg-emerald-500',
};

// A compact, colour-coded status dropdown. The trigger itself is the coloured
// status pill; the menu lists the other statuses with their colours.
export default function StatusSelect({
  value, onChange, className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom, left: r.left, width: r.width });
    };
    update();
    const onScroll = () => update();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll); };
  }, [open]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all w-32 ${statusPill[value] || ''} ${className}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDot[value] || 'bg-slate-400'}`} />
        <span className="flex-1 text-left truncate">{value}</span>
        <ChevronDown size={13} className="opacity-60 shrink-0" />
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && rect && (
            <>
              <div className="fixed inset-0 z-[999]" onClick={() => setOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.14 }}
                style={{ position: 'fixed', top: rect.top + 6, left: rect.left, minWidth: Math.max(rect.width, 150), zIndex: 1000 }}
                className="rounded-xl bg-white dark:bg-bg-deep border border-slate-200 dark:border-white/10 shadow-xl overflow-hidden p-1"
              >
                {STATUS_LIST.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { onChange(s); setOpen(false); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-slate-50 dark:hover:bg-white/[0.05]"
                  >
                    <span className={`h-2 w-2 rounded-full ${statusDot[s]}`} />
                    <span className="flex-1 text-left">{s}</span>
                    {s === value && <Check size={13} className="text-brand-600" />}
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
