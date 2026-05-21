import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Plus, Trash2, Clock, Briefcase, ListChecks, Search } from 'lucide-react';
import { api } from '../lib/api';
import type { Activity, Client, DailyTask, Project } from '../types';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Tasks() {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [filterDate, setFilterDate] = useState(todayStr());
  const [search, setSearch] = useState('');

  const [form, setForm] = useState({
    client_id: '', project_id: '', activity_id: '',
    hours_spent: '', task_title: '', description: '',
    task_date: todayStr(), start_time: '', end_time: '',
  });

  const filteredProjects = useMemo(
    () => (form.client_id ? projects.filter((p) => p.client_id === Number(form.client_id)) : projects),
    [projects, form.client_id],
  );

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
    try {
      await api.post('/daily-tasks', {
        client_id: Number(form.client_id),
        project_id: Number(form.project_id),
        activity_id: Number(form.activity_id),
        hours_spent: Number(form.hours_spent),
        task_title: form.task_title,
        description: form.description,
        task_date: form.task_date,
        start_time: form.start_time || undefined,
        end_time: form.end_time || undefined,
      });
      toast.success('Task logged');
      setForm({ ...form, task_title: '', description: '', hours_spent: '', start_time: '', end_time: '' });
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message?.[0] || e.response?.data?.message || 'Failed');
    }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this task?')) return;
    await api.delete(`/daily-tasks/${id}`);
    toast.success('Deleted'); load();
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
          <span className="ml-auto text-xs text-ink-mute">Captured IP is logged automatically</span>
        </div>

        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <label className="label">Date</label>
            <input type="date" required value={form.task_date}
              onChange={(e) => setForm({ ...form, task_date: e.target.value })} />
          </div>
          <div>
            <label className="label">Client</label>
            <select required value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value, project_id: '' })}>
              <option value="">Select client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.client_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Project</label>
            <select required value={form.project_id}
              onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
              <option value="">Select project</option>
              {filteredProjects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Activity</label>
            <select required value={form.activity_id}
              onChange={(e) => setForm({ ...form, activity_id: e.target.value })}>
              <option value="">Select activity</option>
              {activities.map((a) => <option key={a.id} value={a.id}>{a.activity_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Hours Spent</label>
            <input type="number" step="0.25" min="0" max="24" required
              value={form.hours_spent} onChange={(e) => setForm({ ...form, hours_spent: e.target.value })} />
          </div>
          <div>
            <label className="label">Start Time</label>
            <input type="time" value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          </div>
          <div>
            <label className="label">End Time</label>
            <input type="time" value={form.end_time}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
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
          <h2 className="font-semibold">Tasks on</h2>
          <input type="date" className="w-40" value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)} />
          <div className="relative ml-auto">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
            <input placeholder="Search task, project, client…" className="pl-9 w-72"
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
                    <td className="table-td font-medium text-ink">{t.project_name}</td>
                    <td className="table-td"><span className="pill-brand">{t.activity_name}</span></td>
                    <td className="table-td">
                      <div className="font-medium text-ink">{t.task_title}</div>
                      {t.description && <div className="text-xs text-ink-mute line-clamp-1">{t.description}</div>}
                    </td>
                    <td className="table-td text-right tabular-nums font-semibold text-ink">{Number(t.hours_spent).toFixed(2)}</td>
                    <td className="table-td text-right">
                      <button onClick={() => remove(t.id)} className="text-ink-mute hover:text-bad transition-colors">
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
    </div>
  );
}
