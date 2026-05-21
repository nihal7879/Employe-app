import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface MultiOption { label: string; value: string; }

export default function MultiSelect({
  value, options, onChange, placeholder = 'Select…', searchable = true, className = '',
}: {
  value: string[];
  options: MultiOption[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const filtered = useMemo(
    () => (query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options),
    [query, options],
  );

  const toggle = (v: string) => {
    if (selectedSet.has(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full min-h-[42px] flex items-center flex-wrap gap-1.5 px-3 py-1.5 rounded-xl bg-white border text-sm transition-all
          ${open ? 'border-brand-500 shadow-[0_0_0_3px_rgba(124,58,237,0.18)]' : 'border-slate-200 hover:border-slate-300'}`}
      >
        {value.length === 0 && <span className="text-slate-400 px-1">{placeholder}</span>}
        {value.map((v) => {
          const o = options.find((x) => x.value === v);
          return (
            <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-xs">
              {o?.label || v}
              <span role="button" onClick={(e) => { e.stopPropagation(); toggle(v); }} className="text-brand-500 hover:text-brand-700">
                <X size={12} />
              </span>
            </span>
          );
        })}
        <ChevronDown size={16} className="ml-auto text-slate-400" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 mt-2 z-50 rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden"
          >
            {searchable && (
              <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
                <Search size={14} className="text-slate-400" />
                <input
                  autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="flex-1 text-sm text-slate-900 outline-none bg-transparent"
                />
              </div>
            )}
            <div className="max-h-64 overflow-y-auto py-1">
              {filtered.map((o) => {
                const sel = selectedSet.has(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle(o.value)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors
                      ${sel ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    <span className={`h-4 w-4 rounded border flex items-center justify-center
                      ${sel ? 'bg-brand-600 border-brand-600' : 'bg-white border-slate-300'}`}>
                      {sel && <Check size={11} strokeWidth={3} className="text-white" />}
                    </span>
                    <span className="flex-1 text-left truncate">{o.label}</span>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-slate-400">No matches</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
