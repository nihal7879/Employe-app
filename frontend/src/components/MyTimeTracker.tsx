import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Clock, Coffee, Trash2, Plus, Eye, Pencil } from 'lucide-react';
import { api } from '../lib/api';
import type { DailyTask } from '../types';
import DatePicker from './ui/DatePicker';
import ConfirmDialog from './ConfirmDialog';
import Modal from './Modal';
import { Textarea } from './ui/Textarea';
import { Skeleton } from './Skeleton';

const COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#A78BFA', '#84CC16', '#F97316', '#14B8A6'];

type View = 'day' | 'week' | 'month' | 'range';

const ymd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};
const todayStr = () => ymd(new Date());
const monthStartStr = () => {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
};

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
function groupHours(tasks: DailyTask[], field: keyof DailyTask, fallback: string) {
  const m: Record<string, number> = {};
  for (const t of tasks) {
    const k = ((t[field] as string) || fallback);
    m[k] = (m[k] || 0) + Number(t.hours_spent || 0);
  }
  return Object.entries(m).map(([name, hours]) => ({ name, hours })).sort((a, b) => b.hours - a.hours);
}

export default function MyTimeTracker({ employeeId }: { employeeId?: string }) {
  const [view, setView] = useState<View>('day');
  const [date, setDate] = useState(todayStr());
  const [customFrom, setCustomFrom] = useState(monthStartStr());
  const [customTo, setCustomTo] = useState(todayStr());
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [viewTask, setViewTask] = useState<DailyTask | null>(null);
  const [editTask, setEditTask] = useState<DailyTask | null>(null);
  const navigate = useNavigate();

  const range = useMemo(
    () => (view === 'range' ? { from: customFrom, to: customTo } : rangeFor(view, date)),
    [view, date, customFrom, customTo],
  );

  const load = () => {
    setLoading(true);
    api.get('/daily-tasks', { params: { from: range.from, to: range.to, employee_id: employeeId || undefined } })
      .then((r) => setTasks(r.data || []))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [range.from, range.to, employeeId]);

  const removeTask = async () => {
    if (confirmId == null) return;
    try {
      await api.delete(`/daily-tasks/${confirmId}`);
      toast.success('Task deleted');
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to delete');
    }
  };

  // Consistent color per project across the range
  const projectColors = useMemo(() => {
    const names = Array.from(new Set(tasks.map((t) => t.project_name || '—'))).sort();
    const m: Record<string, string> = {};
    names.forEach((n, i) => { m[n] = COLORS[i % COLORS.length]; });
    return m;
  }, [tasks]);

  const totalHours = tasks.reduce((s, t) => s + Number(t.hours_spent || 0), 0);

  const byClient = useMemo(() => groupHours(tasks, 'client_name', '—'), [tasks]);
  const byActivity = useMemo(() => groupHours(tasks, 'activity_name', 'Other'), [tasks]);

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
            {(['day', 'week', 'month', 'range'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${
                  view === v
                    ? 'bg-white dark:bg-white/[0.12] text-brand-700 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {v === 'range' ? 'Custom' : v}
              </button>
            ))}
          </div>
          {view === 'range' ? (
            <div className="flex items-center gap-2">
              <div className="w-40"><DatePicker value={customFrom} onChange={setCustomFrom} clearable={false} /></div>
              <span className="text-slate-400 text-sm">→</span>
              <div className="w-40"><DatePicker value={customTo} onChange={setCustomTo} clearable={false} /></div>
            </div>
          ) : (
            <div className="w-44">
              <DatePicker value={date} onChange={setDate} clearable={false} />
            </div>
          )}
          {!employeeId && (
            <button onClick={() => navigate('/tasks')} className="btn-primary shrink-0">
              <Plus size={15} /> Add task
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <TrackerSkeleton />
      ) : tasks.length === 0 ? (
        <div className="text-center py-12">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-slate-50 dark:bg-white/[0.06] items-center justify-center mb-3">
            <Clock size={24} className="text-slate-400" />
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">No tasks logged in this {view === 'range' ? 'range' : view}.</p>
          {!employeeId && <a href="/tasks" className="btn-primary inline-flex">Log a task</a>}
        </div>
      ) : (
        <div className="space-y-6">
          {view === 'day'
            ? <DayTimeline tasks={tasks} projectColors={projectColors} onDelete={setConfirmId} onView={setViewTask} onEdit={employeeId ? undefined : setEditTask} />
            : <DaySections tasks={tasks} projectColors={projectColors} onDelete={setConfirmId} onView={setViewTask} onEdit={employeeId ? undefined : setEditTask} />}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 pt-4 border-t border-slate-100 dark:border-white/[0.06]">
            <BreakdownList title="Hours by client" rows={byClient} />
            <BreakdownList title="Hours by activity" rows={byActivity} />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete this task?"
        message="This task will be removed from your log. This action cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={removeTask}
        onClose={() => setConfirmId(null)}
      />

      <TaskDetailModal task={viewTask} onClose={() => setViewTask(null)} />

      <EditTaskModal
        task={editTask}
        onClose={() => setEditTask(null)}
        onSaved={() => { setEditTask(null); load(); }}
      />
    </motion.div>
  );
}

/* ---------------- Edit task (current-date description) ---------------- */

function EditTaskModal({ task, onClose, onSaved }: {
  task: DailyTask | null; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (task) { setTitle(task.task_title || ''); setDesc(task.description || ''); }
  }, [task]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;
    setSaving(true);
    try {
      await api.put(`/daily-tasks/${task.id}`, { task_title: title, description: desc });
      toast.success('Task updated');
      onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.message?.[0] || err.response?.data?.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!task} title="Edit task" onClose={onClose} size="lg">
      {task && (
        <form onSubmit={save} className="space-y-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {task.project_name || '—'} · {task.activity_name || '—'} · {task.task_date}
          </div>
          <div>
            <label className="label">Task title</label>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
          </div>
          <div>
            <label className="label">Description</label>
            <Textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What did you work on?" />
          </div>
          <div className="flex justify-end gap-2 -mx-5 -mb-5 px-5 py-4 border-t border-slate-100 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02]">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function TaskDetailModal({ task, onClose }: { task: DailyTask | null; onClose: () => void }) {
  return (
    <Modal open={!!task} title="Task details" onClose={onClose} size="lg">
      {task && (
        <div className="space-y-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Task</div>
            <div className="font-semibold text-slate-900 dark:text-white whitespace-pre-wrap break-words">{task.task_title || '—'}</div>
          </div>
          {task.description && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Description</div>
              <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{task.description}</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-3 border-t border-slate-100 dark:border-white/10">
            <DetailField label="Date" value={task.task_date} />
            <DetailField label="Client" value={task.client_name} />
            <DetailField label="Project" value={task.project_name} />
            <DetailField label="Activity" value={task.activity_name} />
            <DetailField label="Assigned By" value={task.assigned_by} />
            <DetailField label="Reference" value={task.reference} />
            <DetailField label="Hours" value={Number(task.hours_spent).toFixed(2)} />
            <DetailField label="Time" value={`${task.start_time || '—'} → ${task.end_time || '—'}`} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function DetailField({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-sm text-slate-900 dark:text-white break-words">{value === 0 || value ? value : '—'}</div>
    </div>
  );
}

/* ---------------- Loading skeleton ---------------- */

function TrackerSkeleton() {
  return (
    <div className="space-y-6">
      {/* timeline bar + ticks */}
      <div className="space-y-2">
        <Skeleton className="h-5 w-full rounded-full" />
        <div className="flex justify-between">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-3 w-8" />)}
        </div>
      </div>
      {/* task rows */}
      <div className="space-y-4 pt-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-4 w-14 shrink-0" />
            <Skeleton className="h-4 w-28 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Day timeline ---------------- */

function DayTimeline({ tasks, projectColors, onDelete, onView, onEdit }: { tasks: DailyTask[]; projectColors: Record<string, string>; onDelete?: (id: number) => void; onView?: (t: DailyTask) => void; onEdit?: (t: DailyTask) => void }) {
  const timed = useMemo(() => (
    tasks
      .map((t) => ({ t, start: toMin(t.start_time), end: toMin(t.end_time) }))
      .filter((x): x is { t: DailyTask; start: number; end: number } =>
        x.start != null && x.end != null && x.end > x.start)
      .sort((a, b) => a.start - b.start)
  ), [tasks]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (timed.length === 0) {
    return <DayTable tasks={tasks} projectColors={projectColors} onDelete={onDelete} onView={onView} onEdit={onEdit} note="No start/end times set on these tasks." />;
  }

  const minStart = Math.min(...timed.map((x) => x.start));
  const maxEnd = Math.max(...timed.map((x) => x.end));
  // Window fits the actual first→last task exactly (no leading/trailing empty space,
  // and no fixed 9AM anchor — every day/person starts wherever their work starts).
  const winStart = minStart;
  const winEnd = maxEnd;
  const span = Math.max(1, winEnd - winStart);

  // Break gaps between consecutive work blocks (from first task start onward)
  const breaks: { start: number; end: number }[] = [];
  let cursor = timed[0].start;
  for (const b of timed) {
    if (b.start > cursor) breaks.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  const breakMin = breaks.reduce((s, b) => s + (b.end - b.start), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5"><Clock size={13} /> {fmtTime(minStart)} – {fmtTime(maxEnd)}</span>
        <span className="inline-flex items-center gap-1.5"><Coffee size={13} /> {fmtDur(breakMin)} break</span>
      </div>

      {/* Timeline — colored segments; hover shows a styled tooltip */}
      <div className="pt-1">
        <div className="relative">
          <div className="relative h-5 rounded-full overflow-hidden bg-slate-100 dark:bg-white/[0.06]">
            {breaks.map((bk, i) => {
              const left = ((bk.start - winStart) / span) * 100;
              const width = ((bk.end - bk.start) / span) * 100;
              return (
                <div
                  key={`bk-${i}`}
                  className="absolute top-0 bottom-0 bg-slate-200 dark:bg-white/[0.12] flex items-center justify-center"
                  style={{ left: `${left}%`, width: `${width}%` }}
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
                  className="absolute top-0 bottom-0 cursor-pointer transition-opacity hover:opacity-90"
                  style={{ left: `${left}%`, width: `${Math.max(width, 1.2)}%`, background: projectColors[b.t.project_name || '—'] }}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
                />
              );
            })}
          </div>

          {/* Styled hover card */}
          <AnimatePresence>
            {hoverIdx != null && (() => {
              const b = timed[hoverIdx];
              const center = (((b.start + b.end) / 2 - winStart) / span) * 100;
              const left = Math.min(Math.max(center, 9), 91);
              return (
                <motion.div
                  key="tt"
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-full mb-2 z-50 -translate-x-1/2 pointer-events-none"
                  style={{ left: `${left}%` }}
                >
                  <div className="rounded-xl bg-slate-900 dark:bg-slate-800 text-white shadow-xl ring-1 ring-black/10 px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: projectColors[b.t.project_name || '—'] }} />
                      <span className="font-semibold text-xs">{b.t.project_name || '—'}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-300">
                      <Clock size={11} /> {fmtTime(b.start)} – {fmtTime(b.end)}
                    </div>
                    {b.t.activity_name && (
                      <div className="mt-0.5 text-[11px] text-slate-400">{b.t.activity_name}</div>
                    )}
                  </div>
                  <div className="h-2 w-2 rotate-45 bg-slate-900 dark:bg-slate-800 mx-auto -mt-1" />
                </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>
      </div>

      <DayTable tasks={tasks} projectColors={projectColors} onDelete={onDelete} onView={onView} onEdit={onEdit} />
    </div>
  );
}

function fmtDur(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/* Project / Work order table — tasks + inferred break rows */
type Row =
  | { kind: 'task'; t: DailyTask; s: number | null; e: number | null }
  | { kind: 'break'; s: number; e: number };

function DayTable({ tasks, projectColors, note, onDelete, onView, onEdit }: {
  tasks: DailyTask[]; projectColors: Record<string, string>; note?: string; onDelete?: (id: number) => void; onView?: (t: DailyTask) => void; onEdit?: (t: DailyTask) => void;
}) {
  const today = todayStr();
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
            <th className="table-th"></th>
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
                  <td className="table-td"></td>
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
                      {(t.assigned_by || t.reference) && (
                        <div className="text-xs text-slate-400 dark:text-slate-500 truncate">
                          {t.assigned_by ? `Assigned by ${t.assigned_by}` : ''}
                          {t.assigned_by && t.reference ? ' · ' : ''}
                          {t.reference ? `Ref: ${t.reference}` : ''}
                        </div>
                      )}
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
                <td className="table-td text-right">
                  <div className="flex items-center justify-end gap-2.5">
                    {onView && (
                      <button onClick={() => onView(t)} className="text-slate-400 hover:text-brand-600 dark:hover:text-brand-300 transition-colors" title="View task details">
                        <Eye size={16} />
                      </button>
                    )}
                    {onEdit && t.task_date === today && (
                      <button onClick={() => onEdit(t)} className="text-slate-400 hover:text-brand-600 dark:hover:text-brand-300 transition-colors" title="Edit today's task">
                        <Pencil size={14} />
                      </button>
                    )}
                    {onDelete && (
                      <button onClick={() => onDelete(t.id)} className="text-slate-400 hover:text-rose-500 transition-colors" title="Delete task">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Week / Month / Custom — per-day timesheet sections (scrollable) ---------------- */

function DaySections({ tasks, projectColors, onDelete, onView, onEdit }: { tasks: DailyTask[]; projectColors: Record<string, string>; onDelete?: (id: number) => void; onView?: (t: DailyTask) => void; onEdit?: (t: DailyTask) => void }) {
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
          <DayTimeline tasks={dayTasks} projectColors={projectColors} onDelete={onDelete} onView={onView} onEdit={onEdit} />
        </div>
      ))}
    </div>
  );
}

/* ---------------- breakdown list (project / client / activity) ---------------- */

function BreakdownList({ title, rows, colors }: {
  title: string;
  rows: { name: string; hours: number }[];
  colors?: Record<string, string>;
}) {
  const max = Math.max(...rows.map((r) => r.hours), 1);
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">{title}</div>
      <div className="space-y-2.5">
        {rows.length === 0 && <div className="text-sm text-slate-400">No data.</div>}
        {rows.map((r, i) => {
          const color = colors?.[r.name] || COLORS[i % COLORS.length];
          return (
            <div key={r.name} className="flex items-center gap-3">
              <div className="flex items-center gap-2 w-32 shrink-0">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-sm font-medium text-slate-900 dark:text-white truncate">{r.name}</span>
              </div>
              <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(r.hours / max) * 100}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ background: color }}
                />
              </div>
              <div className="w-16 text-right tabular-nums">
                <span className="text-sm font-bold text-slate-900 dark:text-white">{r.hours.toFixed(1)}h</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

