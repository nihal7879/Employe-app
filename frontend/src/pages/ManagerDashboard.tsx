import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Users, Clock, ListChecks, FolderKanban, UserCheck, Filter, CheckCircle2, Download } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { api } from '../lib/api';
import type { DailyTask } from '../types';
import StatCard from '../components/StatCard';
import Modal from '../components/Modal';
import MultiSelect from '../components/MultiSelect';
import DatePicker from '../components/ui/DatePicker';
import { TableSkeleton } from '../components/Skeleton';

function downloadCsv(filename: string, rows: Record<string, any>[]) {
  if (!rows || rows.length === 0) { toast.error('Nothing to export'); return; }
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

type SummaryRow = {
  employee_id: number;
  employee_name: string;
  employee_code: string;
  task_count: number;
  total_hours: number;
};
type Breakdown = { name: string; task_count: number; total_hours: number };
type Summary = {
  date: string;
  rows: SummaryRow[];
  grand_total_hours: number;
  grand_total_tasks: number;
  by_project: Breakdown[];
  by_client: Breakdown[];
};
type Assignments = {
  employees: { id: number; name: string; email: string; employee_code: string }[];
  projects: { id: number; project_name: string; project_code: string; client_id?: number | null; client_name?: string }[];
};
type PresentRow = {
  id: number; name: string; employee_code: string; department_name?: string;
  first_login?: string | null; last_logout?: string | null;
};
type PendingRow = {
  id: number; name: string; employee_code: string; email?: string; department_name?: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};
const ymd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};
// [from, to] for a preset range anchored on `anchor`. `to` is clamped to today.
type RangeMode = 'day' | 'week' | 'month' | 'custom';
const rangeFor = (mode: Exclude<RangeMode, 'custom'>, anchor: string): [string, string] => {
  const a = new Date(anchor + 'T00:00:00');
  const t = today();
  const clamp = (s: string) => (s > t ? t : s);
  if (mode === 'day') return [anchor, clamp(anchor)];
  if (mode === 'week') {
    const dow = (a.getDay() + 6) % 7; // Monday = 0
    const mon = new Date(a); mon.setDate(a.getDate() - dow);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return [ymd(mon), clamp(ymd(sun))];
  }
  // month
  const first = new Date(a.getFullYear(), a.getMonth(), 1);
  const last = new Date(a.getFullYear(), a.getMonth() + 1, 0);
  return [ymd(first), clamp(ymd(last))];
};
const fmtHours = (n: number) => `${Number(n || 0).toFixed(2)} h`;
// Decimal hours → "HH:MM:SS" (e.g. 7.5 → "07:30:00").
const fmtDuration = (hours: number) => {
  const total = Math.round(Number(hours || 0) * 3600);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
};

// Labelled read-only field used in the task-detail modal.
function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-sm text-slate-900 dark:text-white break-words">{value === 0 || value ? value : '—'}</div>
    </div>
  );
}

const TILE_ACCENT: Record<string, string> = {
  brand: 'bg-brand-50 dark:bg-brand-500/15',
  ok: 'bg-emerald-50 dark:bg-emerald-500/15',
  cyan: 'bg-cyan-50 dark:bg-cyan-500/15',
  pink: 'bg-pink-50 dark:bg-pink-500/15',
  amber: 'bg-amber-50 dark:bg-amber-500/15',
};

// Compact summary tile: icon box + label + value (matches Reports).
function SummaryTile({ icon, label, value, accent = 'brand' }: { icon?: React.ReactNode; label: string; value: number | string; accent?: string }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      {icon && <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${TILE_ACCENT[accent] || TILE_ACCENT.brand}`}>{icon}</div>}
      <div>
        <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium">{label}</div>
        <div className="mt-0.5 text-2xl font-bold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

// Group tasks' hours by a field (activity/project/client/employee), highest first.
function groupHours(tasks: DailyTask[], field: keyof DailyTask) {
  const m: Record<string, { label: string; hours: number; count: number }> = {};
  for (const t of tasks) {
    const raw = (t as any)[field];
    if (!raw) continue;
    const label = String(raw);
    if (!m[label]) m[label] = { label, hours: 0, count: 0 };
    m[label].hours += Number(t.hours_spent || 0);
    m[label].count += 1;
  }
  return Object.values(m).sort((a, b) => b.hours - a.hours);
}

function ChartBlock({ title, data, color }: { title: string; data: { label: string; hours: number; count: number }[]; color: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-2">{title}</div>
      {data.length === 0 ? (
        <div className="h-[80px] flex items-center justify-center text-sm text-slate-400">No data.</div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(80, Math.min(480, data.length * 34 + 30))}>
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12 }}>
            <CartesianGrid stroke="rgba(15,23,42,0.06)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94A3B8" />
            <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} stroke="#94A3B8" width={140} interval={0} />
            <Tooltip cursor={{ fill: 'rgba(124,58,237,0.06)' }}
              contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, background: '#fff' }}
              labelStyle={{ color: '#0f172a', fontWeight: 600 }}
              itemStyle={{ color: '#334155' }}
              formatter={(v: any) => [fmtHrMin(Number(v)), 'Hours']} />
            <Bar dataKey="hours" radius={[0, 6, 6, 0]} fill={color} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// Distribution analytics across activity / project / client / employee.
function DistributionCharts({ tasks }: { tasks: DailyTask[] }) {
  const work = useMemo(() => tasks.filter((t) => !t.is_break), [tasks]);
  const byActivity = useMemo(() => groupHours(work, 'activity_name'), [work]);
  const byProject = useMemo(() => groupHours(work, 'project_name'), [work]);
  const byClient = useMemo(() => groupHours(work, 'client_name'), [work]);
  const byEmployee = useMemo(() => groupHours(work, 'employee_name'), [work]);
  return (
    <div className="card p-5 md:p-6">
      <div className="mb-5">
        <div className="font-semibold text-lg">Distribution analytics</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">Hours breakdown across activity, project, client, and team member</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        <ChartBlock title="By Activity" data={byActivity} color="#F59E0B" />
        <ChartBlock title="By Project"  data={byProject}  color="#7C3AED" />
        <ChartBlock title="By Client"   data={byClient}   color="#06B6D4" />
        <ChartBlock title="By Team Member" data={byEmployee} color="#10B981" />
      </div>
    </div>
  );
}
const fmtTime = (s?: string | null) =>
  s ? new Date(s.replace(' ', 'T')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
// "HH:MM[:SS]" → "h:mm AM/PM".
const fmtClock = (t?: string | null) => {
  if (!t) return '';
  const [hStr, m = '00'] = t.split(':');
  let h = Number(hStr);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m.padStart(2, '0')} ${ampm}`;
};
const fmtRange = (start?: string | null, end?: string | null) =>
  start && end ? `${fmtClock(start)} – ${fmtClock(end)}` : '—';

// Decimal hours → "Xh Ym" (e.g. 0.83 → "50m", 2.5 → "2h 30m", 2 → "2h").
const fmtHrMin = (hours: number) => {
  const total = Math.round(Number(hours || 0) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

const toMinOfDay = (t?: string) => { const m = t?.match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

// Break hours = idle gaps between an employee's work tasks (per day) + explicit
// break rows, de-duplicated. Mirrors the Reports calculation so a day with a
// lunch gap (no explicit "Break" row) still reports break time.
function totalBreakHours(tasks: DailyTask[]): number {
  const groups = new Map<string, DailyTask[]>();
  for (const t of tasks) {
    const k = `${t.employee_id}|${t.task_date}`;
    const arr = groups.get(k); if (arr) arr.push(t); else groups.set(k, [t]);
  }
  let mins = 0;
  for (const g of groups.values()) {
    const timed = g
      .map((t) => ({ t, s: toMinOfDay(t.start_time), e: toMinOfDay(t.end_time) }))
      .filter((x): x is { t: DailyTask; s: number; e: number } => x.s != null && x.e != null && x.e > x.s)
      .sort((a, b) => a.s - b.s);
    const work = timed.filter((x) => !x.t.is_break);
    const explicit = timed.filter((x) => !!x.t.is_break).map((x) => ({ s: x.s, e: x.e }));
    const gaps: { s: number; e: number }[] = [];
    if (work.length) {
      let cursor = work[0].s;
      for (const b of work) { if (b.s > cursor) gaps.push({ s: cursor, e: b.s }); cursor = Math.max(cursor, b.e); }
    }
    const gapsOnly = gaps.filter((gp) => !explicit.some((e) => e.s >= gp.s && e.e <= gp.e));
    mins += [...gapsOnly, ...explicit].reduce((s, b) => s + (b.e - b.s), 0);
  }
  return mins / 60;
}

export default function ManagerDashboard() {
  // Default to today. Selecting any date in the picker re-drives every card,
  // including the submission compilation.
  const [date, setDate] = useState(today());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [assignments, setAssignments] = useState<Assignments | null>(null);
  const [present, setPresent] = useState<PresentRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Submission compilation — its own date that DEFAULTS to yesterday but follows
  // the picker once the manager changes the date.
  const [subDate, setSubDate] = useState(yesterday());
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    setSubDate(date);
  }, [date]);
  const [ySubmittedRows, setYSubmittedRows] = useState<SummaryRow[]>([]);
  const [yPending, setYPending] = useState<PendingRow[]>([]);
  const [yOverrides, setYOverrides] = useState<any[]>([]);
  // Which submission bucket is open in the detail modal.
  const [yDetail, setYDetail] = useState<null | 'submitted' | 'pending' | 'before'>(null);

  // Clicking a task row opens its full detail in a modal.
  const [taskDetail, setTaskDetail] = useState<DailyTask | null>(null);

  // Task filter: date range (day/week/month/custom) + employee + client + project.
  const [fMode, setFMode] = useState<RangeMode>('day');
  const [fFrom, setFFrom] = useState(today());
  const [fTo, setFTo] = useState(today());
  // Each filter holds a list of selected ids (multi-select). Empty = "All".
  const [fEmp, setFEmp] = useState<string[]>([]);
  const [fClient, setFClient] = useState<string[]>([]);
  const [fProject, setFProject] = useState<string[]>([]);
  const [fActivity, setFActivity] = useState<string[]>([]);
  const [activities, setActivities] = useState<{ id: number; activity_name: string }[]>([]);
  const [tasks, setTasks] = useState<DailyTask[] | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);

  // Apply a preset range, anchored on the dashboard's selected date.
  const applyMode = (mode: Exclude<RangeMode, 'custom'>) => {
    const [f, t] = rangeFor(mode, date);
    setFMode(mode); setFFrom(f); setFTo(t);
  };

  // Unique clients derived from the manager's assigned projects.
  const clientOpts = useMemo(() => {
    const m = new Map<string, string>();
    (assignments?.projects || []).forEach((p) => {
      if (p.client_id != null && p.client_name) m.set(String(p.client_id), p.client_name);
    });
    return [...m].map(([value, label]) => ({ label, value }));
  }, [assignments]);
  const empOpts = useMemo(
    () => (assignments?.employees || []).map((e) => ({ label: e.name, value: String(e.id) })),
    [assignments],
  );
  const activityOpts = useMemo(
    () => activities.map((a) => ({ label: a.activity_name, value: String(a.id) })),
    [activities],
  );
  // Projects filtered by the chosen clients (cascade). With no client selected,
  // every assigned project is offered.
  const projectOptsFor = (clientVals: string[]) => {
    const sel = new Set(clientVals);
    const list = (assignments?.projects || []).filter(
      (p) => !sel.size || sel.has(String(p.client_id ?? '')),
    );
    return list.map((p) => ({ label: p.client_name ? `${p.project_name} · ${p.client_name}` : p.project_name, value: String(p.id) }));
  };

  const load = async () => {
    setLoading(true);
    try {
      const [s, a, p] = await Promise.all([
        api.get('/managers/me/team/summary', { params: { date } }),
        api.get('/managers/me/assignments'),
        api.get('/managers/me/team/present', { params: { date } }),
      ]);
      setSummary(s.data);
      setAssignments(a.data);
      setPresent(Array.isArray(p.data) ? p.data : []);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to load team');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date]);

  // Activities (master data) for the Activity filter — fetched once.
  useEffect(() => {
    api.get('/activities')
      .then((r) => setActivities(Array.isArray(r.data) ? r.data : []))
      .catch(() => { /* non-blocking */ });
  }, []);

  // Submission compilation — re-fetched whenever subDate changes.
  useEffect(() => {
    Promise.all([
      api.get('/managers/me/team/summary', { params: { date: subDate } }),
      api.get('/managers/me/team/pending', { params: { date: subDate } }),
      api.get('/managers/me/team/compliance', { params: { date: subDate } }),
    ])
      .then(([s, pend, comp]) => {
        setYSubmittedRows((s.data?.rows || []).filter((r: SummaryRow) => r.task_count > 0));
        setYPending(Array.isArray(pend.data) ? pend.data : []);
        setYOverrides(Array.isArray(comp.data) ? comp.data : []);
      })
      .catch(() => { /* non-blocking */ });
  }, [subDate]);

  const runTaskFilter = async () => {
    setTasksLoading(true);
    try {
      const r = await api.get('/managers/me/team/tasks', {
        params: {
          from: fFrom,
          to: fTo,
          employee_id: fEmp.join(',') || undefined,
          client_id: fClient.join(',') || undefined,
          project_id: fProject.join(',') || undefined,
          activity_id: fActivity.join(',') || undefined,
        },
      });
      setTasks(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to load tasks');
    } finally {
      setTasksLoading(false);
    }
  };
  // Auto-apply: re-run the task filter whenever any filter changes (no button).
  useEffect(() => { runTaskFilter(); /* eslint-disable-next-line */ }, [fFrom, fTo, fEmp, fClient, fProject, fActivity]);

  // Summary tiles for the filtered team tasks (work vs break split).
  const fStats = useMemo(() => {
    const list = tasks || [];
    const work = list.filter((t) => !t.is_break);
    const workHours = work.reduce((s, t) => s + Number(t.hours_spent || 0), 0);
    const breakHours = totalBreakHours(list);
    return {
      tasks: work.length,
      workHours,
      breakHours,
      employees: new Set(work.map((t) => t.employee_id)).size,
      projects: new Set(work.map((t) => t.project_id)).size,
    };
  }, [tasks]);

  const exportTasks = () => {
    downloadCsv(
      `team-tasks-${fFrom}_to_${fTo}.csv`,
      (tasks || []).map((t) => ({
        'Date': t.task_date,
        'Team Member': t.employee_name || '',
        'Client': t.client_name || '',
        'Project': t.project_name || '',
        'Activity': t.activity_name || '',
        'Task': t.task_title,
        'Description': t.description || '',
        'Duration': fmtDuration(t.hours_spent),
        'Start': fmtClock(t.start_time),
        'End': fmtClock(t.end_time),
      })),
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">My Team</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Daily task summary for the team members assigned to you.
          </p>
        </div>
        <div className="w-48">
          <label className="label">Date</label>
          <DatePicker value={date} onChange={setDate} clearable={false} maxDate={today()} />
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Users size={18} />} label="Team members" accent="brand"
          value={assignments?.employees.length || 0} />
        <StatCard icon={<UserCheck size={18} />} label="Present" accent="cyan"
          value={present.length} />
        <StatCard icon={<ListChecks size={18} />} label="Tasks logged" accent="brand"
          value={summary?.grand_total_tasks || 0} />
        <StatCard icon={<Clock size={18} />} label="Total hours" accent="ok"
          value={summary?.grand_total_hours || 0} format={fmtHrMin} />
      </div>

      {/* Present on selected day + Yesterday's submission compilation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Present today (or selected date) */}
        <div className="card p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
              <UserCheck size={14} /> Present {date === today() ? 'today' : `on ${date}`}
            </div>
            <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full text-xs font-bold bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
              {present.length}
            </span>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto thin-scrollbar">
            <table className="w-full">
              <thead><tr>
                <th className="table-th">Team Member</th>
                <th className="table-th">First login</th>
                <th className="table-th">Last logout</th>
              </tr></thead>
              <tbody>
                {loading && <TableSkeleton rows={4} cols={3} />}
                {!loading && present.map((p) => (
                  <tr key={p.id}>
                    <td className="table-td">
                      <div className="font-medium text-slate-900 dark:text-white">{p.name}</div>
                      <div className="text-xs text-slate-400">{p.employee_code}</div>
                    </td>
                    <td className="table-td text-xs tabular-nums">{fmtTime(p.first_login)}</td>
                    <td className="table-td text-xs tabular-nums">{fmtTime(p.last_logout)}</td>
                  </tr>
                ))}
                {!loading && present.length === 0 && (
                  <tr><td colSpan={3} className="table-td text-center text-slate-400 py-6">
                    No one logged in on this day.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Yesterday's submission compilation (mirrors admin) */}
        <div className="card p-5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-4">
            <CheckCircle2 size={14} /> {subDate === yesterday() ? "Yesterday's submissions" : 'Submissions'} · {subDate}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <button type="button" onClick={() => setYDetail('submitted')} disabled={ySubmittedRows.length === 0}
              className="text-left rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 px-3 py-3 transition-colors hover:bg-emerald-100 dark:hover:bg-emerald-500/15 disabled:cursor-default disabled:hover:bg-emerald-50 dark:disabled:hover:bg-emerald-500/10">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-emerald-700 dark:text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" /> Submitted
              </div>
              <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums mt-1">{ySubmittedRows.length}</div>
            </button>
            <button type="button" onClick={() => setYDetail('pending')} disabled={yPending.length === 0}
              className="text-left rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 px-3 py-3 transition-colors hover:bg-rose-100 dark:hover:bg-rose-500/15 disabled:cursor-default disabled:hover:bg-rose-50 dark:disabled:hover:bg-rose-500/10">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-rose-700 dark:text-rose-300">
                <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" /> Pending
              </div>
              <div className="text-2xl font-bold text-rose-700 dark:text-rose-300 tabular-nums mt-1">{yPending.length}</div>
            </button>
            <button type="button" onClick={() => setYDetail('before')} disabled={yOverrides.length === 0}
              className={`text-left rounded-xl px-3 py-3 border transition-colors disabled:cursor-default ${yOverrides.length > 0 ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-500/15' : 'bg-slate-50 dark:bg-white/[0.04] border-slate-100 dark:border-white/10'}`}>
              <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold ${yOverrides.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>
                <span className={`h-2 w-2 rounded-full shrink-0 ${yOverrides.length > 0 ? 'bg-amber-500' : 'bg-slate-400'}`} /> Before login
              </div>
              <div className={`text-2xl font-bold tabular-nums mt-1 ${yOverrides.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>{yOverrides.length}</div>
            </button>
          </div>
          {yPending.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-2">Pending team members</div>
              <div className="flex flex-wrap gap-2">
                {yPending.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-xs font-medium text-rose-700 dark:text-rose-300">
                    {p.name} <span className="text-rose-400">· {p.employee_code}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Task filter: pick an employee and/or a client-project, scoped to your team */}
      <div className="card p-5 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold text-lg">
            <Filter size={18} className="text-brand-600 dark:text-brand-400" /> Filters
          </div>

          {/* Range presets */}
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] p-1 gap-1">
            {([
              { k: 'day', label: 'Day' },
              { k: 'week', label: 'Week' },
              { k: 'month', label: 'Month' },
              { k: 'custom', label: 'Custom' },
            ] as { k: RangeMode; label: string }[]).map(({ k, label }) => (
              <button
                key={k}
                type="button"
                onClick={() => (k === 'custom' ? setFMode('custom') : applyMode(k))}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                  ${fMode === k
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-white/[0.06]'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40">
            <label className="label">From</label>
            <DatePicker value={fFrom} clearable={false} maxDate={fTo || today()}
              onChange={(v) => { setFFrom(v); setFMode('custom'); }} />
          </div>
          <div className="w-40">
            <label className="label">To</label>
            <DatePicker value={fTo} clearable={false} minDate={fFrom} maxDate={today()}
              onChange={(v) => { setFTo(v); setFMode('custom'); }} />
          </div>
          <div className="min-w-[200px]">
            <label className="label">Team Member</label>
            <MultiSelect value={fEmp} onChange={setFEmp} options={empOpts}
              placeholder="All team members" searchable searchPlaceholder="Search team members…" />
          </div>
          <div className="min-w-[180px]">
            <label className="label">Client</label>
            <MultiSelect value={fClient} onChange={(v) => { setFClient(v); setFProject([]); }}
              options={clientOpts} placeholder="All clients" searchable searchPlaceholder="Search clients…" />
          </div>
          <div className="min-w-[200px]">
            <label className="label">Project</label>
            <MultiSelect value={fProject} onChange={setFProject} options={projectOptsFor(fClient)}
              placeholder="All projects" searchable searchPlaceholder="Search projects…" />
          </div>
          <div className="min-w-[180px]">
            <label className="label">Activity</label>
            <MultiSelect value={fActivity} onChange={setFActivity} options={activityOpts}
              placeholder="All activities" searchable searchPlaceholder="Search activities…" />
          </div>
        </div>

        {(fEmp.length || fClient.length || fProject.length || fActivity.length) > 0 && (
          <div className="flex justify-end">
            <button
              className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              onClick={() => { setFEmp([]); setFClient([]); setFProject([]); setFActivity([]); }}
            >
              Clear filters
            </button>
          </div>
        )}

      </div>

      {/* Summary tiles + distribution analytics for the filtered team tasks */}
      {tasks !== null && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <SummaryTile icon={<ListChecks size={16} className="text-brand-600 dark:text-brand-300" />} label="Tasks" accent="brand" value={fStats.tasks} />
            <SummaryTile icon={<Clock size={16} className="text-emerald-600 dark:text-emerald-300" />} label="Total Hours" accent="ok" value={fmtHrMin(fStats.workHours)} />
            <SummaryTile icon={<Clock size={16} className="text-amber-600 dark:text-amber-300" />} label="Break Hours" accent="amber" value={fmtHrMin(fStats.breakHours)} />
            <SummaryTile icon={<Users size={16} className="text-cyan-600 dark:text-cyan-300" />} label="Team Members" accent="cyan" value={fStats.employees} />
            <SummaryTile icon={<FolderKanban size={16} className="text-pink-600 dark:text-pink-300" />} label="Projects" accent="pink" value={fStats.projects} />
          </div>
          <DistributionCharts tasks={tasks} />

          {/* Task list */}
          <div className="card p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
                <ListChecks size={14} /> Tasks · {tasks.length}
              </div>
              <button className="btn-secondary" onClick={exportTasks} disabled={tasks.length === 0}>
                <Download size={16} /> Download
              </button>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                <th className="table-th">Date</th>
                <th className="table-th">Team Member</th>
                <th className="table-th">Project</th>
                <th className="table-th">Activity</th>
                <th className="table-th">Task</th>
                <th className="table-th text-right">Duration</th>
                <th className="table-th">Time</th>
              </tr></thead>
              <tbody>
                {tasksLoading && <TableSkeleton rows={4} cols={7} />}
                {!tasksLoading && tasks.map((t) => (
                  <tr key={t.id}
                    onClick={() => setTaskDetail(t)}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                  >
                    <td className="table-td text-xs tabular-nums whitespace-nowrap">{t.task_date || '—'}</td>
                    <td className="table-td">{t.employee_name || '—'}</td>
                    <td className="table-td">{t.project_name || '—'}</td>
                    <td className="table-td">{t.activity_name || '—'}</td>
                    <td className="table-td max-w-md">
                      <div className="font-medium text-slate-900 dark:text-white">{t.task_title}</div>
                      {t.description && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap break-words mt-0.5 line-clamp-2">{t.description}</div>
                      )}
                    </td>
                    <td className="table-td text-right tabular-nums">{fmtDuration(t.hours_spent)}</td>
                    <td className="table-td text-xs text-slate-500 whitespace-nowrap">{fmtRange(t.start_time, t.end_time)}</td>
                  </tr>
                ))}
                {!tasksLoading && tasks.length === 0 && (
                  <tr><td colSpan={7} className="table-td text-center text-slate-400 py-6">
                    No tasks match this filter.
                  </td></tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}

      {/* Task detail: full info for a single clicked task */}
      <Modal open={taskDetail !== null} title="Task details" onClose={() => setTaskDetail(null)} size="lg">
        {taskDetail && (
          <div className="space-y-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Task</div>
              <div className="font-semibold text-slate-900 dark:text-white whitespace-pre-wrap break-words">{taskDetail.task_title}</div>
            </div>
            {taskDetail.description && (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Description</div>
                <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{taskDetail.description}</div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-3 border-t border-slate-100 dark:border-white/10">
              <Field label="Date" value={taskDetail.task_date} />
              <Field label="Team Member" value={taskDetail.employee_name} />
              <Field label="Client" value={taskDetail.client_name} />
              <Field label="Project" value={taskDetail.project_name} />
              <Field label="Activity" value={taskDetail.activity_name} />
              <Field label="Assigned By" value={taskDetail.assigned_by} />
              <Field label="Reference" value={taskDetail.reference} />
              <Field label="Duration" value={fmtDuration(taskDetail.hours_spent)} />
              <Field label="Time" value={`${fmtClock(taskDetail.start_time) || '—'} - ${fmtClock(taskDetail.end_time) || '—'}`} />
            </div>
          </div>
        )}
      </Modal>

      {/* Yesterday bucket detail: who submitted / is pending / logged before login */}
      <Modal
        open={yDetail !== null}
        title={
          yDetail === 'submitted' ? `Submitted · ${subDate}`
            : yDetail === 'pending' ? `Pending · ${subDate}`
            : yDetail === 'before' ? `Logged task before login · ${subDate}`
            : ''
        }
        onClose={() => setYDetail(null)}
        size="lg"
      >
        {yDetail === 'submitted' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                <th className="table-th">Team Member</th>
                <th className="table-th text-right">Tasks</th>
                <th className="table-th text-right">Hours</th>
              </tr></thead>
              <tbody>
                {ySubmittedRows.map((r) => (
                  <tr key={r.employee_id}>
                    <td className="table-td">
                      <div className="font-medium text-slate-900 dark:text-white">{r.employee_name}</div>
                      <div className="text-xs text-slate-400">{r.employee_code}</div>
                    </td>
                    <td className="table-td text-right tabular-nums">{r.task_count}</td>
                    <td className="table-td text-right tabular-nums">{fmtHours(r.total_hours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {yDetail === 'pending' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                <th className="table-th">Team Member</th>
                <th className="table-th">Department</th>
                <th className="table-th">Email</th>
              </tr></thead>
              <tbody>
                {yPending.map((p) => (
                  <tr key={p.id}>
                    <td className="table-td">
                      <div className="font-medium text-slate-900 dark:text-white">{p.name}</div>
                      <div className="text-xs text-slate-400">{p.employee_code}</div>
                    </td>
                    <td className="table-td text-sm">{p.department_name || '—'}</td>
                    <td className="table-td text-sm text-slate-500">{p.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {yDetail === 'before' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                <th className="table-th">Team Member</th>
                <th className="table-th">First login</th>
                <th className="table-th">Earliest task</th>
                <th className="table-th text-right">Tasks before login</th>
              </tr></thead>
              <tbody>
                {yOverrides.map((o: any) => (
                  <tr key={o.id}>
                    <td className="table-td">
                      <div className="font-medium text-slate-900 dark:text-white">{o.name}</div>
                      <div className="text-xs text-slate-400">{o.employee_code}</div>
                    </td>
                    <td className="table-td text-xs tabular-nums">{o.first_login || '—'}</td>
                    <td className="table-td text-xs tabular-nums">{o.earliest_task || '—'}</td>
                    <td className="table-td text-right tabular-nums">{o.tasks_before_login}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
