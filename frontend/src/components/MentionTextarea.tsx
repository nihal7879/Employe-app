import { useRef, useState } from 'react';
import type { Assignee } from '../types';

// A comment textarea with inline @-mention autocomplete. Type "@" and a list of
// employees appears; pick one to insert "@Name". Mentioned employee ids are
// reported via onMentionsChange (computed from which @Name tokens remain in the
// text, so deleting a mention also drops it).
export default function MentionTextarea({
  value, onChange, employees, onMentionsChange, placeholder, rows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  employees: Assignee[];
  onMentionsChange: (ids: number[]) => void;
  placeholder?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null); // null = closed
  const [anchor, setAnchor] = useState(0); // index of the "@" being edited
  const [active, setActive] = useState(0);

  // Recompute which mentions are still present and report ids upward.
  const reportMentions = (text: string) => {
    const ids = employees
      .filter((e) => text.includes(`@${e.name}`))
      .map((e) => e.id);
    onMentionsChange([...new Set(ids)]);
  };

  const handleChange = (text: string) => {
    onChange(text);
    reportMentions(text);
    const el = ref.current;
    const caret = el ? el.selectionStart : text.length;
    const before = text.slice(0, caret);
    const m = before.match(/(?:^|\s)@([^\s@]*)$/);
    if (m) {
      setQuery(m[1]);
      setAnchor(caret - m[1].length - 1); // position of "@"
      setActive(0);
    } else {
      setQuery(null);
    }
  };

  const matches = query === null ? [] : employees
    .filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 50);

  const pick = (emp: Assignee) => {
    const el = ref.current;
    const caret = el ? el.selectionStart : value.length;
    const next = `${value.slice(0, anchor)}@${emp.name} ${value.slice(caret)}`;
    onChange(next);
    reportMentions(next);
    setQuery(null);
    setTimeout(() => {
      const pos = anchor + emp.name.length + 2;
      if (el) { el.focus(); el.setSelectionRange(pos, pos); }
    }, 0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (query === null || !matches.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % matches.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[active]); }
    else if (e.key === 'Escape') { setQuery(null); }
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 outline-none"
      />
      {query !== null && matches.length > 0 && (
        <div className="absolute z-50 left-2 right-2 mt-1 max-h-56 overflow-y-auto rounded-xl bg-white dark:bg-bg-deep border border-slate-200 dark:border-white/10 shadow-xl py-1">
          <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-400">Mention someone</div>
          {matches.map((e, i) => (
            <button
              key={e.id}
              type="button"
              onMouseDown={(ev) => { ev.preventDefault(); pick(e); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${i === active ? 'bg-brand-50 dark:bg-brand-500/15' : 'hover:bg-slate-50 dark:hover:bg-white/[0.05]'}`}
            >
              <span className="h-6 w-6 rounded-full bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center text-[10px] font-bold text-white">
                {e.name.charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 text-left truncate text-slate-800 dark:text-slate-200">{e.name}</span>
              <span className="text-xs text-slate-400">{e.employee_code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
