import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import type { Client, Project } from '../../types';

const empty = { client_id: '', project_code: '', project_name: '', start_date: '', end_date: '', project_status: 'Active' };

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState<any>(empty);

  const load = async () => {
    const [p, c] = await Promise.all([api.get('/projects'), api.get('/clients')]);
    setProjects(p.data); setClients(c.data);
  };
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        client_id: Number(form.client_id),
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
      };
      if (editing) await api.put(`/projects/${editing.id}`, payload);
      else await api.post('/projects', payload);
      toast.success('Saved'); setOpen(false); load();
    } catch (e: any) {
      toast.error(e.response?.data?.message?.[0] || e.response?.data?.message || 'Failed');
    }
  };
  const remove = async (id: number) => {
    if (!confirm('Delete this project?')) return;
    await api.delete(`/projects/${id}`); toast.success('Deleted'); load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <button onClick={() => { setEditing(null); setForm(empty); setOpen(true); }} className="btn-primary">
          <Plus size={16} className="mr-2" /> Add Project
        </button>
      </div>
      <div className="card p-4 overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            <th className="table-th">Code</th>
            <th className="table-th">Project</th>
            <th className="table-th">Client</th>
            <th className="table-th">Start</th>
            <th className="table-th">End</th>
            <th className="table-th">Status</th>
            <th className="table-th"></th>
          </tr></thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td className="table-td">{p.project_code}</td>
                <td className="table-td font-medium">{p.project_name}</td>
                <td className="table-td">{p.client_name}</td>
                <td className="table-td">{p.start_date}</td>
                <td className="table-td">{p.end_date}</td>
                <td className="table-td">{p.project_status}</td>
                <td className="table-td text-right space-x-2">
                  <button onClick={() => {
                    setEditing(p);
                    setForm({
                      client_id: String(p.client_id), project_code: p.project_code, project_name: p.project_name,
                      start_date: p.start_date || '', end_date: p.end_date || '', project_status: p.project_status,
                    });
                    setOpen(true);
                  }} className="text-brand-600"><Pencil size={16} /></button>
                  <button onClick={() => remove(p.id)} className="text-red-600"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
            {projects.length === 0 && <tr><td colSpan={7} className="table-td text-center text-slate-400">No projects.</td></tr>}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold">{editing ? 'Edit Project' : 'Add Project'}</h3>
              <button onClick={() => setOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={submit} className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Client</label>
                <select className="input" required value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
                  <option value="">Select client</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.client_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Project Code</label>
                <input className="input" required value={form.project_code} onChange={(e) => setForm({ ...form, project_code: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Project Name</label>
                <input className="input" required value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} />
              </div>
              <div>
                <label className="label">Start Date</label>
                <input type="date" className="input" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div>
                <label className="label">End Date</label>
                <input type="date" className="input" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.project_status} onChange={(e) => setForm({ ...form, project_status: e.target.value })}>
                  <option>Active</option><option>Completed</option><option>Pending</option><option>On Hold</option>
                </select>
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editing ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
