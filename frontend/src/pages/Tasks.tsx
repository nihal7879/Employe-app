import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Plus, Trash2, Clock, Briefcase, ListChecks, Search } from 'lucide-react';
import { api } from '../lib/api';
import type { Activity, Client, DailyTask, Project } from '../types';
import Select from '../components/Select';
import DatePicker from '../components/ui/DatePicker';
import TimePicker from '../components/ui/TimePicker';
import ConfirmDialog from '../components/ConfirmDialog';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Tasks() {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [filterDate, setFilterDate] = useState(todayStr());
  const [search, setSearch] = useState('');
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const [form, setForm] = useState({
    client_id: '', project_id: '', activity_id: '',
    hours_spent: '', task_title: '', description: '',
    assigned_by: '', reference: '',
    task_date: todayStr(), start_time: '', end_time: '',
  });

  const filteredProjects = useMemo(
    () => (form.client_id ? projects.filter((p) => p.client_id === Number(form.client_id)) : projects),
    [projects, form.client_id],
  );

  const clientOptions = clients.map((c) => ({ label: c.client_name, value: String(c.id) }));
  const projectOptions = filteredProjects.map((p) => ({ label: p.project_name, value: String(p.id) }));
  const activityOptions = activities.map((a) => ({ label: a.activity_name, value: String(a.id) }));

  const load = async () => {
    const [c, p, a, t] = await Promise.all([
      api.get('/clients'),
      api.get('/projects'),
      api.get('/activities'),
      api.get('/daily-tasks', { params: { from: filterDate, to: filterDate } }),
    ]);
    setClients(c.data); setProjects(p.data); setActivities(a.data); setTasks(t.data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterDate]);

  // Auto-calculate hours from start/end time
  useEffect(() => {
    if (form.start_time && form.end_time) {
      const [sh, sm] = form.start_time.split(':').map(Number);
      const [eh, em] = form.end_time.split(':').map(Number);
      let mins = (eh * 60 + em) - (sh * 60 + sm);
      if (mins < 0) mins += 24 * 60; // overnight
      const hrs = (mins / 60).toFixed(2);
      setForm((f) => ({ ...f, hours_spent: hrs }));
    }
    // eslint-disable-next-line
  }, [form.start_time, form.end_time]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client_id || !form.project_id || !form.activity_id) {
      toast.error('Select client, project and activity'); return;
    }
    if (!form.start_time || !form.end_time) {
      toast.error('Enter start and end time'); return;
    }
    if (!form.task_title.trim()) {
      toast.error('Enter a task title'); return;
    }
    try {
      await api.post('/daily-tasks', {
        client_id: Number(form.client_id),
        project_id: Number(form.project_id),
        activity_id: Number(form.activity_id),
        hours_spent: Number(form.hours_spent),
        task_title: form.task_title,
        description: form.description,
        assigned_by: form.assigned_by || undefined,
        reference: form.reference || undefined,
        task_date: todayStr(),
        start_time: form.start_time || undefined,
        end_time: form.end_time || undefined,
      });
      toast.success('Task logged');
      setForm({ ...form, task_title: '', description: '', hours_spent: '', start_time: '', end_time: '', assigned_by: '', reference: '' });
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message?.[0] || e.response?.data?.message || 'Failed');
    }
  };

  const remove = async () => {
    if (confirmId == null) return;
    try {
      await api.delete(`/daily-tasks/${confirmId}`);
      toast.success('Deleted'); load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to delete');
    }
  };

  const visible = tasks.filter((t) =>
    !search ||
    [t.task_title, t.project_name, t.client_name, t.activity_name].some((s) =>
      (s || '').toLowerCase().includes(search.toLowerCase()),
    ),
  );
  const total = visible.reduce((s, t) => s + Number(t.hours_spent), 0);

  return (
    <div className="space-y-6">
      {/* Header strip */}
      <div className="flex flex-col md:flex-row md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold">My Tasks</h1>
          <p className="text-ink-mute text-sm">Log your day, build your streak.</p>
        </div>
        <div className="md:ml-auto flex items-center gap-2 flex-wrap">
          <span className="pill-brand"><Clock size={12} /> {filterDate}</span>
          <span className="pill-cyan"><ListChecks size={12} /> {visible.length} tasks</span>
          <span className="pill-ok"><Briefcase size={12} /> {total.toFixed(2)} h</span>
        </div>
      </div>

      {/* Entry form */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="card p-6"
      >
        <div className="flex items-center gap-2 mb-5">
          <div className="h-9 w-9 rounded-xl bg-brand-500/15 text-brand-400 flex items-center justify-center">
            <Plus size={18} />
          </div>
          <h2 className="font-semibold">New task</h2>
        </div>

        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-5">
          <div>
            <label className="label">Date</label>
            <DatePicker value={todayStr()} clearable={false} disabled onChange={() => {}} />
            <p className="mt-1 text-[11px] text-ink-mute">You can only log today&apos;s tasks</p>
          </div>
          <div>
            <label className="label">Client</label>
            <Select value={form.client_id} options={clientOptions} placeholder="Select client"
              onChange={(v) => setForm({ ...form, client_id: v, project_id: '' })} />
          </div>
          <div>
            <label className="label">Project</label>
            <Select value={form.project_id} options={projectOptions} placeholder="Select project"
              onChange={(v) => setForm({ ...form, project_id: v })} />
          </div>
          <div>
            <label className="label">Activity</label>
            <Select value={form.activity_id} options={activityOptions} placeholder="Select activity"
              onChange={(v) => setForm({ ...form, activity_id: v })} />
          </div>
          <div>
            <label className="label">Start Time</label>
            <TimePicker value={form.start_time} placeholder="Start"
              onChange={(v) => setForm({ ...form, start_time: v })} />
          </div>
          <div>
            <label className="label">End Time</label>
            <TimePicker value={form.end_time} placeholder="End"
              onChange={(v) => setForm({ ...form, end_time: v })} />
          </div>
          <div>
            <label className="label">Hours Spent</label>
            <div className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-sm">
              <Clock size={15} className="text-slate-400 shrink-0" />
              <span className={`flex-1 tabular-nums font-semibold ${form.hours_spent ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                {form.hours_spent ? `${form.hours_spent} h` : 'Auto'}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-ink-mute">Calculated from start &amp; end time</p>
          </div>
          <div>
            <label className="label">Assigned By</label>
            <input maxLength={255} placeholder="Who assigned this?"
              value={form.assigned_by} onChange={(e) => setForm({ ...form, assigned_by: e.target.value })} />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className="label">Reference</label>
            <input maxLength={255} placeholder="e.g. email from client, ticket #, doc link"
              value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </div>
          <div className="md:col-span-3 lg:col-span-4">
            <label className="label">Task Title</label>
            <input required maxLength={255}
              value={form.task_title} onChange={(e) => setForm({ ...form, task_title: e.target.value })} />
          </div>
          <div className="md:col-span-3 lg:col-span-4">
            <label className="label">Description</label>
            <textarea rows={3} placeholder="What did you work on? Add context for your weekly summary…"
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="md:col-span-3 lg:col-span-4 flex justify-end gap-2">
            <button type="submit" className="btn-primary">Log Task</button>
          </div>
        </form>
      </motion.div>

      {/* Table */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <DatePicker value={filterDate} onChange={setFilterDate} clearable={false} className="w-44" />
          <div className="relative ml-auto w-72">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input placeholder="Search task, project, client…" className="!pl-9 w-full"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Client</th>
                <th className="table-th">Project</th>
                <th className="table-th">Activity</th>
                <th className="table-th">Task</th>
                <th className="table-th text-right">Hours</th>
                <th className="table-th"></th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {visible.map((t) => (
                  <motion.tr
                    key={t.id}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <td className="table-td">{t.client_name}</td>
                    <td className="table-td font-medium text-slate-900 dark:text-white">{t.project_name}</td>
                    <td className="table-td"><span className="pill-brand">{t.activity_name}</span></td>
                    <td className="table-td">
                      <div className="font-medium text-slate-900 dark:text-white">{t.task_title}</div>
                      {t.description && <div className="text-xs text-ink-mute line-clamp-1">{t.description}</div>}
                      {(t.assigned_by || t.reference) && (
                        <div className="text-[11px] text-ink-mute mt-0.5">
                          {t.assigned_by && <>By {t.assigned_by}</>}
                          {t.assigned_by && t.reference && ' · '}
                          {t.reference && <>Ref: {t.reference}</>}
                        </div>
                      )}
                    </td>
                    <td className="table-td text-right tabular-nums font-semibold text-slate-900 dark:text-white">{Number(t.hours_spent).toFixed(2)}</td>
                    <td className="table-td text-right">
                      <button onClick={() => setConfirmId(t.id)} className="text-ink-mute hover:text-bad transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {visible.length === 0 && (
                <tr><td colSpan={6} className="table-td text-center text-ink-mute py-10">No tasks for this date.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete this task?"
        message="This task will be removed from your daily log. This action cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={remove}
        onClose={() => setConfirmId(null)}
      />
    </div>
  );
}
