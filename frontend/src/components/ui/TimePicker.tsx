import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, X } from 'lucide-react';

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')); // 01..12
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
const PERIODS: ('AM' | 'PM')[] = ['AM', 'PM'];

// Stored value stays 24-hour "HH:MM"; the UI shows 12-hour with AM/PM.
function parse(value?: string) {
  if (!value || !value.includes(':')) return { h12: '', minute: '', period: 'AM' as 'AM' | 'PM' };
  const [hStr, mStr] = value.split(':');
  const h = Number(hStr);
  const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return { h12: String(h12).padStart(2, '0'), minute: mStr, period };
}
function to24(h12: number, period: 'AM' | 'PM') {
  let h = h12 % 12;            // 12 -> 0
  if (period === 'PM') h += 12; // 12 PM -> 12, 1 PM -> 13 …
  return String(h).padStart(2, '0');
}

// "HH:MM" or "HH:MM:SS" -> minutes since midnight. Returns -1 for empty/invalid.
function timeToMins(t?: string): number {
  if (!t || !t.includes(':')) return -1;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return -1;
  return h * 60 + (m || 0);
}

export default function TimePicker({
  value, onChange, placeholder = 'Pick a time', clearable = true, className = '', minTime,
}: {
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
  // Earliest selectable time as "HH:MM" or "HH:MM:SS" (24-hour). Buttons that
  // would produce a value below this are disabled.
  minTime?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cur = parse(value);
  const minMins = timeToMins(minTime || undefined);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  // A button is disabled when no combination of the remaining (unfixed) parts
  // can yield a final time >= minTime. For hour/minute we use the currently
  // selected period; for period we check the best case across all hours/minutes.
  const periodDisabled = (p: 'AM' | 'PM') => {
    if (minMins < 0) return false;
    const bestMins = p === 'AM' ? 11 * 60 + 45 : 23 * 60 + 45;
    return bestMins < minMins;
  };
  const hourDisabled = (hh: string) => {
    if (minMins < 0) return false;
    const h24 = Number(to24(Number(hh), cur.period));
    return h24 * 60 + 45 < minMins; // best case = :45
  };
  const minuteDisabled = (mm: string) => {
    if (minMins < 0 || !cur.h12) return false;
    const h24 = Number(to24(Number(cur.h12), cur.period));
    return h24 * 60 + Number(mm) < minMins;
  };

  const commit = (h12: number, minute: string, period: 'AM' | 'PM') => {
    onChange(`${to24(h12, period)}:${minute}`);
  };
  const pickHour = (hh: string) => {
    if (hourDisabled(hh)) return;
    commit(Number(hh), cur.minute || '00', cur.period);
  };
  const pickMinute = (mm: string) => {
    if (minuteDisabled(mm)) return;
    commit(cur.h12 ? Number(cur.h12) : 12, mm, cur.period);
  };
  const pickPeriod = (p: 'AM' | 'PM') => {
    if (periodDisabled(p)) return;
    // Keep the dropdown OPEN — switching AM/PM often re-enables hours that were
    // disabled by minTime, so the user still needs to pick the hour/minute.
    commit(cur.h12 ? Number(cur.h12) : 12, cur.minute || '00', p);
  };

  const display = value && value.includes(':') ? `${cur.h12}:${cur.minute} ${cur.period}` : '';

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-white/[0.04] border text-sm transition-all text-left
          ${open ? 'border-brand-500 shadow-[0_0_0_3px_rgba(124,58,237,0.18)]' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'}`}
      >
        <Clock size={15} className="text-slate-400 shrink-0" />
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
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 mt-2 z-50 rounded-2xl bg-white dark:bg-bg-deep border border-slate-200 dark:border-white/10 shadow-xl p-1.5 flex gap-0.5"
          >
            <div className="h-48 overflow-y-auto pr-1 border-r border-slate-100 dark:border-white/10">
              {HOURS.map((hh) => {
                const dis = hourDisabled(hh);
                return (
                  <button
                    type="button"
                    key={hh}
                    onClick={() => pickHour(hh)}
                    disabled={dis}
                    title={dis && minTime ? 'Before earliest allowed time' : undefined}
                    className={`block w-10 text-center text-sm py-1.5 rounded-md transition-colors
                      ${dis
                        ? 'text-slate-300 dark:text-slate-600 line-through cursor-not-allowed'
                        : cur.h12 === hh
                          ? 'bg-brand-600 text-white'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.08]'}`}
                  >{hh}</button>
                );
              })}
            </div>
            <div className="h-48 overflow-y-auto pr-1 border-r border-slate-100 dark:border-white/10">
              {MINUTES.map((mm) => {
                const dis = minuteDisabled(mm);
                return (
                  <button
                    type="button"
                    key={mm}
                    onClick={() => pickMinute(mm)}
                    disabled={dis}
                    title={dis && minTime ? 'Before earliest allowed time' : undefined}
                    className={`block w-10 text-center text-sm py-1.5 rounded-md transition-colors
                      ${dis
                        ? 'text-slate-300 dark:text-slate-600 line-through cursor-not-allowed'
                        : cur.minute === mm
                          ? 'bg-brand-600 text-white'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.08]'}`}
                  >{mm}</button>
                );
              })}
            </div>
            <div className="flex flex-col gap-1">
              {PERIODS.map((p) => {
                const dis = periodDisabled(p);
                return (
                  <button
                    type="button"
                    key={p}
                    onClick={() => pickPeriod(p)}
                    disabled={dis}
                    title={dis && minTime ? 'Before earliest allowed time' : undefined}
                    className={`w-10 text-center text-sm py-1.5 rounded-md transition-colors
                      ${dis
                        ? 'text-slate-300 dark:text-slate-600 line-through cursor-not-allowed'
                        : cur.period === p && display
                          ? 'bg-brand-600 text-white'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.08]'}`}
                  >{p}</button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
