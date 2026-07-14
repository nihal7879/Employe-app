import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CalendarClock, Flag, MessageSquare, Send, User, FolderKanban, Building2, ListPlus,
  History, ChevronDown, Pencil, X, Save,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import type { AssignedTask, AssignedTaskStatus, Assignee, Client, Project } from '../types';
import Modal from './Modal';
import Select from './Select';
import MultiSelect from './ui/MultiSelect';
import DatePicker from './ui/DatePicker';
import MentionTextarea from './MentionTextarea';

export const STATUSES: AssignedTaskStatus[] = ['Open', 'In Progress', 'Completed'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

export const statusColor: Record<string, string> = {
  'Open': 'bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300',
  'In Progress': 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  'Completed': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
};
export const priorityColor: Record<string, string> = {
  Low: 'bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300',
  Medium: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  High: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  Urgent: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
};

const blankEdit = {
  title: '', description: '', assignee_id: '', client_id: '', project_id: '',
  priority: 'Medium', assigned_date: '', start_date: '', due_date: '',
};

export default function TaskDetailModal({
  taskId, open, onClose, onChanged,
  employees = [], clients = [], projects = [], canEdit = false, initialEdit = false, commentsOnly = false,
  canChangeStatus = false, initialTask = null,
}: {
  taskId: number | null;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  employees?: Assignee[];
  clients?: Client[];
  projects?: Project[];
  canEdit?: boolean;
  // When true, the modal opens straight into edit mode (used by the row Edit icon).
  initialEdit?: boolean;
  // When true, the detail view hides task fields and shows only comments + activity.
  commentsOnly?: boolean;
  // When true (employee/My Tasks view), a status changer + comments/activity are
  // shown, but the fields stay read-only (no Edit button).
  canChangeStatus?: boolean;
  // The already-loaded task row from the list. When provided, the modal renders
  // instantly from it while the full record (comments/activity) fetches in the
  // background — avoids a blank "Loading…" gap on slow (production) networks.
  initialTask?: AssignedTask | null;
}) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [task, setTask] = useState<AssignedTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [mentions, setMentions] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [showActivity, setShowActivity] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...blankEdit });
  const [editAssignees, setEditAssignees] = useState<string[]>([]);

  const load = async (autoEdit = false) => {
    if (!taskId) return;
    setLoading(true);
    try {
      const r = await api.get(`/assigned-tasks/${taskId}`);
      setTask(r.data);
      // Jump straight into edit mode when the modal was opened via the Edit icon.
      // Only when we didn't already seed the form from initialTask, so an
      // in-progress edit isn't clobbered by the background refresh.
      if (autoEdit && canEdit) beginEdit(r.data);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to load task');
      onClose();
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (open && taskId) {
      setComment(''); setMentions([]); setEditing(false);
      if (initialTask && initialTask.id === taskId) {
        // Render instantly from the list row; fetch fills in comments/activity.
        setTask(initialTask);
        if (initialEdit && canEdit) beginEdit(initialTask);
        load(false);
      } else {
        setTask(null);
        load(initialEdit);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taskId]);

  const beginEdit = (t: AssignedTask) => {
    setForm({
      title: t.title,
      description: t.description || '',
      assignee_id: String(t.assignee_id),
      client_id: t.client_id ? String(t.client_id) : '',
      project_id: t.project_id ? String(t.project_id) : '',
      priority: t.priority,
      assigned_date: t.assigned_date,
      start_date: t.start_date || '',
      due_date: t.due_date || '',
    });
    setEditAssignees([String(t.assignee_id)]);
    setEditing(true);
  };
  const startEdit = () => { if (task) beginEdit(task); };

  const saveEdit = async () => {
    if (!task) return;
    if (!form.title.trim()) return toast.error('Title is required');
    const selected = editAssignees.map(Number);
    if (!selected.length) return toast.error('Select at least one assignee');
    setBusy(true);
    try {
      const fields = {
        title: form.title.trim(),
        description: form.description || undefined,
        client_id: form.client_id ? Number(form.client_id) : undefined,
        project_id: form.project_id ? Number(form.project_id) : undefined,
        priority: form.priority,
        assigned_date: form.assigned_date || undefined,
        start_date: form.assigned_date || undefined,
        due_date: form.due_date || undefined,
      };
      // This task keeps its original assignee if still selected, else it's
      // reassigned to the first selected person.
      const primary = selected.includes(task.assignee_id) ? task.assignee_id : selected[0];
      await api.put(`/assigned-tasks/${task.id}`, { ...fields, assignee_id: primary });
      // Every other selected person gets their own new copy of the task.
      const extra = selected.filter((id) => id !== primary);
      if (extra.length) await api.post('/assigned-tasks', { ...fields, assignee_ids: extra });

      setEditing(false);
      onChanged?.();
      await load();
      toast.success(extra.length ? `Updated · assigned to ${extra.length} more` : 'Task updated');
    } catch (e: any) {
      const msg = e.response?.data?.message;
      toast.error((Array.isArray(msg) ? msg[0] : msg) || 'Failed to update');
    } finally { setBusy(false); }
  };


  // Employees can advance the status of a task assigned to them (but not edit
  // its fields — that's the admin's job). Used by the My Tasks board.
  const changeStatus = async (status: string) => {
    if (!task || status === task.status) return;
    setBusy(true);
    try {
      const r = await api.patch(`/assigned-tasks/${task.id}/status`, { status });
      setTask(r.data);
      onChanged?.();
      toast.success(`Marked ${status}`);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to update');
    } finally { setBusy(false); }
  };

  const addComment = async () => {
    if (!task || !comment.trim()) return;
    setBusy(true);
    try {
      const r = await api.post(`/assigned-tasks/${task.id}/comments`, {
        body: comment.trim(),
        mentions,
      });
      setTask(r.data);
      setComment('');
      setMentions([]);
      onChanged?.();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to comment');
    } finally { setBusy(false); }
  };

  const addToDwr = () => {
    if (!task) return;
    const p = new URLSearchParams();
    p.set('title', task.title);
    if (task.description) p.set('desc', task.description);
    if (task.client_id) p.set('client', String(task.client_id));
    if (task.project_id) p.set('project', String(task.project_id));
    if (task.assigned_by_name) p.set('assignedby', task.assigned_by_name);
    p.set('progress', task.status === 'Completed' ? 'Completed' : task.status === 'In Progress' ? 'In Progress' : 'Pending');
    nav(`/tasks?${p.toString()}`);
  };

  const empOptions = employees.map((e) => ({ label: `${e.name} (${e.employee_code})`, value: String(e.id) }));
  const clientOptions = clients.map((c) => ({ label: c.client_name, value: String(c.id) }));
  const formProjects = useMemo(
    () => projects.filter((p) => !form.client_id || String(p.client_id) === form.client_id),
    [projects, form.client_id],
  );
  const projectOptions = formProjects.map((p) => ({
    label: p.client_name ? `${p.project_name} · ${p.client_name}` : p.project_name, value: String(p.id),
  }));
  // Admins manage tasks, they don't log time — hide the "Add to my DWR" action.
  const isAssignee = task?.assignee_id === user?.id && user?.role !== 'Admin';
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Mentions are limited to the people actually on this task — its assignee and
  // whoever assigned it. Falls back to names from the task row if the employee
  // directory isn't loaded for this user.
  const mentionPeople = useMemo(() => {
    if (!task) return [];
    // The other party on the task — you can't @-mention yourself.
    const ids = [task.assignee_id, task.assigned_by_id].filter((id) => id !== user?.id);
    const byId = new Map(employees.map((e) => [e.id, e]));
    return [...new Set(ids)].map((id) => {
      const e = byId.get(id);
      if (e) return e;
      const name = id === task.assignee_id ? task.assignee_name : task.assigned_by_name;
      return { id, name: name || `#${id}`, employee_code: '' } as Assignee;
    });
  }, [task, employees, user?.id]);

  return (
    <Modal open={open} title={editing ? 'Edit task' : commentsOnly ? 'Comments & activity' : 'Task details'} onClose={onClose} size="lg">
      {!task ? (
        <div className="py-10 text-center text-slate-400 text-sm">Loading…</div>
      ) : editing ? (
        /* ---------- Edit form ---------- */
        <div className="space-y-4">
          <div>
            <label className="label">Title *</label>
            <input value={form.title} onChange={(e) => set('title', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30" />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30" />
          </div>
          <div>
            <label className="label">Assignees</label>
            <MultiSelect value={editAssignees} options={empOptions} onChange={setEditAssignees} placeholder="Select employees…" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Priority</label>
              <Select value={form.priority} options={PRIORITIES.map((p) => ({ label: p, value: p }))} onChange={(v) => set('priority', v)} />
            </div>
            <div>
              <label className="label">Client</label>
              <Select value={form.client_id} options={clientOptions} onChange={(v) => setForm((f) => ({ ...f, client_id: v, project_id: '' }))} placeholder="Select client" searchable clearable />
            </div>
            <div>
              <label className="label">Project</label>
              <Select value={form.project_id} options={projectOptions} onChange={(v) => {
                // Selecting a project auto-fills its client so the two stay in sync.
                const proj = projects.find((p) => String(p.id) === v);
                setForm((f) => ({ ...f, project_id: v, client_id: proj ? String(proj.client_id) : f.client_id }));
              }} placeholder="Select project" searchable clearable />
            </div>
            <div>
              <label className="label">Assigned date</label>
              <DatePicker value={form.assigned_date} onChange={(v) => set('assigned_date', v)} />
            </div>
            <div>
              <label className="label">Due date</label>
              <DatePicker value={form.due_date} onChange={(v) => set('due_date', v)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-secondary" onClick={() => setEditing(false)}><X size={16} /> Cancel</button>
            <button className="btn-primary" onClick={saveEdit} disabled={busy}><Save size={16} /> {busy ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
      ) : (
        /* ---------- Detail view ---------- */
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${statusColor[task.status]}`}>{task.status}</span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${priorityColor[task.priority]}`}>
                <Flag size={11} className="inline -mt-0.5 mr-1" />{task.priority}
              </span>
            </div>
            {canEdit && !commentsOnly && (
              <button onClick={startEdit} className="btn-secondary !py-1.5 !px-3 text-xs shrink-0"><Pencil size={13} /> Edit</button>
            )}
          </div>

          <div>
            <label className="label">Title</label>
            <p className="text-sm font-semibold text-slate-900 dark:text-white break-words [overflow-wrap:anywhere]">
              {task.title}
            </p>
          </div>

          {!commentsOnly && (<>
          <div>
            <label className="label">Description</label>
            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {task.description || <span className="text-slate-400">No description.</span>}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <Meta icon={<User size={14} />} label="Assignee" value={task.assignee_name} />
            <Meta icon={<User size={14} />} label="Assigned by" value={task.assigned_by_name} />
            <Meta icon={<Building2 size={14} />} label="Client" value={task.client_name || '—'} />
            <Meta icon={<FolderKanban size={14} />} label="Project" value={task.project_name || '—'} />
            <Meta icon={<CalendarClock size={14} />} label="Assigned" value={task.assigned_date} />
            <Meta icon={<CalendarClock size={14} />} label="Start" value={task.start_date || '—'} />
            <Meta icon={<CalendarClock size={14} />} label="Due" value={task.due_date || '—'} />
          </div>
          </>)}

          {!commentsOnly && isAssignee && (
            <button onClick={addToDwr} className="btn-secondary w-full justify-center">
              <ListPlus size={16} /> Add to my DWR (log time)
            </button>
          )}

          {/* Status changer — employees can advance status without editing fields */}
          {canChangeStatus && !commentsOnly && (
            <div>
              <label className="label">Update status</label>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button key={s} disabled={busy || s === task.status} onClick={() => changeStatus(s)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-100 ${
                      s === task.status ? statusColor[s] + ' ring-2 ring-brand-500/40' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:bg-white/[0.08]'
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(commentsOnly || canChangeStatus) && (<>
          {/* Comments */}
          <div>
            <div className="label flex items-center gap-1.5"><MessageSquare size={14} /> Comments</div>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {(task.comments || []).length === 0 && <p className="text-xs text-slate-400">No comments yet.</p>}
              {(task.comments || []).map((c) => (
                <div key={c.id} className="rounded-lg bg-slate-50 dark:bg-white/[0.03] px-3 py-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{c.author_name}</span>
                    <span className="text-[10px] text-slate-400">{new Date(c.created_at.replace(' ', 'T')).toLocaleString()}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{renderWithMentions(c.body, c.mention_names)}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              <MentionTextarea
                value={comment}
                onChange={setComment}
                employees={mentionPeople}
                onMentionsChange={setMentions}
                placeholder="Write a comment… type @ to mention someone"
              />
              <div className="flex justify-end">
                <button onClick={addComment} disabled={busy || !comment.trim()} className="btn-primary shrink-0"><Send size={15} /> Send</button>
              </div>
            </div>
          </div>

          {/* Activity timeline */}
          <div>
            <button onClick={() => setShowActivity((s) => !s)} className="label flex items-center gap-1.5 hover:text-brand-600 transition-colors">
              <History size={14} /> Activity
              <span className="text-xs text-slate-400">({(task.activity || []).length})</span>
              <ChevronDown size={13} className={`transition-transform ${showActivity ? 'rotate-180' : ''}`} />
            </button>
            {showActivity && (
              <ol className="mt-2 space-y-3 border-l border-slate-200 dark:border-white/10 pl-4">
                {(task.activity || []).length === 0 && <li className="text-xs text-slate-400">No activity yet.</li>}
                {(task.activity || []).map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-white dark:ring-bg-deep" />
                    <div className="text-sm text-slate-700 dark:text-slate-200 break-words [overflow-wrap:anywhere]">
                      <span className="font-semibold">{a.actor_name}</span> {activityVerb(a)}
                    </div>
                    <div className="text-[11px] text-slate-400">{new Date(a.created_at.replace(' ', 'T')).toLocaleString()}</div>
                  </li>
                ))}
              </ol>
            )}
          </div>
          </>)}
        </div>
      )}
    </Modal>
  );
}

// Highlight "@Name" tokens (for the names actually mentioned) inside a comment.
function renderWithMentions(body: string, names?: string[]) {
  if (!names || !names.length) return body;
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`@(?:${escaped.join('|')})`, 'g');
  const parts: (string | JSX.Element)[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    parts.push(<span key={key++} className="text-brand-600 dark:text-brand-400 font-semibold">{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts;
}

function activityVerb(a: { type: string; from_value?: string | null; to_value?: string | null; note?: string | null }) {
  switch (a.type) {
    case 'Created': return 'created this task';
    case 'StatusChanged': return `changed status from "${a.from_value}" to "${a.to_value}"`;
    case 'Reassigned': return `reassigned from ${a.from_value || '—'} to ${a.to_value || '—'}`;
    case 'Commented': return 'added a comment';
    case 'Updated': return `changed ${a.note} from "${a.from_value}" to "${a.to_value}"`;
    default: return a.note || a.type;
  }
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-400">{icon}{label}</div>
      <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{value || '—'}</div>
    </div>
  );
}
