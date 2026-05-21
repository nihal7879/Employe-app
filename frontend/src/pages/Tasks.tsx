import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import type { Activity, Client, DailyTask, Project } from '../types';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Tasks() {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [filterDate, setFilterDate] = useState(todayStr());

  const [form, setForm] = useState({
    client_id: '',
    project_id: '',
    activity_id: '',
    hours_spent: '',
    task_title: '',
    description: '',
    task_date: todayStr(),
    start_time: '',
    end_time: '',
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
    setClients(c.data);
    setProjects(p.data);
    setActivities(a.data);
    setTasks(t.data);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterDate]);

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
      toast.success('Task submitted');
      setForm({ ...form, task_title: '', description: '', hours_spent: '', start_time: '', end_time: '' });
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message?.[0] || e.response?.data?.message || 'Failed');
    }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this task?')) return;
    await api.delete(`/daily-tasks/${id}`);
    toast.success('Deleted');
    load();
  };

  const total = tasks.reduce((s, t) => s + Number(t.hours_spent), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Tasks</h1>

      <div className="card p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Plus size={18} /> Add a task</h2>
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" required value={form.task_date}
              onChange={(e) => setForm({ ...form, task_date: e.target.value })} />
          </div>
          <div>
            <label className="label">Client</label>
            <select className="input" required value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value, project_id: '' })}>
              <option value="">Select client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.client_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Project</label>
            <select className="input" required value={form.project_id}
              onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
              <option value="">Select project</option>
              {filteredProjects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Activity</label>
            <select className="input" required value={form.activity_id}
              onChange={(e) => setForm({ ...form, activity_id: e.target.value })}>
              <option value="">Select activity</option>
              {activities.map((a) => <option key={a.id} value={a.id}>{a.activity_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Hours Spent</label>
            <input type="number" step="0.25" min="0" max="24" className="input" required
              value={form.hours_spent} onChange={(e) => setForm({ ...form, hours_spent: e.target.value })} />
          </div>
          <div>
            <label className="label">Start Time</label>
            <input type="time" className="input"
              value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          </div>
          <div>
            <label className="label">End Time</label>
            <input type="time" className="input"
              value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </div>
          <div className="md:col-span-3 lg:col-span-4">
            <label className="label">Task Title</label>
            <input className="input" required maxLength={255}
              value={form.task_title} onChange={(e) => setForm({ ...form, task_title: e.target.value })} />
          </div>
          <div className="md:col-span-3 lg:col-span-4">
            <label className="label">Description</label>
            <textarea className="input" rows={3}
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="md:col-span-3 lg:col-span-4 flex justify-end">
            <button type="submit" className="btn-primary">Submit Task</button>
          </div>
        </form>
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="font-semibold">Tasks on</h2>
          <input type="date" className="input w-40" value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)} />
          <span className="ml-auto text-sm">
            Total: <strong className="text-brand-700">{total.toFixed(2)} h</strong>
          </span>
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
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td className="table-td">{t.client_name}</td>
                  <td className="table-td">{t.project_name}</td>
                  <td className="table-td">{t.activity_name}</td>
                  <td className="table-td">
                    <div className="font-medium">{t.task_title}</div>
                    {t.description && <div className="text-xs text-slate-500 line-clamp-1">{t.description}</div>}
                  </td>
                  <td className="table-td text-right">{Number(t.hours_spent).toFixed(2)}</td>
                  <td className="table-td text-right">
                    <button onClick={() => remove(t.id)} className="text-red-600 hover:text-red-800">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {tasks.length === 0 && (
                <tr><td colSpan={6} className="table-td text-center text-slate-400">No tasks for this date.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
