import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, X } from 'lucide-react';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

export default function TimePicker({
  value, onChange, placeholder = 'Pick a time', clearable = true, className = '',
}: {
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [h, m] = (value || ':').split(':');

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border text-sm transition-all text-left
          ${open ? 'border-brand-500 shadow-[0_0_0_3px_rgba(124,58,237,0.18)]' : 'border-slate-200 hover:border-slate-300'}`}
      >
        <Clock size={15} className="text-slate-400 shrink-0" />
        <span className={`flex-1 truncate ${value ? 'text-slate-900' : 'text-slate-400'}`}>
          {value || placeholder}
        </span>
        {clearable && value && (
          <span role="button" onClick={(e) => { e.stopPropagation(); onChange(''); }} className="text-slate-400 hover:text-slate-700">
            <X size={14} />
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 mt-2 z-50 rounded-2xl bg-white border border-slate-200 shadow-xl p-2 flex gap-1"
          >
            <div className="h-48 overflow-y-auto pr-1 border-r border-slate-100">
              {HOURS.map((hh) => (
                <button
                  type="button"
                  key={hh}
                  onClick={() => onChange(`${hh}:${m || '00'}`)}
                  className={`block w-12 text-center text-sm py-1.5 rounded-md transition-colors
                    ${h === hh ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                >{hh}</button>
              ))}
            </div>
            <div className="h-48 overflow-y-auto">
              {MINUTES.map((mm) => (
                <button
                  type="button"
                  key={mm}
                  onClick={() => { onChange(`${h || '00'}:${mm}`); setOpen(false); }}
                  className={`block w-12 text-center text-sm py-1.5 rounded-md transition-colors
                    ${m === mm ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                >{mm}</button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
