import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import type { Client, Project } from '../../types';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import ConfirmDialog from '../../components/ConfirmDialog';
import { TableSkeleton } from '../../components/Skeleton';

// Simplified to Active / Inactive only. Other lifecycle states (Completed,
// Pending, On Hold) were removed per admin feedback — they were rarely set.
const empty = { client_id: '', project_name: '', project_status: 'Active' };

const STATUS_OPTIONS = [
  { label: 'Active',   value: 'Active',   color: '#10B981' },
  { label: 'Inactive', value: 'Inactive', color: '#94A3B8' },
];

const STATUS_PILL: Record<string, string> = {
  Active:   'pill-ok',
  Inactive: 'pill-soft',
};

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState<any>(empty);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([api.get('/projects'), api.get('/clients')]);
      setProjects(p.data); setClients(c.data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Backend auto-generates project_code from project_name when missing.
      const payload = { ...form, client_id: Number(form.client_id) };
      if (editing) await api.put(`/projects/${editing.id}`, payload);
      else await api.post('/projects', payload);
      toast.success('Saved'); setOpen(false); load();
    } catch (e: any) {
      toast.error(e.response?.data?.message?.[0] || e.response?.data?.message || 'Failed');
    }
  };

  const remove = async () => {
    if (confirmId == null) return;
    try {
      await api.delete(`/projects/${confirmId}`);
      toast.success('Deleted'); load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  const clientOptions = clients.map((c) => ({ label: c.client_name, value: String(c.id) }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <button
          onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}
          className="btn-primary"
        >
          <Plus size={16} /> Add Project
        </button>
      </div>

      <div className="card p-4 overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            <th className="table-th">Project</th>
            <th className="table-th">Client</th>
            <th className="table-th">Status</th>
            <th className="table-th"></th>
          </tr></thead>
          <tbody>
            {loading && <TableSkeleton rows={6} cols={4} />}
            {!loading && projects.map((p) => {
              // Treat any legacy status (Completed / Pending / On Hold) as Inactive in the UI.
              const status = p.project_status === 'Active' ? 'Active' : 'Inactive';
              return (
                <tr key={p.id}>
                  <td className="table-td font-medium text-slate-900 dark:text-white">{p.project_name}</td>
                  <td className="table-td">{p.client_name}</td>
                  <td className="table-td"><span className={STATUS_PILL[status]}>{status}</span></td>
                  <td className="table-td text-right space-x-1">
                    <button
                      onClick={() => {
                        setEditing(p);
                        setForm({
                          client_id: String(p.client_id),
                          project_name: p.project_name,
                          project_status: status,
                        });
                        setOpen(true);
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-500/15"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => setConfirmId(p.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-500/15"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && projects.length === 0 && <tr><td colSpan={4} className="table-td text-center text-slate-400 py-6">No projects.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={open} title={editing ? 'Edit Project' : 'Add Project'} onClose={() => setOpen(false)} size="lg">
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="label">Client</label>
            <Select
              value={form.client_id}
              options={clientOptions}
              onChange={(v) => setForm({ ...form, client_id: v })}
              placeholder="Select client"
            />
          </div>
          <div>
            <label className="label">Status</label>
            <Select
              value={form.project_status}
              options={STATUS_OPTIONS}
              onChange={(v) => setForm({ ...form, project_status: v })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Project Name</label>
            <input
              required
              placeholder="e.g. Kali Loader"
              value={form.project_name}
              onChange={(e) => setForm({ ...form, project_name: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2 -mx-5 -mb-5 px-5 py-4 border-t border-slate-100 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02]">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary">{editing ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete this project?"
        message="The project will be hidden from new task entries. Existing tasks logged against it remain intact."
        confirmLabel="Delete"
        danger
        onConfirm={remove}
        onClose={() => setConfirmId(null)}
      />
    </div>
  );
}
