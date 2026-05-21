import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function toYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function parseYmd(s?: string) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function DatePicker({
  value, onChange, placeholder = 'Pick a date', clearable = true, disabled = false, className = '',
}: {
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = useMemo(() => parseYmd(value), [value]);
  const [view, setView] = useState(() => selected || new Date());

  useEffect(() => { if (selected) setView(selected); }, [value]);

  // Decide direction when opening
  useEffect(() => {
    if (!open) return;
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      const POP_H = 340;
      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      setOpenUp(spaceBelow < POP_H && spaceAbove > spaceBelow);
    }
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const days = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const startDow = (first.getDay() + 6) % 7;
    const start = new Date(first); start.setDate(first.getDate() - startDow);
    const cells: { d: Date; muted: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      cells.push({ d, muted: d.getMonth() !== view.getMonth() });
    }
    return cells;
  }, [view]);

  const display = selected
    ? selected.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-white/[0.04] border text-sm transition-all text-left
          ${open ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <Calendar size={15} className="text-slate-400 shrink-0" />
        <span className={`flex-1 truncate ${display ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
          {display || placeholder}
        </span>
        {clearable && display && (
          <span role="button" onClick={(e) => { e.stopPropagation(); onChange(''); }} className="text-slate-400 hover:text-slate-700">
            <X size={14} />
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: openUp ? 6 : -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: openUp ? 6 : -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className={`absolute left-0 z-[60] w-72 rounded-2xl bg-white dark:bg-bg-deep border border-slate-200 dark:border-white/10 shadow-2xl p-3 ${openUp ? 'bottom-full mb-2' : 'top-full mt-2'}`}
          >
            <div className="flex items-center justify-between mb-2 px-1">
              <button type="button"
                onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
                className="h-7 w-7 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.08] flex items-center justify-center text-slate-500 dark:text-slate-400"
              ><ChevronLeft size={16} /></button>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {MONTHS[view.getMonth()]} {view.getFullYear()}
              </div>
              <button type="button"
                onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
                className="h-7 w-7 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.08] flex items-center justify-center text-slate-500 dark:text-slate-400"
              ><ChevronRight size={16} /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map((w) => (
                <div key={w} className="text-[10px] text-slate-400 font-semibold text-center py-1">{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map(({ d, muted }, i) => {
                const isSel = selected && sameDay(d, selected);
                const isToday = sameDay(d, new Date());
                return (
                  <button
                    type="button"
                    key={i}
                    onClick={() => { onChange(toYmd(d)); setOpen(false); }}
                    className={`h-8 rounded-lg text-xs font-medium transition-all
                      ${isSel ? 'bg-brand-600 text-white shadow-[0_2px_8px_-2px_rgba(124,58,237,0.5)]'
                            : muted ? 'text-slate-300 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.08]'}
                      ${!isSel && isToday ? 'ring-1 ring-brand-300 dark:ring-brand-500/50' : ''}`}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100 dark:border-white/10">
              <button type="button"
                onClick={() => { onChange(toYmd(new Date())); setOpen(false); }}
                className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700"
              >Today</button>
              {clearable && (
                <button type="button"
                  onClick={() => { onChange(''); setOpen(false); }}
                  className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700"
                >Clear</button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
