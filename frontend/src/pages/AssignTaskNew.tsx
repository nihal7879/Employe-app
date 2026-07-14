import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import type { Assignee, Client, Project } from '../types';
import Select from '../components/Select';
import MultiSelect from '../components/ui/MultiSelect';
import DatePicker from '../components/ui/DatePicker';

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

function today() { return new Date().toISOString().slice(0, 10); }

const emptyForm = {
  title: '', description: '', client_id: '', project_id: '',
  priority: 'Medium', assigned_date: today(), due_date: '',
};

export default function AssignTaskNew() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Assignee[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  useEffect(() => { (async () => {
    try {
      // Scoped to who this user may actually assign to — a manager only sees
      // their own team, so the picker can't offer someone the API would reject.
      const [e, c, p] = await Promise.all([
        api.get('/assigned-tasks/assignees'),
        api.get('/clients'),
        api.get('/projects'),
      ]);
      setEmployees(e.data); setClients(c.data); setProjects(p.data);
    } catch (e: any) { toast.error(e.response?.data?.message || 'Failed to load'); }
  })(); }, []);

  const empOptions = employees.map((e) => ({ label: `${e.name} (${e.employee_code})`, value: String(e.id) }));
  const clientOptions = clients.map((c) => ({ label: c.client_name, value: String(c.id) }));
  const formProjects = useMemo(
    () => projects.filter((p) => !form.client_id || String(p.client_id) === form.client_id),
    [projects, form.client_id],
  );

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim()) return toast.error('Title is required');
    if (!assigneeIds.length) return toast.error('Select at least one assignee');
    setSaving(true);
    try {
      await api.post('/assigned-tasks', {
        title: form.title.trim(),
        description: form.description || undefined,
        assignee_ids: assigneeIds.map(Number),
        client_id: form.client_id ? Number(form.client_id) : undefined,
        project_id: form.project_id ? Number(form.project_id) : undefined,
        priority: form.priority,
        assigned_date: form.assigned_date || undefined,
        start_date: form.assigned_date || undefined,
        due_date: form.due_date || undefined,
      });
      toast.success(assigneeIds.length > 1 ? `Assigned to ${assigneeIds.length} people` : 'Task assigned');
      navigate('/assign-tasks');
    } catch (e: any) {
      const msg = e.response?.data?.message;
      toast.error((Array.isArray(msg) ? msg[0] : msg) || 'Failed to assign');
    } finally { setSaving(false); }
  };

  const inputCls = 'w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/assign-tasks')}
          className="p-2 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-white/[0.06]" title="Back">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Assign a task</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">One task is created per assignee, so each person tracks their own copy.</p>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        {/* Wide screens split the long-form fields from the metadata sidebar. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <div>
              <label className="label">Title *</label>
              <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="What needs to be done?" className={inputCls} />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={10}
                placeholder="Details, acceptance criteria, links…" className={inputCls} />
            </div>
            <div>
              <label className="label">Assignees *</label>
              <MultiSelect value={assigneeIds} options={empOptions} onChange={setAssigneeIds} placeholder="Select one or more employees…" />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">Client</label>
              <Select value={form.client_id} options={clientOptions} onChange={(v) => setForm((f) => ({ ...f, client_id: v, project_id: '' }))} placeholder="Select client" searchable clearable />
            </div>
            <div>
              <label className="label">Project</label>
              <Select value={form.project_id} options={formProjects.map((p) => ({ label: p.client_name ? `${p.project_name} · ${p.client_name}` : p.project_name, value: String(p.id) }))} onChange={(v) => {
                // Selecting a project auto-fills its client so the two stay in sync.
                const proj = projects.find((p) => String(p.id) === v);
                setForm((f) => ({ ...f, project_id: v, client_id: proj ? String(proj.client_id) : f.client_id }));
              }} placeholder="Select project" searchable clearable />
            </div>
            <div>
              <label className="label">Priority</label>
              <Select value={form.priority} options={PRIORITIES.map((p) => ({ label: p, value: p }))} onChange={(v) => set('priority', v)} />
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
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
          <button className="btn-secondary mt-3" onClick={() => navigate('/assign-tasks')} disabled={saving}>Cancel</button>
          <button className="btn-primary mt-3" onClick={submit} disabled={saving}>{saving ? 'Assigning…' : 'Assign task'}</button>
        </div>
      </div>
    </div>
  );
}
