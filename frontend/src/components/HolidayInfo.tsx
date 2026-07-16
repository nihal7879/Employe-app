import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, X, PartyPopper } from 'lucide-react';
import { api } from '../lib/api';

interface Holiday {
  id: number;
  holiday_date: string;
  name: string;
  description?: string | null;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

function fmtDate(d: string) {
  return new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

// Days from today until a date (0 = today, 1 = tomorrow).
function daysUntil(d: string) {
  const a = new Date(todayStr() + 'T00:00:00').getTime();
  const b = new Date(String(d).slice(0, 10) + 'T00:00:00').getTime();
  return Math.round((b - a) / 86400000);
}

function relLabel(d: string) {
  const n = daysUntil(d);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `In ${n} days`;
}

// Dashboard holidays: a compact trigger button that opens a Google-Calendar-style
// panel from the right. Holidays render as green "all-day event" bars. The trigger
// (and panel) render nothing when there are no holidays to show.
export default function HolidayInfo() {
  const [today, setToday] = useState<Holiday | null>(null);
  const [upcoming, setUpcoming] = useState<Holiday[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get('/holidays/today').then((r) => setToday(r.data || null)).catch(() => setToday(null));
    api.get('/holidays/upcoming', { params: { limit: 8 } }).then((r) => setUpcoming(r.data || [])).catch(() => setUpcoming([]));
  }, []);

  // Future-only list (today has its own highlighted bar).
  const future = upcoming.filter((h) => String(h.holiday_date).slice(0, 10) !== todayStr());
  const count = (today ? 1 : 0) + future.length;

  // Close on Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (count === 0) return null;

  const headerDate = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <>
      {/* Fixed right-edge tab (Google-Calendar-rail style). Portaled to body so an
          animated/transformed ancestor can't break its viewport-fixed position. */}
      {typeof document !== 'undefined' && createPortal(
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={`${count} holiday${count > 1 ? 's' : ''}`}
          className="fixed right-0 top-1/3 z-50 flex flex-col items-center gap-1.5 rounded-l-2xl border border-r-0 border-slate-200 dark:border-white/10 bg-white dark:bg-bg-deep shadow-lg px-2.5 py-3 hover:pr-3.5 transition-all"
        >
          <div className="relative">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-fuchsia-500 to-brand-600 text-white flex flex-col items-center justify-center leading-none">
              <span className="text-[7px] font-semibold uppercase opacity-90">Hol</span>
              <CalendarDays size={15} />
            </div>
            {count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-bg-deep">{count}</span>
            )}
          </div>
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 [writing-mode:vertical-rl] rotate-180">Holidays</span>
        </button>,
        document.body,
      )}

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <div className="fixed inset-0 z-[60]">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setOpen(false)}
                className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]"
              />
              {/* Right drawer */}
              <motion.aside
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 320, damping: 34 }}
                className="absolute top-0 right-0 h-full w-[340px] max-w-[88vw] bg-white dark:bg-bg-deep border-l border-slate-200 dark:border-white/10 shadow-2xl flex flex-col"
              >
                {/* Header */}
                <div className="px-5 pt-5 pb-3 border-b border-slate-100 dark:border-white/10">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">Holidays</div>
                      <div className="text-lg font-bold text-brand-600 dark:text-brand-400">{headerDate}</div>
                    </div>
                    <button
                      onClick={() => setOpen(false)}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* All-day event bars */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {today && (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gradient-to-r from-fuchsia-600 to-brand-600 text-white">
                      <PartyPopper size={16} className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{today.name}</div>
                        {today.description && <div className="text-[11px] text-white/85 truncate">{today.description}</div>}
                      </div>
                      <span className="text-[11px] font-bold bg-white/25 px-2 py-0.5 rounded-full shrink-0">Today</span>
                    </div>
                  )}

                  {future.map((h) => (
                    <div key={h.id} className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-600 text-white">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{h.name}</div>
                        <div className="text-[11px] text-white/85">{fmtDate(h.holiday_date)}</div>
                      </div>
                      <span className="text-[11px] font-medium bg-white/20 px-2 py-0.5 rounded-full shrink-0">{relLabel(h.holiday_date)}</span>
                    </div>
                  ))}

                  {count === 0 && (
                    <div className="text-center text-sm text-slate-400 py-10">No upcoming holidays.</div>
                  )}
                </div>
              </motion.aside>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
