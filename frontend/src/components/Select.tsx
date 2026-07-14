import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface SelectOption {
  label: string;
  value: string;
  icon?: React.ReactNode;
  color?: string;
}

// The dropdown panel is portaled to document.body so it always paints above
// modals and any sibling element. Position is computed from the trigger's
// bounding rect and updated on scroll/resize.
function useDropdownPosition(triggerRef: React.RefObject<HTMLElement>, open: boolean) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number; dropUp: boolean; maxH: number } | null>(null);

  const update = () => {
    const el = triggerRef.current;
    if (!el) return;
    // Viewport-relative coords for a position:fixed panel. Using scroll offsets
    // here would be wrong: the app scrolls an inner <main>, not the window, so
    // window.scrollY is 0 and an absolute-to-body panel lands off-screen and
    // stretches the body (the stray second scrollbar / left shift).
    const r = el.getBoundingClientRect();
    const GAP = 6;
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    // Flip upward when there isn't enough room below and there's more above —
    // keeps the menu on-screen for fields near the bottom of the viewport.
    const dropUp = spaceBelow < 260 && spaceAbove > spaceBelow;
    const maxH = Math.max(140, (dropUp ? spaceAbove : spaceBelow) - GAP - 12);
    // For dropUp we anchor the panel's bottom to the trigger's top.
    const top = dropUp ? r.top - GAP : r.bottom + GAP;
    setRect({ top, left: r.left, width: r.width, dropUp, maxH });
  };

  useLayoutEffect(() => {
    if (!open) return;
    update();
    const onScroll = () => update();
    window.addEventListener('scroll', onScroll, true);  // capture: any scrolling ancestor too
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  return rect;
}

export default function Select({
  value, options, onChange, placeholder = 'Select…', disabled = false, className = '',
  searchable = false, searchPlaceholder = 'Search…', allowCustom = false, clearable = false,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  // When true, the typed search text can be committed as-is even if it doesn't
  // match an option (a "Use \"…\"" row appears). Lets the field accept names
  // that aren't on the list while still offering the list as suggestions.
  allowCustom?: boolean;
  // When true, an X button appears while a value is selected to clear it (emits '').
  clearable?: boolean;
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

  const selected = options.find((o) => o.value === value);
  // With allowCustom the value may be free text that isn't an option — show it
  // verbatim on the trigger instead of falling back to the placeholder.
  const displayLabel = selected ? selected.label : (allowCustom && value ? value : '');
  const visibleOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);
  // Offer the typed text as a custom choice when it doesn't exactly match a label.
  const customQuery = query.trim();
  const showCustom = allowCustom && customQuery.length > 0
    && !options.some((o) => o.label.toLowerCase() === customQuery.toLowerCase());

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
        {selected?.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ background: selected.color }} />}
        {selected?.icon}
        <span className={`flex-1 text-left truncate ${displayLabel ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
          {displayLabel || placeholder}
        </span>
        {clearable && value && !disabled ? (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white shrink-0"
            title="Clear"
          >
            <X size={15} />
          </span>
        ) : (
          <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-slate-400">
            <ChevronDown size={16} />
          </motion.span>
        )}
      </button>

      {/* Dropdown panel — rendered into document.body via portal so it
          paints above modals, drawers, and any z-index battles inside the
          surrounding component. Positioned absolutely using the trigger's
          rect. */}
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
                top: rect.top,
                left: rect.left,
                width: rect.width,
                // For an upward menu, shift it up by its own height so its bottom
                // sits just above the trigger.
                transform: rect.dropUp ? 'translateY(-100%)' : undefined,
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
              <div className="overflow-y-auto py-1 thin-scrollbar" style={{ maxHeight: Math.min(288, rect.maxH) }}>
                {showCustom && (
                  <button
                    type="button"
                    onClick={() => { onChange(customQuery); setOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/15"
                  >
                    <span className="flex-1 text-left truncate">Use “{customQuery}”</span>
                  </button>
                )}
                {visibleOptions.length === 0 && !showCustom && (
                  <div className="px-3 py-6 text-center text-sm text-slate-400">
                    {options.length === 0 ? 'No options' : 'No matches'}
                  </div>
                )}
                {visibleOptions.map((o) => {
                  const active = o.value === value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => { onChange(o.value); setOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors
                        ${active ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/[0.05]'}`}
                    >
                      {o.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ background: o.color }} />}
                      {o.icon}
                      <span className="flex-1 text-left truncate">{o.label}</span>
                      {active && <Check size={14} className="text-brand-600 shrink-0" />}
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
