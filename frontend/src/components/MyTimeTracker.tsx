import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Coffee } from 'lucide-react';
import { api } from '../lib/api';
import type { DailyTask } from '../types';
import DatePicker from './ui/DatePicker';

const COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#A78BFA', '#84CC16', '#F97316', '#14B8A6'];

type View = 'day' | 'week' | 'month';

const ymd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};
const todayStr = () => ymd(new Date());

function rangeFor(view: View, dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  if (view === 'day') return { from: dateStr, to: dateStr };
  if (view === 'week') {
    const dow = (d.getDay() + 6) % 7; // Monday = 0
    const mon = new Date(d); mon.setDate(d.getDate() - dow);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { from: ymd(mon), to: ymd(sun) };
  }
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: ymd(first), to: ymd(last) };
}

function toMin(t?: string): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}
function fmtTime(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}
function fmtHour(min: number) {
  const h = Math.floor(min / 60) % 24;
  const period = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return `${h12}${period}`;
}
function fmtDur(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
function fmtHMS(hours: number) {
  const total = Math.round(hours * 3600);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function shortDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function MyTimeTracker() {
  const [view, setView] = useState<View>('day');
  const [date, setDate] = useState(todayStr());
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => rangeFor(view, date), [view, date]);

  useEffect(() => {
    setLoading(true);
    api.get('/daily-tasks', { params: { from: range.from, to: range.to } })
      .then((r) => setTasks(r.data || []))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [range.from, range.to]);

  // Consistent color per project across the range
  const projectColors = useMemo(() => {
    const names = Array.from(new Set(tasks.map((t) => t.project_name || '—'))).sort();
    const m: Record<string, string> = {};
    names.forEach((n, i) => { m[n] = COLORS[i % COLORS.length]; });
    return m;
  }, [tasks]);

  const totalHours = tasks.reduce((s, t) => s + Number(t.hours_spent || 0), 0);

  // Hours per project (for breakdown)
  const byProject = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of tasks) {
      const p = t.project_name || '—';
      m[p] = (m[p] || 0) + Number(t.hours_spent || 0);
    }
    return Object.entries(m).map(([name, hours]) => ({ name, hours })).sort((a, b) => b.hours - a.hours);
  }, [tasks]);

  // Hours per activity (development / testing / client meeting / …)
  const byActivity = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of tasks) {
      const a = t.activity_name || 'Other';
      m[a] = (m[a] || 0) + Number(t.hours_spent || 0);
    }
    return Object.entries(m).map(([name, hours]) => ({ name, hours })).sort((a, b) => b.hours - a.hours);
  }, [tasks]);
  const activityColors = useMemo(() => {
    const m: Record<string, string> = {};
    // offset palette so activity colors differ from project colors
    byActivity.forEach((a, i) => { m[a.name] = COLORS[(i + 3) % COLORS.length]; });
    return m;
  }, [byActivity]);

  // Break time = gaps between consecutive tracked tasks, summed per day across the range
  const totalBreakMin = useMemo(() => {
    const byDate: Record<string, { s: number; e: number }[]> = {};
    for (const t of tasks) {
      const s = toMin(t.start_time), e = toMin(t.end_time);
      if (s == null || e == null || e <= s) continue;
      if (!byDate[t.task_date]) byDate[t.task_date] = [];
      byDate[t.task_date].push({ s, e });
    }
    let total = 0;
    for (const d in byDate) {
      const arr = byDate[d].sort((a, b) => a.s - b.s);
      let cursor = arr[0].s;
      for (const seg of arr) {
        if (seg.s > cursor) total += seg.s - cursor;
        cursor = Math.max(cursor, seg.e);
      }
    }
    return total;
  }, [tasks]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5 md:p-6 space-y-5">
      {/* Header + controls */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-brand-500/15 text-brand-500 flex items-center justify-center">
            <Clock size={18} />
          </div>
          <div>
            <h2 className="font-semibold text-lg leading-tight">
              {view === 'day'
                ? new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                : <>{shortDate(range.from)} → {shortDate(range.to)}</>}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Total tracked: <span className="font-semibold text-brand-600 dark:text-brand-400 tabular-nums">{fmtHMS(totalHours)} hrs</span>
            </p>
          </div>
        </div>

        <div className="lg:ml-auto flex items-center gap-2 flex-wrap">
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
          <div className="w-44">
            <DatePicker value={date} onChange={setDate} clearable={false} />
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3">
        <Stat icon={<Clock size={15} />} label="Total hours" value={`${totalHours.toFixed(2)} h`} accent="brand" />
        <Stat icon={<Coffee size={15} />} label="Break" value={fmtDur(totalBreakMin)} accent="ok" />
      </div>

      {loading && tasks.length === 0 ? (
        <div className="text-center text-sm text-slate-400 py-12">Loading…</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-slate-50 dark:bg-white/[0.06] items-center justify-center mb-3">
            <Clock size={24} className="text-slate-400" />
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">No tasks logged in this {view}.</p>
          <a href="/tasks" className="btn-primary inline-flex">Log a task</a>
        </div>
      ) : (
        <div className="space-y-6">
          {view === 'day' ? (
            <DayTimeline tasks={tasks} projectColors={projectColors} />
          ) : (
            <DaySections tasks={tasks} projectColors={projectColors} />
          )}
          <Breakdowns byProject={byProject} projectColors={projectColors} byActivity={byActivity} activityColors={activityColors} />
        </div>
      )}
    </motion.div>
  );
}

/* ---------------- Day timeline ---------------- */

function DayTimeline({ tasks, projectColors }: { tasks: DailyTask[]; projectColors: Record<string, string> }) {
  const timed = useMemo(() => (
    tasks
      .map((t) => ({ t, start: toMin(t.start_time), end: toMin(t.end_time) }))
      .filter((x): x is { t: DailyTask; start: number; end: number } =>
        x.start != null && x.end != null && x.end > x.start)
      .sort((a, b) => a.start - b.start)
  ), [tasks]);

  if (timed.length === 0) {
    return <DayTable tasks={tasks} projectColors={projectColors} note="No start/end times set on these tasks." />;
  }

  const minStart = Math.min(...timed.map((x) => x.start));
  const maxEnd = Math.max(...timed.map((x) => x.end));
  const winStart = Math.floor(minStart / 60) * 60;
  const winEnd = Math.ceil(maxEnd / 60) * 60;
  const span = Math.max(1, winEnd - winStart);

  // Breaks = gaps between consecutive work blocks (from first task start onward)
  const breaks: { start: number; end: number }[] = [];
  let cursor = timed[0].start;
  for (const b of timed) {
    if (b.start > cursor) breaks.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  const breakMin = breaks.reduce((s, b) => s + (b.end - b.start), 0);

  // hour ticks every 3 hours (6am, 9am, 12pm…) to keep it clean like the reference
  const ticks: number[] = [];
  const step = span > 8 * 60 ? 180 : 120;
  for (let m = winStart; m <= winEnd; m += step) ticks.push(m);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5"><Clock size={13} /> {fmtTime(minStart)} – {fmtTime(maxEnd)}</span>
        <span className="inline-flex items-center gap-1.5"><Coffee size={13} /> {fmtDur(breakMin)} break</span>
      </div>

      {/* Timeline — rounded pills on a light track; breaks shown as gray gap segments */}
      <div className="pt-1">
        <div className="relative h-5 rounded-full bg-slate-100 dark:bg-white/[0.06]">
          {breaks.map((bk, i) => {
            const left = ((bk.start - winStart) / span) * 100;
            const width = ((bk.end - bk.start) / span) * 100;
            return (
              <div
                key={`bk-${i}`}
                className="absolute top-0 bottom-0 rounded-full bg-slate-200 dark:bg-white/[0.12] flex items-center justify-center"
                style={{ left: `${left}%`, width: `${width}%` }}
                title={`Break · ${fmtDur(bk.end - bk.start)}`}
              >
                {width > 5 && <Coffee size={10} className="text-slate-400" />}
              </div>
            );
          })}
          {timed.map((b, i) => {
            const left = ((b.start - winStart) / span) * 100;
            const width = ((b.end - b.start) / span) * 100;
            return (
              <div
                key={i}
                className="absolute top-0 bottom-0 rounded-full"
                style={{ left: `${left}%`, width: `${Math.max(width, 1.2)}%`, background: projectColors[b.t.project_name || '—'] }}
                title={`${b.t.project_name || '—'} · ${b.t.activity_name || ''}\n${fmtTime(b.start)}–${fmtTime(b.end)} · ${b.t.task_title}`}
              />
            );
          })}
        </div>
        <div className="relative h-4 mt-1.5">
          {ticks.map((m) => (
            <span
              key={m}
              className="absolute -translate-x-1/2 text-[10px] text-slate-400 tabular-nums"
              style={{ left: `${((m - winStart) / span) * 100}%` }}
            >
              {fmtHour(m)}
            </span>
          ))}
        </div>
      </div>

      <DayTable tasks={tasks} projectColors={projectColors} />
    </div>
  );
}

/* Project / Work order table — Hubstaff-style (tasks + inferred break rows) */
type Row =
  | { kind: 'task'; t: DailyTask; s: number | null; e: number | null }
  | { kind: 'break'; s: number; e: number };

function DayTable({ tasks, projectColors, note }: {
  tasks: DailyTask[]; projectColors: Record<string, string>; note?: string;
}) {
  // tasks with valid times, to infer break gaps between them
  const timed = tasks
    .map((t) => ({ s: toMin(t.start_time), e: toMin(t.end_time) }))
    .filter((x): x is { s: number; e: number } => x.s != null && x.e != null && x.e > x.s)
    .sort((a, b) => a.s - b.s);
  const breaks: { s: number; e: number }[] = [];
  if (timed.length) {
    let cursor = timed[0].s;
    for (const x of timed) {
      if (x.s > cursor) breaks.push({ s: cursor, e: x.s });
      cursor = Math.max(cursor, x.e);
    }
  }

  const rows: Row[] = [
    ...tasks.map((t) => ({ kind: 'task' as const, t, s: toMin(t.start_time), e: toMin(t.end_time) })),
    ...breaks.map((b) => ({ kind: 'break' as const, s: b.s, e: b.e })),
  ].sort((a, b) => (a.s ?? 1e9) - (b.s ?? 1e9));

  return (
    <div className="overflow-x-auto">
      {note && <p className="text-[11px] text-slate-400 mb-2">{note}</p>}
      <table className="w-full">
        <thead>
          <tr>
            <th className="table-th">Project / Work order</th>
            <th className="table-th">Activity</th>
            <th className="table-th text-right">Duration</th>
            <th className="table-th">Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            if (row.kind === 'break') {
              return (
                <tr key={`bk-${i}`} className="bg-slate-50/60 dark:bg-white/[0.02]">
                  <td className="table-td">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full flex items-center justify-center bg-slate-100 dark:bg-white/[0.08] text-slate-400 shrink-0">
                        <Coffee size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-500 dark:text-slate-400">Break</div>
                        <div className="text-xs text-slate-400">Idle time between tasks</div>
                      </div>
                    </div>
                  </td>
                  <td className="table-td text-sm text-slate-400">—</td>
                  <td className="table-td text-right tabular-nums font-semibold text-slate-400">{fmtHMS((row.e - row.s) / 60)}</td>
                  <td className="table-td whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                    {fmtTime(row.s)} – {fmtTime(row.e)}
                  </td>
                </tr>
              );
            }
            const t = row.t;
            const { s, e } = row;
            const dur = fmtHMS(Number(t.hours_spent || 0));
            const color = projectColors[t.project_name || '—'];
            const initial = (t.project_name || '—').charAt(0).toUpperCase();
            return (
              <tr key={t.id}>
                <td className="table-td">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: color }}>
                      {initial}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-white truncate">{t.project_name || '—'}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {t.client_name || '—'}{t.task_title ? ` · ${t.task_title}` : ''}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="table-td">
                  <div className="text-sm text-slate-700 dark:text-slate-300">{t.activity_name || '—'}</div>
                </td>
                <td className="table-td text-right tabular-nums font-semibold text-cyan-600 dark:text-cyan-400">{dur}</td>
                <td className="table-td whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                  {s != null && e != null ? `${fmtTime(s)} – ${fmtTime(e)}` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Week / Month — per-day timesheet sections (scrollable) ---------------- */

function DaySections({ tasks, projectColors }: { tasks: DailyTask[]; projectColors: Record<string, string> }) {
  const days = useMemo(() => {
    const m: Record<string, DailyTask[]> = {};
    for (const t of tasks) {
      if (!m[t.task_date]) m[t.task_date] = [];
      m[t.task_date].push(t);
    }
    return Object.entries(m)
      .map(([date, dayTasks]) => ({
        date,
        dayTasks,
        total: dayTasks.reduce((s, t) => s + Number(t.hours_spent || 0), 0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [tasks]);

  return (
    <div className="max-h-[70vh] overflow-y-auto pr-1 -mr-1 space-y-5">
      {days.map(({ date, dayTasks, total }) => (
        <div key={date} className="rounded-2xl border border-slate-200 dark:border-white/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900 dark:text-white">
              {new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </h3>
            <span className="text-sm tabular-nums font-semibold text-brand-600 dark:text-brand-400">{fmtHMS(total)} hrs</span>
          </div>
          <DayTimeline tasks={dayTasks} projectColors={projectColors} />
        </div>
      ))}
    </div>
  );
}

/* ---------------- Project + activity breakdowns ---------------- */

function Breakdowns({
  byProject, projectColors, byActivity, activityColors,
}: {
  byProject: { name: string; hours: number }[];
  projectColors: Record<string, string>;
  byActivity: { name: string; hours: number }[];
  activityColors: Record<string, string>;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 pt-4 border-t border-slate-100 dark:border-white/[0.06]">
      <BreakdownList title="Hours by project" rows={byProject} colors={projectColors} />
      <BreakdownList title="Hours by activity" rows={byActivity} colors={activityColors} />
    </div>
  );
}

function BreakdownList({ title, rows, colors }: {
  title: string;
  rows: { name: string; hours: number }[];
  colors: Record<string, string>;
}) {
  const max = Math.max(...rows.map((r) => r.hours), 1);
  const total = rows.reduce((s, r) => s + r.hours, 0);
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">{title}</div>
      <div className="space-y-2.5">
        {rows.length === 0 && <div className="text-sm text-slate-400">No data.</div>}
        {rows.map((r) => {
          const pct = total ? Math.round((r.hours / total) * 100) : 0;
          return (
            <div key={r.name} className="flex items-center gap-3">
              <div className="flex items-center gap-2 w-36 shrink-0">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: colors[r.name] }} />
                <span className="text-sm font-medium text-slate-900 dark:text-white truncate">{r.name}</span>
              </div>
              <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(r.hours / max) * 100}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ background: colors[r.name] }}
                />
              </div>
              <div className="w-24 text-right tabular-nums">
                <span className="text-sm font-bold text-slate-900 dark:text-white">{r.hours.toFixed(1)}h</span>
                <span className="text-xs font-normal text-slate-400 ml-1">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- small stat tile ---------------- */

const ACCENTS: Record<string, string> = {
  brand: 'bg-brand-500/15 text-brand-500',
  cyan: 'bg-cyan-500/15 text-cyan-500',
  ok: 'bg-emerald-500/15 text-emerald-500',
  pink: 'bg-pink-500/15 text-pink-500',
};

function Stat({ icon, label, value, sub, accent = 'brand' }: { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2.5 flex items-center gap-3">
      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${ACCENTS[accent] || ACCENTS.brand}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium">{label}</div>
        <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums truncate">
          {value}{sub && <span className="text-xs font-normal text-slate-400 ml-1">{sub}</span>}
        </div>
      </div>
    </div>
  );
}
