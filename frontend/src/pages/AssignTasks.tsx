import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Plus, Search, Trash2, ClipboardList, Pencil, MessageSquare,
  LayoutGrid, List as ListIcon, GripVertical, Flag, CalendarClock, AlertTriangle, User,
} from 'lucide-react';
import { api } from '../lib/api';
import type { AssignedTask, Assignee, Client, Project } from '../types';
import Modal from '../components/Modal';
import MultiSelect from '../components/ui/MultiSelect';
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

// Same lane accents as My Tasks, so a status reads the same on both boards.
const COLUMN_STYLE: Record<Status, { dot: string; head: string }> = {
  'Open':        { dot: 'bg-slate-400',   head: 'text-slate-600 dark:text-slate-300' },
  'In Progress': { dot: 'bg-amber-500',   head: 'text-amber-600 dark:text-amber-400' },
  'Completed':   { dot: 'bg-emerald-500', head: 'text-emerald-600 dark:text-emerald-400' },
};

export default function AssignTasks() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [tasks, setTasks] = useState<AssignedTask[]>([]);
  const [employees, setEmployees] = useState<Assignee[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters (all multi-select)
  const [search, setSearch] = useState('');
  const [fAssignee, setFAssignee] = useState<string[]>([]);
  const [fClient, setFClient] = useState<string[]>([]);
  const [fProject, setFProject] = useState<string[]>([]);
  const [fStatus, setFStatus] = useState<string[]>([]);
  // Due filter is applied client-side — the API's from/to params filter on
  // assigned_date, not due_date.
  // ?due=overdue — the dashboard's red "Pending Tasks" tile links here expecting
  // the page to open already narrowed to overdue work.
  const [fDue, setFDue] = useState<DueFilter>(
    () => (DUE_OPTIONS.some((o) => o.value === params.get('due')) ? (params.get('due') as DueFilter) : 'all'),
  );

  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailMode, setDetailMode] = useState<'view' | 'edit' | 'comments'>('view');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [view, setView] = useState<View>(() => (localStorage.getItem('assigntasks_view') as View) || 'list');
  useEffect(() => { localStorage.setItem('assigntasks_view', view); }, [view]);

  // Drag state: which card is moving, and which lane it's hovering.
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropCol, setDropCol] = useState<Status | null>(null);

  const loadTasks = async () => {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (fAssignee.length) params.assignee_id = fAssignee.join(',');
    if (fClient.length) params.client_id = fClient.join(',');
    if (fProject.length) params.project_id = fProject.join(',');
    // On the board the lanes *are* the statuses — filtering by one would empty
    // the other two, so the status filter is list-only.
    if (fStatus.length && view === 'list') params.status = fStatus.join(',');
    const r = await api.get('/assigned-tasks', { params });
    setTasks(r.data || []);
  };

  const loadMeta = async () => {
    // Scoped to who this user may assign to — feeds both the assignee filter
    // and the reassign dropdown in the detail modal.
    const [e, c, p] = await Promise.all([
      api.get('/assigned-tasks/assignees'),
      api.get('/clients'),
      api.get('/projects'),
    ]);
    setEmployees(e.data); setClients(c.data); setProjects(p.data);
  };

  useEffect(() => { (async () => {
    setLoading(true);
    try { await Promise.all([loadTasks(), loadMeta()]); }
    catch (e: any) { toast.error(e.response?.data?.message || 'Failed to load'); }
    finally { setLoading(false); }
  })(); }, []);

  useEffect(() => {
    const t = setTimeout(() => { loadTasks().catch(() => {}); }, 250);
    return () => clearTimeout(t);
  }, [search, fAssignee, fClient, fProject, fStatus, view]);

  const empOptions = employees.map((e) => ({ label: `${e.name} (${e.employee_code})`, value: String(e.id) }));
  const clientOptions = clients.map((c) => ({ label: c.client_name, value: String(c.id) }));
  // Project filter options are scoped to the selected client(s) — pick a client
  // and the project list narrows to just that client's projects.
  const filterProjectOptions = useMemo(() => {
    const sel = new Set(fClient.map(Number));
    return projects
      .filter((p) => !sel.size || sel.has(Number(p.client_id)))
      .map((p) => ({
        label: p.client_name ? `${p.project_name} · ${p.client_name}` : p.project_name, value: String(p.id),
      }));
  }, [projects, fClient]);
  // Everything else is filtered server-side; only the due filter is local.
  const visibleTasks = useMemo(() => tasks.filter((t) => matchesDue(t, fDue)), [tasks, fDue]);

  const confirmDelete = async () => {
    if (deleteId == null) return;
    setDeleting(true);
    try {
      await api.delete(`/assigned-tasks/${deleteId}`);
      toast.success('Deleted');
      setDeleteId(null);
      loadTasks();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    } finally { setDeleting(false); }
  };

  const changeStatus = async (id: number, status: string) => {
    const prev = tasks.find((t) => t.id === id)?.status;
    if (prev === status) return;
    // Move the card to its new lane immediately; roll back if the server says no.
    setTasks((xs) => xs.map((t) => (t.id === id ? { ...t, status: status as AssignedTask['status'] } : t)));
    try {
      await api.patch(`/assigned-tasks/${id}/status`, { status });
      toast.success(`Marked ${status}`);
    } catch (e: any) {
      if (prev) setTasks((xs) => xs.map((t) => (t.id === id ? { ...t, status: prev } : t)));
      toast.error(e.response?.data?.message || 'Failed to update');
    }
  };

  const hasFilters = !!(search || fAssignee.length || fClient.length || fProject.length || (fStatus.length && view === 'list'));

  const overdue = (t: AssignedTask) => isOverdue(t) && t.status !== 'Completed';

  // "Pending" = past its due date and still unfinished — the work that's late.
  // Counted off the search/assignee/client-filtered set, but NOT the due filter,
  // so the chips keep their counts while one of them is active.
  const unfinished = tasks.filter((t) => t.status !== 'Completed');
  const overdueCount = unfinished.filter((t) => isOverdue(t)).length;
  const dueTodayCount = unfinished.filter((t) => t.due_date === today()).length;

  // Board lanes — nearest due date first.
  const byStatus = (s: Status) =>
    visibleTasks
      .filter((t) => t.status === s)
      .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));

  const onDrop = (e: React.DragEvent, s: Status) => {
    e.preventDefault();
    // Prefer the id carried by the event — it survives a re-render mid-drag.
    const id = Number(e.dataTransfer.getData('text/plain')) || dragId;
    if (id) void changeStatus(id, s);
    setDragId(null);
    setDropCol(null);
  };

  // A plain render function, NOT a nested component: a component declared inside
  // AssignTasks gets a fresh type each render, remounting the card mid-drag.
  const renderCard = (t: AssignedTask) => (
    <article
      key={t.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(t.id)); // Firefox needs data set
        e.dataTransfer.effectAllowed = 'move';
        setDragId(t.id);
      }}
      // A card is itself a drop target for its own lane: dropping onto a lane that
      // already has cards puts a card under the cursor, not the lane.
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dropCol !== t.status) setDropCol(t.status as Status); }}
      onDrop={(e) => { e.stopPropagation(); onDrop(e, t.status as Status); }}
      onDragEnd={() => { setDragId(null); setDropCol(null); }}
      onClick={() => { setDetailMode('view'); setDetailId(t.id); }}
      className={`group relative rounded-xl bg-white dark:bg-white/[0.03] p-3 cursor-pointer ring-1 ring-slate-200 dark:ring-white/10 transition-shadow hover:shadow-md ${
        dragId === t.id ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-start gap-1.5">
        <GripVertical size={14} className="mt-0.5 shrink-0 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing" />
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-medium text-slate-900 dark:text-white" title={t.title}>{t.title}</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
            {t.project_name || t.client_name || '—'} · by {t.assigned_by_name}
          </p>
        </div>
      </div>

      {/* pl-[1.375rem] = grip icon + gap, so everything lines up under the title. */}
      <div className="mt-2.5 pl-[1.375rem] flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1 text-[11px] leading-none font-medium text-slate-600 dark:text-slate-300 px-1.5 py-1 rounded-md bg-slate-100 dark:bg-white/[0.06]">
          <User size={9} />{t.assignee_name}
        </span>
        <span className={`inline-flex items-center gap-1 text-[10px] leading-none font-semibold px-1.5 py-1 rounded-md ${priorityColor[t.priority]}`}>
          <Flag size={9} />{t.priority}
        </span>
        <span className={`inline-flex items-center gap-1 text-[11px] leading-none ${overdue(t) ? 'text-rose-500 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>
          {t.due_date
            ? (<>{overdue(t) ? <AlertTriangle size={11} /> : <CalendarClock size={11} />}{t.due_date}</>)
            : 'No due date'}
        </span>
      </div>

      <div className="mt-2.5 pl-[1.375rem] flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => { setDetailMode('edit'); setDetailId(t.id); }}
          className="ml-auto shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-white/[0.06]" title="Edit">
          <Pencil size={14} />
        </button>
        <button onClick={() => { setDetailMode('comments'); setDetailId(t.id); }}
          className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-white/[0.06]" title="Comments & activity">
          <MessageSquare size={14} />
        </button>
        <button onClick={() => setDeleteId(t.id)}
          className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]" title="Delete">
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Assign Tasks</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Assign work to your team and track it through to done.</p>
        </div>
        <div className="flex items-center gap-2">
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
          <button className="btn-primary" onClick={() => navigate('/assign-tasks/new')}>
            <Plus size={16} /> Assign task
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-3 space-y-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, description, employee, client, project…"
            className="!pl-10" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <MultiSelect value={fAssignee} options={empOptions} onChange={setFAssignee} placeholder="All employees" />
          <MultiSelect value={fClient} options={clientOptions} onChange={(v) => {
            // Dropping a client also drops any selected projects that no longer
            // belong to the narrowed client set.
            setFClient(v);
            if (v.length) {
              const sel = new Set(v.map(Number));
              setFProject((prev) => prev.filter((pid) => {
                const proj = projects.find((p) => String(p.id) === pid);
                return proj && sel.has(Number(proj.client_id));
              }));
            }
          }} placeholder="All clients" />
          <MultiSelect value={fProject} options={filterProjectOptions} onChange={(v) => {
            // Selecting projects auto-includes their client(s) in the client filter.
            setFProject(v);
            const clientIds = v
              .map((pid) => projects.find((p) => String(p.id) === pid)?.client_id)
              .filter((id): id is number => id != null)
              .map(String);
            if (clientIds.length) setFClient((prev) => [...new Set([...prev, ...clientIds])]);
          }} placeholder="All projects" />
          {/* Status filter is list-only — on the board the lanes are the statuses. */}
          {view === 'list' && (
            <MultiSelect value={fStatus} options={STATUSES.map((s) => ({ label: s, value: s }))} onChange={setFStatus} placeholder="All status" />
          )}
          <Select value={fDue} options={DUE_OPTIONS} placeholder="Any due date"
            onChange={(v) => setFDue((v || 'all') as DueFilter)} />
        </div>
      </div>

      {/* Pending work at a glance. Each chip is a shortcut into the Due filter,
          so clicking "Pending" narrows the page to just the late tasks. */}
      {!loading && tasks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {([
            ['overdue', 'Pending',   overdueCount,  'text-rose-600 dark:text-rose-400'],
            ['today',   'Due today', dueTodayCount, 'text-amber-600 dark:text-amber-400'],
          ] as const).map(([f, label, count, tone]) => (
            <button key={label} onClick={() => setFDue(fDue === f ? 'all' : f)}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg ring-1 transition-colors ${
                fDue === f
                  ? 'ring-brand-500 bg-brand-500/10'
                  : 'ring-slate-200 dark:ring-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
              } ${tone}`}>
              {label} <span className="tabular-nums opacity-80">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Board */}
      {view === 'board' && (
        loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STATUSES.map((s) => (
              <div key={s} className="card p-3 h-64 animate-pulse bg-slate-50 dark:bg-white/[0.02]" />
            ))}
          </div>
        ) : visibleTasks.length === 0 ? (
          // Without this the board renders three empty lanes and reads as broken.
          <div className="card p-12 text-center text-slate-400">
            <ClipboardList size={28} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No assigned tasks{hasFilters || fDue !== 'all' ? ' match your filters' : ' yet'}.</p>
          </div>
        ) : (
          // items-stretch (the default), NOT items-start: every lane is as tall as
          // the tallest, so a short column still accepts a drop at the depth you're
          // dragging at.
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
        )
      )}

      {/* Table */}
      {view === 'list' && (
      <div className="card p-0 overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            <th className="table-th">Task</th>
            <th className="table-th">Assignee</th>
            <th className="table-th">Project / Client</th>
            <th className="table-th">Priority</th>
            <th className="table-th">Status</th>
            <th className="table-th">Due</th>
            <th className="table-th"></th>
          </tr></thead>
          <tbody>
            {loading && <TableSkeleton rows={6} cols={7} />}
            {!loading && visibleTasks.map((t) => (
              <tr key={t.id} onClick={() => { setDetailMode('view'); setDetailId(t.id); }} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                <td className="table-td max-w-[340px]">
                  <div className="font-medium text-slate-900 dark:text-white truncate" title={t.title}>{t.title}</div>
                  <div className="text-xs text-slate-400 truncate">by {t.assigned_by_name}</div>
                </td>
                <td className="table-td text-sm">{t.assignee_name}</td>
                <td className="table-td text-sm text-slate-500">
                  {t.project_name || '—'}{t.client_name ? <div className="text-xs text-slate-400">{t.client_name}</div> : null}
                </td>
                <td className="table-td"><span className={`text-xs font-semibold px-2 py-1 rounded-lg ${priorityColor[t.priority]}`}>{t.priority}</span></td>
                <td className="table-td" onClick={(e) => e.stopPropagation()}>
                  <StatusSelect value={t.status} onChange={(v) => changeStatus(t.id, v)} />
                </td>
                <td className="table-td text-sm text-slate-500">{t.due_date || '—'}</td>
                <td className="table-td text-right w-px whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1.5">
                    <button onClick={(e) => { e.stopPropagation(); setDetailMode('edit'); setDetailId(t.id); }} className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-white/[0.06]" title="Edit"><Pencil size={15} /></button>
                    <button onClick={(e) => { e.stopPropagation(); setDetailMode('comments'); setDetailId(t.id); }} className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-white/[0.06]" title="Comments & activity"><MessageSquare size={15} /></button>
                    <button onClick={(e) => { e.stopPropagation(); setDeleteId(t.id); }} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]" title="Delete"><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && visibleTasks.length === 0 && (
              <tr><td colSpan={7} className="table-td text-center text-slate-400 py-12">
                <ClipboardList size={28} className="mx-auto mb-2 opacity-50" />
                No assigned tasks{hasFilters ? ' match your filters' : ' yet'}.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      <TaskDetailModal taskId={detailId} open={detailId !== null} onClose={() => setDetailId(null)} onChanged={loadTasks}
        employees={employees} clients={clients} projects={projects} canEdit
        initialTask={tasks.find((t) => t.id === detailId) || null}
        initialEdit={detailMode === 'edit'} commentsOnly={detailMode === 'comments'} />

      {/* Delete confirmation */}
      <Modal open={deleteId !== null} title="Delete task" onClose={() => setDeleteId(null)} size="sm">
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-rose-100 dark:bg-rose-500/15 flex items-center justify-center">
              <Trash2 size={18} className="text-rose-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">Delete this assigned task?</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">This can't be undone. The assignee will no longer see it.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setDeleteId(null)} disabled={deleting}>Cancel</button>
            <button className="btn-danger" onClick={confirmDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
