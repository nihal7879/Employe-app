import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface MultiOption { label: string; value: string; }

// Worst-case panel height: the search row (~41px) plus the max-h-64 option list.
const PANEL_MAX_H = 297;

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
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  // Open upward when the panel wouldn't fit below the trigger, so it never
  // extends past the viewport and forces the page to scroll.
  useEffect(() => {
    if (!open || !ref.current) return;
    const place = () => {
      const r = ref.current!.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      setDropUp(below < PANEL_MAX_H + 16 && r.top > below);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

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
            initial={{ opacity: 0, y: dropUp ? 6 : -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: dropUp ? 6 : -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className={`absolute left-0 right-0 z-50 rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden
              ${dropUp ? 'bottom-full mb-2' : 'top-full mt-2'}`}
          >
            {searchable && (
              <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
                <Search size={14} className="text-slate-400" />
                <input
                  autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  // The global `input` rule in index.css wins on specificity, so the
                  // chrome it adds (border, padding, focus ring) is stripped explicitly.
                  className="flex-1 text-sm text-slate-900 bg-transparent !border-0 !p-0 !rounded-none !ring-0 !shadow-none outline-none"
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
