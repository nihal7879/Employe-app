import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CalendarClock, Flag, ClipboardCheck, AlertTriangle, Search, MessageSquare, ListPlus,
  LayoutGrid, List as ListIcon, GripVertical,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { AssignedTask, Employee } from '../types';
import TaskDetailModal, { STATUSES, priorityColor } from '../components/TaskDetailModal';
import StatusSelect from '../components/StatusSelect';
import Select from '../components/Select';
import { TableSkeleton } from '../components/Skeleton';
import { DUE_OPTIONS, matchesDue, isOverdue, type DueFilter } from '../lib/dueFilter';

// Local calendar date — toISOString() is UTC and reads as yesterday before
// 5:30 AM IST, which would mis-flag due-today tasks.
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Status = typeof STATUSES[number];
type View = 'board' | 'list';

// Per-column accent. Keeps the three lanes visually distinct without shouting.
const COLUMN_STYLE: Record<Status, { dot: string; head: string }> = {
  'Open':        { dot: 'bg-slate-400',   head: 'text-slate-600 dark:text-slate-300' },
  'In Progress': { dot: 'bg-amber-500',   head: 'text-amber-600 dark:text-amber-400' },
  'Completed':   { dot: 'bg-emerald-500', head: 'text-emerald-600 dark:text-emerald-400' },
};

export default function MyTasks() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tasks, setTasks] = useState<AssignedTask[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailMode, setDetailMode] = useState<'view' | 'comments'>('view');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | Status>('All');
  // ?due=overdue — the dashboard's red Pending tile and the 6 AM email both link
  // here expecting the board to open already filtered to overdue work.
  const [dueFilter, setDueFilter] = useState<DueFilter>(
    () => (DUE_OPTIONS.some((o) => o.value === params.get('due')) ? (params.get('due') as DueFilter) : 'all'),
  );
  // The board is the default; the table is still one click away for anyone who
  // wants to scan due dates in a column. Remembered across visits.
  const [view, setView] = useState<View>(() => (localStorage.getItem('mytasks_view') as View) || 'board');
  useEffect(() => { localStorage.setItem('mytasks_view', view); }, [view]);

  // Drag state: which card is moving, and which lane it's hovering. Dragging is
  // the quick path; the dropdown on each card does the same thing and is the
  // only one that works on touch.
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropCol, setDropCol] = useState<Status | null>(null);

  const cardRefs = useRef<Record<number, HTMLElement | null>>({});

  const load = async () => {
    const r = await api.get('/assigned-tasks/mine');
    setTasks(r.data || []);
  };
  useEffect(() => { (async () => {
    setLoading(true);
    try {
      await load();
      // Employees can mention teammates; fetch the directory if allowed (admins/
      // managers get the full list, plain employees may 403 — ignore quietly).
      try { const e = await api.get('/employees', { params: { include_admin: true } }); setEmployees(e.data); } catch { /* not permitted */ }
    } catch (e: any) { toast.error(e.response?.data?.message || 'Failed to load'); }
    finally { setLoading(false); }
  })(); }, []);

  // Opening a task here (and only here — this is the assignee's own screen) is
  // what clears its New flag. The assigner reviewing the same task in Assign
  // Tasks must not clear it for them.
  const openTask = (id: number, mode: 'view' | 'comments' = 'view') => {
    setDetailMode(mode);
    setDetailId(id);
    api.patch(`/assigned-tasks/${id}/seen`)
      .then(() => {
        setTasks((xs) => xs.map((t) => (t.id === id ? { ...t, seen_at: new Date().toISOString() } : t)));
        window.dispatchEvent(new Event('assigned-tasks:seen')); // sidebar count
      })
      .catch(() => undefined);
  };

  // ?task=<id> — the dashboard's cards land here and point at the task rather
  // than opening it: scroll it into view and ring it. It stays NEW until the
  // user actually clicks it.
  const highlightId = Number(params.get('task')) || null;
  useEffect(() => {
    if (!highlightId || loading) return;
    cardRefs.current[highlightId]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlightId, loading, view]);

  const closeDetail = () => {
    setDetailId(null);
    if (params.get('task')) { params.delete('task'); setParams(params, { replace: true }); }
    void load();
  };

  const overdue = (t: AssignedTask) => t.due_date && t.due_date < today() && t.status !== 'Completed';

  const changeStatus = async (id: number, status: Status) => {
    const prev = tasks.find((t) => t.id === id)?.status;
    if (prev === status) return;
    // Move the card to its new lane immediately; roll back if the server says no.
    setTasks((xs) => xs.map((t) => (t.id === id ? { ...t, status } : t)));
    try {
      await api.patch(`/assigned-tasks/${id}/status`, { status });
      toast.success(`Marked ${status}`);
    } catch (e: any) {
      if (prev) setTasks((xs) => xs.map((t) => (t.id === id ? { ...t, status: prev } : t)));
      toast.error(e.response?.data?.message || 'Failed to update');
    }
  };

  const addToDwr = (t: AssignedTask) => {
    const p = new URLSearchParams();
    p.set('title', t.title);
    if (t.description) p.set('desc', t.description);
    if (t.client_id) p.set('client', String(t.client_id));
    if (t.project_id) p.set('project', String(t.project_id));
    if (t.assigned_by_name) p.set('assignedby', t.assigned_by_name);
    // Map the assigned-task status to a DWR progress status.
    p.set('progress', t.status === 'Completed' ? 'Completed' : t.status === 'In Progress' ? 'In Progress' : 'Pending');
    nav(`/tasks?${p.toString()}`);
  };

  // Client-side search (title / project / client / assigner) + due filter. The
  // status pills only narrow the table — on the board the lanes *are* the
  // statuses, so filtering by one would empty the other two.
  const visibleTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (view === 'list' && statusFilter !== 'All' && t.status !== statusFilter) return false;
      if (!matchesDue(t, dueFilter)) return false;
      if (!q) return true;
      return [t.title, t.project_name, t.client_name, t.assigned_by_name]
        .some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [tasks, search, statusFilter, dueFilter, view]);

  // "Pending" = past its due date and still unfinished — the work that's late.
  const unfinished = tasks.filter((t) => t.status !== 'Completed');
  const overdueTasks = unfinished.filter((t) => isOverdue(t));
  const dueToday = unfinished.filter((t) => t.due_date === today());

  const statusCount = (s: 'All' | Status) =>
    s === 'All' ? tasks.length : tasks.filter((t) => t.status === s).length;

  // Board lanes. Unopened tasks sort first, then nearest due date.
  const byStatus = (s: Status) =>
    visibleTasks
      .filter((t) => t.status === s)
      .sort((a, b) => {
        const isNew = (t: AssignedTask) => (t.seen_at ? 1 : 0);
        if (isNew(a) !== isNew(b)) return isNew(a) - isNew(b);
        return (a.due_date || '9999').localeCompare(b.due_date || '9999');
      });

  const onDrop = (e: React.DragEvent, s: Status) => {
    e.preventDefault();
    // Prefer the id carried by the event — it survives even if a re-render
    // clobbered the state mid-drag.
    const id = Number(e.dataTransfer.getData('text/plain')) || dragId;
    if (id) void changeStatus(id, s);
    setDragId(null);
    setDropCol(null);
  };

  // A plain render function, NOT a nested component: declaring <Card> inside
  // MyTasks would give it a fresh type on every render, so the setDragId in
  // onDragStart would remount the card mid-drag and the browser would cancel it.
  const renderCard = (t: AssignedTask) => (
    <article
      key={t.id}
      ref={(el) => { cardRefs.current[t.id] = el; }}
      draggable
      onDragStart={(e) => {
        // Firefox only starts a drag if some data is set.
        e.dataTransfer.setData('text/plain', String(t.id));
        e.dataTransfer.effectAllowed = 'move';
        setDragId(t.id);
      }}
      // A card is itself a drop target for its own lane: when you drop onto a
      // lane that already has cards, the element under the cursor is a card, and
      // relying on the event bubbling to the lane is what was dropping the ball.
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dropCol !== t.status) setDropCol(t.status); }}
      onDrop={(e) => { e.stopPropagation(); onDrop(e, t.status); }}
      onDragEnd={() => { setDragId(null); setDropCol(null); }}
      onClick={() => openTask(t.id)}
      className={`group relative rounded-xl bg-white dark:bg-white/[0.03] p-3 cursor-pointer transition-shadow hover:shadow-md ${
        dragId === t.id ? 'opacity-40' : ''
      } ${
        t.id === highlightId
          ? 'ring-2 ring-brand-500'
          : !t.seen_at
            ? 'ring-1 ring-brand-500/40 bg-brand-500/[0.04]'
            : 'ring-1 ring-slate-200 dark:ring-white/10'
      }`}
    >
      <div className="flex items-start gap-1.5">
        <GripVertical size={14} className="mt-0.5 shrink-0 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {!t.seen_at && (
              <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-brand-600 text-white">NEW</span>
            )}
            <h4 className={`truncate text-sm text-slate-900 dark:text-white ${t.seen_at ? 'font-medium' : 'font-bold'}`} title={t.title}>
              {t.title}
            </h4>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
            {t.project_name || t.client_name || '—'} · by {t.assigned_by_name}
          </p>
        </div>
      </div>

      {/* pl-[1.375rem] = grip icon (14px) + its gap, so everything below the title
          lines up with the title rather than with the card's left edge.
          inline-flex + items-center on both chips: the icon and its label share a
          centre line instead of being nudged with a negative margin. */}
      <div className="mt-2.5 pl-[1.375rem] flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`inline-flex items-center gap-1 text-[10px] leading-none font-semibold px-1.5 py-1 rounded-md ${priorityColor[t.priority]}`}>
          <Flag size={9} />{t.priority}
        </span>
        <span className={`inline-flex items-center gap-1 text-[11px] leading-none ${overdue(t) ? 'text-rose-500 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>
          {t.due_date
            ? (<>{overdue(t) ? <AlertTriangle size={11} /> : <CalendarClock size={11} />}{t.due_date}</>)
            : 'No due date'}
        </span>
      </div>

      {/* Status is changed by dragging the card between lanes. The per-card
          picker is kept here, commented out, in case drag proves awkward on
          touch — HTML5 drag-and-drop doesn't fire there.
          <div className="min-w-0">
            <StatusSelect value={t.status} onChange={(v) => changeStatus(t.id, v as Status)} />
          </div> */}
      <div className="mt-2.5 pl-[1.375rem] flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => openTask(t.id, 'comments')}
          className="ml-auto shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-white/[0.06]" title="Comments & activity">
          <MessageSquare size={14} />
        </button>
        <button onClick={() => addToDwr(t)}
          className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-white/[0.06]" title="Add to my DWR (log time)">
          <ListPlus size={14} />
        </button>
      </div>
    </article>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">My Tasks</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Tasks assigned to you — drag a card between columns to change its status.
          </p>
        </div>
        {/* Board / list toggle */}
        <div className="shrink-0 flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.04]">
          {([['board', LayoutGrid, 'Board'], ['list', ListIcon, 'List']] as const).map(([v, Icon, label]) => (
            <button key={v} onClick={() => setView(v)} title={label}
              className={`px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 text-xs font-semibold transition-colors ${
                view === v
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-white/[0.10] dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar: search + due filter (+ status pills, list view only) */}
      <div className="card p-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, project, client…" className="!pl-10" />
        </div>
        <div className="sm:w-44 shrink-0">
          <Select value={dueFilter} options={DUE_OPTIONS} placeholder="Any due date"
            onChange={(v) => setDueFilter((v || 'all') as DueFilter)} />
        </div>
        {view === 'list' && (
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {(['All', ...STATUSES] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                  statusFilter === s
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:bg-white/[0.08]'
                }`}>
                {s} <span className="opacity-70">({statusCount(s)})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pending work at a glance. Each chip is a shortcut into the Due filter,
          so clicking "Overdue" narrows the board to just those cards. */}
      {!loading && tasks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {([
            ['overdue', 'Pending',   overdueTasks.length, 'text-rose-600 dark:text-rose-400'],
            ['today',   'Due today', dueToday.length, 'text-amber-600 dark:text-amber-400'],
          ] as const).map(([f, label, count, tone]) => (
            <button key={label} onClick={() => setDueFilter(dueFilter === f ? 'all' : f)}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg ring-1 transition-colors ${
                dueFilter === f
                  ? 'ring-brand-500 bg-brand-500/10'
                  : 'ring-slate-200 dark:ring-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
              } ${tone}`}>
              {label} <span className="tabular-nums opacity-80">{count}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full">
            <thead><tr>
              <th className="table-th">Task</th>
              <th className="table-th">Project / Client</th>
              <th className="table-th">Assigned by</th>
              <th className="table-th">Priority</th>
              <th className="table-th">Status</th>
              <th className="table-th">Due</th>
              <th className="table-th"></th>
            </tr></thead>
            <tbody><TableSkeleton rows={6} cols={7} /></tbody>
          </table>
        </div>
      ) : tasks.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <ClipboardCheck size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No tasks assigned to you. Enjoy the calm. 🌤️</p>
        </div>
      ) : view === 'board' && visibleTasks.length === 0 ? (
        // Without this the board renders three empty lanes and reads as broken.
        <div className="card p-12 text-center text-slate-400">
          <ClipboardCheck size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">
            {dueFilter === 'overdue'
              ? 'Nothing overdue — you’re all caught up. 🎉'
              : 'No tasks match your search or filter.'}
          </p>
          {(dueFilter !== 'all' || search) && (
            <button onClick={() => { setDueFilter('all'); setSearch(''); }}
              className="mt-3 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">
              Clear filters
            </button>
          )}
        </div>
      ) : view === 'board' ? (
        // items-stretch (the default), NOT items-start: every lane is as tall as
        // the tallest one, so a short column is still a drop target at the depth
        // you're dragging at. With items-start you'd be dropping onto page
        // background below a short lane and nothing would happen.
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STATUSES.map((s) => {
            const lane = byStatus(s);
            return (
              <section
                key={s}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dropCol !== s) setDropCol(s); }}
                onDragLeave={() => setDropCol((c) => (c === s ? null : c))}
                onDrop={(e) => onDrop(e, s)}
                className={`card p-3 flex flex-col transition-colors ${
                  dropCol === s && dragId != null ? 'ring-2 ring-brand-500 bg-brand-500/[0.04]' : ''
                }`}
              >
                <header className="flex items-center gap-2 px-1 pb-3">
                  <span className={`h-2 w-2 rounded-full ${COLUMN_STYLE[s].dot}`} />
                  <h3 className={`text-sm font-semibold ${COLUMN_STYLE[s].head}`}>{s}</h3>
                  <span className="ml-auto text-xs font-bold tabular-nums px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 dark:bg-white/[0.08] dark:text-slate-200">{lane.length}</span>
                </header>
                {/* flex-1 so the empty space below the last card still belongs to
                    the lane and accepts a drop. */}
                <div className="space-y-2.5 min-h-[8rem] flex-1">
                  {lane.length === 0 ? (
                    <p className="text-center text-xs text-slate-400 py-8">
                      {dragId != null ? `Drop here to mark ${s}` : 'Nothing here'}
                    </p>
                  ) : lane.map(renderCard)}
                </div>
              </section>
            );
          })}
        </div>
      ) : visibleTasks.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <ClipboardCheck size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No tasks match your search or filter.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full">
            <thead><tr>
              <th className="table-th">Task</th>
              <th className="table-th">Project / Client</th>
              <th className="table-th">Assigned by</th>
              <th className="table-th">Priority</th>
              <th className="table-th">Status</th>
              <th className="table-th">Due</th>
              <th className="table-th"></th>
            </tr></thead>
            <tbody>
              {visibleTasks.map((t) => (
                <tr key={t.id} onClick={() => openTask(t.id)}
                  ref={(el) => { cardRefs.current[t.id] = el; }}
                  className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.03] ${
                    t.id === highlightId ? 'bg-brand-50/60 dark:bg-brand-500/[0.08]' : ''
                  }`}>
                  <td className="table-td max-w-[320px]">
                    <div className="flex items-center gap-2">
                      {!t.seen_at && (
                        <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-brand-600 text-white">NEW</span>
                      )}
                      <div className={`truncate ${t.seen_at ? 'font-medium' : 'font-bold'} text-slate-900 dark:text-white`} title={t.title}>{t.title}</div>
                    </div>
                  </td>
                  <td className="table-td text-sm text-slate-500">
                    {t.project_name || t.client_name || '—'}
                  </td>
                  <td className="table-td text-sm text-slate-500">{t.assigned_by_name}</td>
                  <td className="table-td">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${priorityColor[t.priority]}`}>
                      <Flag size={10} className="inline -mt-0.5 mr-1" />{t.priority}
                    </span>
                  </td>
                  <td className="table-td" onClick={(e) => e.stopPropagation()}>
                    <StatusSelect value={t.status} onChange={(v) => changeStatus(t.id, v as Status)} />
                  </td>
                  <td className="table-td text-sm">
                    <span className={`inline-flex items-center gap-1 ${overdue(t) ? 'text-rose-500 font-semibold' : 'text-slate-500'}`}>
                      {t.due_date ? (<>{overdue(t) ? <AlertTriangle size={12} /> : <CalendarClock size={12} />}{t.due_date}</>) : '—'}
                    </span>
                  </td>
                  <td className="table-td text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => openTask(t.id, 'comments')}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-white/[0.06]" title="Comments & activity">
                        <MessageSquare size={15} />
                      </button>
                      <button onClick={() => addToDwr(t)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-white/[0.06]" title="Add to my DWR (log time)">
                        <ListPlus size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TaskDetailModal taskId={detailId} open={detailId !== null} onClose={closeDetail} onChanged={load} employees={employees}
        initialTask={tasks.find((t) => t.id === detailId) || null}
        commentsOnly={detailMode === 'comments'} />
    </div>
  );
}
