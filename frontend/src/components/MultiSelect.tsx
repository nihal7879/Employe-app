import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { SelectOption } from './Select';

// Multi-select dropdown — mirrors Select's look/behaviour (portaled panel,
// searchable) but holds an array of selected values and lets the user toggle
// several at once. Used by the Reports drilldown filters.
function useDropdownPosition(triggerRef: React.RefObject<HTMLElement>, open: boolean) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const update = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom, left: r.left, width: r.width });
  };

  useLayoutEffect(() => {
    if (!open) return;
    update();
    const onScroll = () => update();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  return rect;
}

export default function MultiSelect({
  value, options, onChange, placeholder = 'Select…', disabled = false, className = '',
  searchable = false, searchPlaceholder = 'Search…',
}: {
  value: string[];
  options: SelectOption[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const rect = useDropdownPosition(triggerRef, open);

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    if (searchable) {
      const t = setTimeout(() => searchRef.current?.focus(), 30);
      return () => {
        clearTimeout(t);
        window.removeEventListener('mousedown', onClick);
        window.removeEventListener('keydown', onKey);
      };
    }
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, searchable]);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const selectedOptions = useMemo(() => options.filter((o) => selectedSet.has(o.value)), [options, selectedSet]);
  const visibleOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  const toggle = (v: string) => {
    if (selectedSet.has(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  };

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-white/[0.04] border text-sm transition-all
          ${open ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className={`flex-1 text-left truncate ${selectedOptions.length ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
          {selectedOptions.length === 0
            ? placeholder
            : selectedOptions.length === 1
              ? selectedOptions[0].label
              : `${selectedOptions.length} selected`}
        </span>
        {selectedOptions.length > 0 && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); onChange([]); }}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white shrink-0"
            title="Clear selection"
          >
            <X size={14} />
          </span>
        )}
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-slate-400">
          <ChevronDown size={16} />
        </motion.span>
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && rect && (
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'fixed',
                top: rect.top + 6,
                left: rect.left,
                width: rect.width,
                zIndex: 1000,
              }}
              className="rounded-xl bg-white dark:bg-bg-deep border border-slate-200 dark:border-white/10 shadow-xl overflow-hidden"
            >
              {searchable && (
                <div className="p-2 border-b border-slate-100 dark:border-white/[0.06]">
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      ref={searchRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={searchPlaceholder}
                      className="w-full !pl-8 !pr-3 !py-1.5 rounded-lg text-sm bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400"
                    />
                  </div>
                </div>
              )}
              <div className="max-h-72 overflow-y-auto py-1 thin-scrollbar">
                {visibleOptions.length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-slate-400">
                    {options.length === 0 ? 'No options' : 'No matches'}
                  </div>
                )}
                {visibleOptions.map((o) => {
                  const active = selectedSet.has(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => toggle(o.value)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors
                        ${active ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/[0.05]'}`}
                    >
                      <span className={`h-4 w-4 flex items-center justify-center rounded border shrink-0 ${active ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-300 dark:border-white/20'}`}>
                        {active && <Check size={12} />}
                      </span>
                      {o.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ background: o.color }} />}
                      {o.icon}
                      <span className="flex-1 text-left truncate">{o.label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
