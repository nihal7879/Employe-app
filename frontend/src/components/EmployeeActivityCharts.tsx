import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, LogIn, LogOut } from 'lucide-react';
import { api } from '../lib/api';
import { APP_CONFIG } from '../config/app-config';
import Modal from './Modal';
import type { DailyTask } from '../types';

type View = 'day' | 'week' | 'month';

const PROJECT_COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#A78BFA', '#84CC16', '#F97316', '#14B8A6'];

function fmtTime12(t?: string | null) {
  if (!t) return '';
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t;
  const h = Number(m[1]);
  const mm = m[2];
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${period}`;
}

type DayBounds = { first_login: string | null; last_logout: string | null };

function toMin(t?: string | null): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
// Worked hours from the exact start→end span (minute granularity) so day
// totals match the per-task durations. hours_spent is rounded to 2 decimals
// (20 min → 0.33h), so it's only a fallback when times are missing.
function taskHours(t: DailyTask): number {
  const s = toMin(t.start_time), e = toMin(t.end_time);
  if (s != null && e != null && e > s) return (e - s) / 60;
  return Number(t.hours_spent || 0);
}

// Track whether we're on a mobile-sized viewport. Cell chips are hidden at
// this size (they overlap with the day number / hours pill in such small
// squares); instead the tap opens a Modal with the day's bounds.
function useIsMobile(maxWidthPx = 640): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= maxWidthPx,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, [maxWidthPx]);
  return mobile;
}

const ymd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};
const todayStr = () => ymd(new Date());

const FULL_DAY_HOURS = APP_CONFIG.fullDayHours;
const HALF_DAY_HOURS = APP_CONFIG.halfDayHours;

function dayBucket(hours: number, isWeekend: boolean, isFuture: boolean) {
  if (isFuture) return 'future';
  if (isWeekend && hours === 0) return 'weekend';
  if (hours === 0) return 'missing';
  if (hours >= FULL_DAY_HOURS) return 'full';
  if (hours >= HALF_DAY_HOURS) return 'partial';
  return 'low';
}

const BUCKET_STYLE: Record<string, { cell: string; dot: string }> = {
  full:    { cell: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30', dot: 'bg-emerald-500' },
  partial: { cell: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30',             dot: 'bg-amber-500'   },
  low:     { cell: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-500/30',                   dot: 'bg-rose-500'    },
  missing: { cell: 'bg-white text-slate-400 border-slate-200 dark:bg-white/[0.02] dark:text-slate-500 dark:border-white/10',                    dot: ''               },
  weekend: { cell: 'bg-slate-50/60 text-slate-400 border-slate-100 dark:bg-white/[0.02] dark:text-slate-500 dark:border-white/[0.06]',          dot: ''               },
  future:  { cell: 'bg-transparent text-slate-300 dark:text-slate-600 border-dashed border-slate-200 dark:border-white/[0.06]',                 dot: ''               },
};

// Mon-anchored week range (Mon..Sun) for the given date.
function weekRange(d: Date) {
  const dow = (d.getDay() + 6) % 7;
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  return { from: mon, to: sun };
}

export default function EmployeeActivityCharts() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  // Per-day Login/Logout audit times, keyed by YYYY-MM-DD. Drives the in/out
  // stamps shown inside calendar cells across all three views.
  const [bounds, setBounds] = useState<Record<string, DayBounds>>({});
  // On mobile, cell taps open this modal (date key) instead of navigating
  // directly to /my-activity. Chips don't fit in mobile cells, so the modal
  // is the only way to surface In/Out without leaving the dashboard.
  const [tappedDate, setTappedDate] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Range we need data for, based on the active view.
  const range = useMemo(() => {
    if (view === 'day') return { from: anchor, to: anchor };
    if (view === 'week') return weekRange(anchor);
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { from: first, to: last };
  }, [view, anchor]);

  useEffect(() => {
    api.get('/daily-tasks', { params: { from: ymd(range.from), to: ymd(range.to) } })
      .then((r) => setTasks(r.data || []))
      .catch(() => setTasks([]));
    api.get('/audit/day-bounds', { params: { from: ymd(range.from), to: ymd(range.to) } })
      .then((r) => setBounds(r.data || {}))
      .catch(() => setBounds({}));
  }, [range.from, range.to]);

  // Date → hours (excludes break entries)
  const hoursByDate = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of tasks) {
      if (t.is_break) continue;
      const k = String(t.task_date).slice(0, 10);
      m[k] = (m[k] || 0) + taskHours(t);
    }
    return m;
  }, [tasks]);

  // Date → list of (non-break) tasks sorted by start time
  const tasksByDate = useMemo(() => {
    const m: Record<string, DailyTask[]> = {};
    for (const t of tasks) {
      if (t.is_break) continue;
      const k = String(t.task_date).slice(0, 10);
      (m[k] = m[k] || []).push(t);
    }
    Object.values(m).forEach((arr) =>
      arr.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
    );
    return m;
  }, [tasks]);

  // Stable color per project across the visible range
  const projectColors = useMemo(() => {
    const names = Array.from(new Set(tasks.map((t) => t.project_name || '—'))).sort();
    const m: Record<string, string> = {};
    names.forEach((n, i) => { m[n] = PROJECT_COLORS[i % PROJECT_COLORS.length]; });
    return m;
  }, [tasks]);

  const today = todayStr();
  const totals = useMemo(() => {
    const all = Object.values(hoursByDate);
    return {
      worked: all.reduce((s, h) => s + h, 0),
      daysLogged: all.filter((h) => h > 0).length,
    };
  }, [hoursByDate]);

  // Clicking a cell opens that day directly in My Activity on desktop.
  // On mobile we show a small modal first (In/Out/hours), with a button to
  // open My Activity — the cell chips don't fit on small screens.
  const onCellClick = (date: Date) => {
    if (isMobile) {
      setTappedDate(ymd(date));
    } else {
      navigate(`/my-activity?date=${ymd(date)}`);
    }
  };

  // Header label changes based on view
  const headerLabel = useMemo(() => {
    if (view === 'day') return anchor.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (view === 'week') {
      const { from, to } = weekRange(anchor);
      const sameMonth = from.getMonth() === to.getMonth();
      const fmtFrom = sameMonth
        ? from.toLocaleDateString(undefined, { day: 'numeric' })
        : from.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      const fmtTo = to.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      return `${fmtFrom} – ${fmtTo}`;
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    return first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [view, anchor]);

  const move = (dir: -1 | 1) => {
    if (view === 'day') {
      setAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + dir));
    } else if (view === 'week') {
      setAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + dir * 7));
    } else {
      setAnchor((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5 md:p-6 space-y-5">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-brand-500/15 text-brand-500 flex items-center justify-center">
            <CalendarDays size={18} />
          </div>
          <div>
            <h2 className="font-semibold text-lg leading-tight">{headerLabel}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {totals.worked.toFixed(1)}h logged
              {totals.daysLogged > 0 && <> across {totals.daysLogged} day{totals.daysLogged === 1 ? '' : 's'}</>}
              {view !== 'day' && ' · click a date to view it'}
            </p>
          </div>
        </div>

        <div className="md:ml-auto flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-white/[0.06] p-0.5">
            {(['day', 'week', 'month'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${
                  view === v
                    ? 'bg-white dark:bg-white/[0.12] text-brand-700 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => move(-1)}
            className="h-9 w-9 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.06] flex items-center justify-center"
            aria-label={`Previous ${view}`}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => move(1)}
            className="h-9 w-9 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.06] flex items-center justify-center"
            aria-label={`Next ${view}`}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {view === 'month' && (
        <MonthGrid anchor={anchor} hoursByDate={hoursByDate} tasksByDate={tasksByDate} boundsByDate={bounds} projectColors={projectColors} today={today} onCellClick={onCellClick} />
      )}
      {view === 'week' && (
        <WeekRow anchor={anchor} hoursByDate={hoursByDate} tasksByDate={tasksByDate} boundsByDate={bounds} projectColors={projectColors} today={today} onCellClick={onCellClick} />
      )}
      {view === 'day' && (
        <DayCard date={anchor} hours={hoursByDate[ymd(anchor)] || 0} tasks={tasksByDate[ymd(anchor)] || []} bounds={bounds[ymd(anchor)]} projectColors={projectColors} onOpen={() => navigate(`/my-activity?date=${ymd(anchor)}`)} />
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
        <Legend color="bg-emerald-500" label={`Full day · ${FULL_DAY_HOURS}h+`} />
        <Legend color="bg-amber-500" label={`Partial · ${HALF_DAY_HOURS}–${FULL_DAY_HOURS}h`} />
        <Legend color="bg-rose-500" label={`Low · <${HALF_DAY_HOURS}h`} />
        <Legend color="bg-slate-300 dark:bg-white/15" label="Not logged" />
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded ring-2 ring-brand-500/70" />
          Today
        </span>
      </div>

      {/* Mobile-only tap modal — surfaces the same In/Out info that desktop
          shows directly in the cell, plus a button to navigate to /my-activity. */}
      <DayTapModal
        dateKey={tappedDate}
        bounds={tappedDate ? bounds[tappedDate] : undefined}
        hours={tappedDate ? (hoursByDate[tappedDate] || 0) : 0}
        onClose={() => setTappedDate(null)}
        onOpenDay={() => {
          if (tappedDate) navigate(`/my-activity?date=${tappedDate}`);
          setTappedDate(null);
        }}
      />
    </motion.div>
  );
}

function DayTapModal({ dateKey, bounds, hours, onClose, onOpenDay }: {
  dateKey: string | null;
  bounds?: DayBounds;
  hours: number;
  onClose: () => void;
  onOpenDay: () => void;
}) {
  const dateLabel = dateKey
    ? new Date(dateKey + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  return (
    <Modal open={!!dateKey} title={dateLabel || 'Day'} onClose={onClose} size="sm">
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <BoundStat icon={<LogIn size={14} />}  label="First in"   value={fmtTime12(bounds?.first_login || '') || '—'} tone="emerald" />
          <BoundStat icon={<LogOut size={14} />} label="Last out"   value={fmtTime12(bounds?.last_logout || '') || '—'} tone="rose" />
          <BoundStat icon={<Clock size={14} />}  label="Work hours" value={`${hours.toFixed(2)}h`}                       tone="brand" />
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={onOpenDay} className="btn-primary text-sm">Open day</button>
        </div>
      </div>
    </Modal>
  );
}

function MonthCell({ date, hours, tasks, bounds, projectColors, today, onClick }: {
  date: Date; hours: number; tasks: DailyTask[]; bounds?: DayBounds; projectColors: Record<string, string>; today: string; onClick: () => void;
}) {
  const k = ymd(date);
  const dow = date.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const isFuture = k > today;
  const isToday = k === today;
  const bucket = dayBucket(hours, isWeekend, isFuture);
  const style = BUCKET_STYLE[bucket];
  const clickable = !isFuture;
  const fillPct = Math.min(100, Math.round((hours / FULL_DAY_HOURS) * 100));
  // Compact tooltip — keep the project info available without ever putting it
  // inside the cell (that's what the redesign was specifically about).
  const titleSummary = tasks.length
    ? '\n' + tasks.slice(0, 4).map((t) => `• ${fmtTime12(t.start_time)} ${t.project_name || '—'} — ${t.task_title}`).join('\n')
    : '';
  // Keep a reference to projectColors so unused-import lint stays quiet — also
  // used when we want to surface a single dominant color on hover later.
  void projectColors;

  return (
    <button
      onClick={() => clickable && onClick()}
      disabled={!clickable}
      className={`group relative aspect-square rounded-xl border transition-all overflow-hidden ${style.cell}
        ${clickable ? 'hover:-translate-y-0.5 hover:shadow-md cursor-pointer' : 'cursor-default'}
        ${isToday ? 'ring-2 ring-brand-500/70 ring-offset-2 ring-offset-white dark:ring-offset-bg-deep' : ''}`}
      title={`${date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} — ${hours.toFixed(1)}h${titleSummary}`}
    >
      {/* Day number — top-left, prominent */}
      <div className="absolute top-1.5 left-2 sm:top-2 sm:left-2.5">
        <span className={`text-sm sm:text-base font-bold tabular-nums leading-none ${isToday ? 'text-brand-700 dark:text-brand-300' : ''}`}>
          {date.getDate()}
        </span>
      </div>

      {/* First in / Last out stamps — labeled pills with full words. Hidden
          on mobile (cells too cramped) — tap opens a Modal with the same
          info via MonthGrid's tappedDate handler. */}
      {(bounds?.first_login || bounds?.last_logout) && (
        <div className="hidden sm:flex absolute inset-x-1 top-1/2 -translate-y-1/2 flex-col items-stretch gap-1 pointer-events-none px-1">
          <span className="flex items-center gap-1 px-1.5 py-[2px] rounded-md text-[10px] font-semibold tabular-nums bg-emerald-100/80 text-emerald-700 ring-1 ring-emerald-200/70 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-500/30 shadow-sm">
            <LogIn size={9} className="shrink-0" />
            <span className="opacity-70 shrink-0">First in</span>
            <span className="ml-auto shrink-0">{bounds.first_login ? fmtTime12(bounds.first_login) : '—'}</span>
          </span>
          <span className="flex items-center gap-1 px-1.5 py-[2px] rounded-md text-[10px] font-semibold tabular-nums bg-rose-100/80 text-rose-700 ring-1 ring-rose-200/70 dark:bg-rose-500/20 dark:text-rose-200 dark:ring-rose-500/30 shadow-sm">
            <LogOut size={9} className="shrink-0" />
            <span className="opacity-70 shrink-0">Last out</span>
            <span className="ml-auto shrink-0">{bounds.last_logout ? fmtTime12(bounds.last_logout) : '—'}</span>
          </span>
        </div>
      )}

      {/* Hours pill — bottom-center on desktop only. Mobile cells are tight
          enough that the pill overlaps the day number; mobile users see
          hours in the tap modal instead. A small dot replaces it on mobile
          to indicate "activity exists" without taking space. */}
      {hours > 0 && (
        <>
          <div className="hidden sm:flex absolute inset-x-0 bottom-2 justify-center pointer-events-none">
            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums bg-black/5 dark:bg-white/10">
              {hours.toFixed(1)}h
            </span>
          </div>
          <span className={`sm:hidden absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full ${style.dot}`} />
        </>
      )}

      {/* Heatmap fill bar — full-width strip at the bottom, opacity ∝ hours */}
      {hours > 0 && (
        <span
          className={`absolute bottom-0 left-0 right-0 h-1 ${style.dot}`}
          style={{ opacity: 0.35 + (fillPct / 100) * 0.55 }}
        />
      )}
    </button>
  );
}

function WeekCell({ date, hours, tasks, bounds, projectColors, today, onClick }: {
  date: Date; hours: number; tasks: DailyTask[]; bounds?: DayBounds; projectColors: Record<string, string>; today: string; onClick: () => void;
}) {
  const k = ymd(date);
  const dow = date.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const isFuture = k > today;
  const isToday = k === today;
  const bucket = dayBucket(hours, isWeekend, isFuture);
  const style = BUCKET_STYLE[bucket];
  const clickable = !isFuture;
  const fillPct = Math.min(100, Math.round((hours / FULL_DAY_HOURS) * 100));
  // Project list intentionally removed from cell — full breakdown lives in
  // /my-activity. Cells stay focused on date, In/Out, and total hours.
  void tasks; void projectColors;

  return (
    <button
      onClick={() => clickable && onClick()}
      disabled={!clickable}
      className={`group relative md:min-h-[170px] rounded-xl border p-3 transition-all overflow-hidden text-left ${style.cell}
        ${clickable ? 'hover:-translate-y-0.5 hover:shadow-md cursor-pointer' : 'cursor-default'}
        ${isToday ? 'ring-2 ring-brand-500/70 ring-offset-2 ring-offset-white dark:ring-offset-bg-deep' : ''}`}
    >
      {/* Header row: date number + weekday (mobile) + hours pill */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className={`text-xl font-bold tabular-nums leading-none ${isToday ? 'text-brand-700 dark:text-brand-300' : ''}`}>
            {date.getDate()}
          </div>
          <div className="md:hidden text-[10px] uppercase tracking-wider font-semibold opacity-60 mt-1">
            {date.toLocaleDateString(undefined, { weekday: 'short' })}
          </div>
        </div>
        {hours > 0 && (
          <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums bg-black/5 dark:bg-white/10">
            {hours.toFixed(1)}h
          </span>
        )}
      </div>

      {/* First in / Last out stamps — labeled pills under the header. Both
          chips always render once any audit data exists for the day so the
          user can distinguish "no logout yet" from "no tracking data". */}
      {(bounds?.first_login || bounds?.last_logout) && (
        <div className="flex flex-col gap-1 mb-2">
          <span className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold tabular-nums bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/30">
            <LogIn size={10} className="shrink-0" />
            <span className="opacity-70 shrink-0">First in</span>
            <span className="ml-auto shrink-0">{bounds.first_login ? fmtTime12(bounds.first_login) : '—'}</span>
          </span>
          <span className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold tabular-nums bg-rose-50 text-rose-700 ring-1 ring-rose-200/60 dark:bg-rose-500/15 dark:text-rose-200 dark:ring-rose-500/30">
            <LogOut size={10} className="shrink-0" />
            <span className="opacity-70 shrink-0">Last out</span>
            <span className="ml-auto shrink-0">{bounds.last_logout ? fmtTime12(bounds.last_logout) : '—'}</span>
          </span>
        </div>
      )}

      {/* Bottom progress strip — fills proportional to a full day */}
      {hours > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/5 dark:bg-white/5">
          <span
            className={`block h-full ${style.dot}`}
            style={{ width: `${fillPct}%`, opacity: 0.7 }}
          />
        </div>
      )}
    </button>
  );
}

function MonthGrid({ anchor, hoursByDate, tasksByDate, boundsByDate, projectColors, today, onCellClick }: {
  anchor: Date;
  hoursByDate: Record<string, number>;
  tasksByDate: Record<string, DailyTask[]>;
  boundsByDate: Record<string, DayBounds>;
  projectColors: Record<string, string>;
  today: string;
  onCellClick: (d: Date) => void;
}) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const cells: { date: Date | null; key: string }[] = [];
  const startDow = (first.getDay() + 6) % 7;
  for (let i = 0; i < startDow; i++) cells.push({ date: null, key: `pad-l-${i}` });
  for (let d = 1; d <= last.getDate(); d++) {
    const date = new Date(first.getFullYear(), first.getMonth(), d);
    cells.push({ date, key: ymd(date) });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, key: `pad-r-${cells.length}` });

  return (
    <div>
      <div className="grid grid-cols-7 mb-3 px-1">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
          <div
            key={d}
            className={`text-[10px] uppercase tracking-[0.12em] font-semibold text-center ${
              i >= 5 ? 'text-slate-300 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {cells.map((c) =>
          c.date
            ? <MonthCell
                key={c.key}
                date={c.date}
                hours={hoursByDate[ymd(c.date)] || 0}
                tasks={tasksByDate[ymd(c.date)] || []}
                bounds={boundsByDate[ymd(c.date)]}
                projectColors={projectColors}
                today={today}
                onClick={() => onCellClick(c.date!)}
              />
            : <div key={c.key} />,
        )}
      </div>
    </div>
  );
}

function WeekRow({ anchor, hoursByDate, tasksByDate, boundsByDate, projectColors, today, onCellClick }: {
  anchor: Date;
  hoursByDate: Record<string, number>;
  tasksByDate: Record<string, DailyTask[]>;
  boundsByDate: Record<string, DayBounds>;
  projectColors: Record<string, string>;
  today: string;
  onCellClick: (d: Date) => void;
}) {
  const { from } = weekRange(anchor);
  const days = Array.from({ length: 7 }, (_, i) => new Date(from.getFullYear(), from.getMonth(), from.getDate() + i));
  return (
    <div>
      {/* Header labels: only shown on md+ where the grid is horizontal */}
      <div className="hidden md:grid grid-cols-7 mb-3 px-1">
        {days.map((d, i) => (
          <div
            key={i}
            className={`text-[10px] uppercase tracking-[0.12em] font-semibold text-center ${
              i >= 5 ? 'text-slate-300 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {d.toLocaleDateString(undefined, { weekday: 'short' })} {d.getDate()}
          </div>
        ))}
      </div>
      {/* On mobile each day is a full-width row; on md+ it's a 7-column grid. */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
        {days.map((d) => (
          <WeekCell
            key={ymd(d)}
            date={d}
            hours={hoursByDate[ymd(d)] || 0}
            tasks={tasksByDate[ymd(d)] || []}
            bounds={boundsByDate[ymd(d)]}
            projectColors={projectColors}
            today={today}
            onClick={() => onCellClick(d)}
          />
        ))}
      </div>
    </div>
  );
}

function DayCard({ date, hours, tasks, bounds, projectColors, onOpen }: {
  date: Date; hours: number; tasks: DailyTask[]; bounds?: DayBounds; projectColors: Record<string, string>; onOpen: () => void;
}) {
  void projectColors; // not used after we stripped the per-task list
  const dow = date.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const isFuture = ymd(date) > todayStr();
  const bucket = dayBucket(hours, isWeekend, isFuture);
  const style = BUCKET_STYLE[bucket];
  const fillPct = Math.min(100, Math.round((hours / FULL_DAY_HOURS) * 100));

  return (
    <div className={`rounded-2xl border p-5 md:p-6 ${style.cell}`}>
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-wider opacity-70 font-semibold">
            {date.toLocaleDateString(undefined, { weekday: 'long' })}
          </div>
          <div className="text-2xl md:text-3xl font-bold tabular-nums">
            {date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-4xl font-bold tabular-nums">
              {hours.toFixed(1)}<span className="text-base font-medium opacity-70 ml-0.5">h</span>
            </div>
            <div className="text-[11px] opacity-70">
              {hours === 0
                ? (isFuture ? 'Upcoming' : 'No tasks logged')
                : `${fillPct}% of a ${FULL_DAY_HOURS}h day · ${tasks.length} task${tasks.length === 1 ? '' : 's'}`}
            </div>
          </div>
          {style.dot && <span className={`h-3 w-3 rounded-full ${style.dot}`} />}
        </div>
      </div>

      {/* Login / Logout / Hours summary — bookends of the work day at a glance */}
      {(bounds?.first_login || bounds?.last_logout) && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <BoundStat icon={<LogIn size={14} />}  label="First in"   value={fmtTime12(bounds?.first_login || '') || '—'} tone="emerald" />
          <BoundStat icon={<LogOut size={14} />} label="Last out"   value={fmtTime12(bounds?.last_logout || '') || '—'} tone="rose" />
          <BoundStat icon={<Clock size={14} />}  label="Work hours" value={`${hours.toFixed(2)}h`}                       tone="brand" />
        </div>
      )}

      {hours > 0 && (
        <div className="h-2 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden mb-5">
          <div className={`h-full ${style.dot} opacity-80`} style={{ width: `${fillPct}%` }} />
        </div>
      )}

      {/* Task list intentionally NOT rendered here — full breakdown lives at
          /my-activity. The Day card stays focused on bounds + total hours. */}
      {tasks.length === 0 && !isFuture && (
        <div className="text-center text-sm opacity-60 py-6">No tasks logged this day.</div>
      )}

      <div className="mt-5 flex justify-end">
        <button onClick={onOpen} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
          Open in My Activity →
        </button>
      </div>
    </div>
  );
}

// Compact label/value tile used in the Day view to show login / logout / work
// hours side-by-side. Each tile is its own colored card matching the calendar
// cell badges so the three views share a visual language.
function BoundStat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'emerald' | 'rose' | 'brand' }) {
  const toneClass =
    tone === 'emerald'
      ? 'bg-emerald-50 ring-emerald-200/70 dark:bg-emerald-500/10 dark:ring-emerald-500/30 text-emerald-700 dark:text-emerald-200'
      : tone === 'rose'
      ? 'bg-rose-50 ring-rose-200/70 dark:bg-rose-500/10 dark:ring-rose-500/30 text-rose-700 dark:text-rose-200'
      : 'bg-brand-50 ring-brand-200/70 dark:bg-brand-500/10 dark:ring-brand-500/30 text-brand-700 dark:text-brand-200';
  return (
    <div className={`min-w-0 rounded-xl ring-1 p-3 ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold opacity-80">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-base sm:text-lg font-bold tabular-nums truncate">{value}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded ${color}`} />
      {label}
    </span>
  );
}
