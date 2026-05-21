import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import type { Client } from '../../types';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import ConfirmDialog from '../../components/ConfirmDialog';

const STATUS_OPTIONS = [
  { label: 'Active', value: 'Active', color: '#10B981' },
  { label: 'Inactive', value: 'Inactive', color: '#94A3B8' },
];

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({ client_name: '', status: 'Active' });
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const load = async () => setClients((await api.get('/clients')).data);
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) await api.put(`/clients/${editing.id}`, form);
      else await api.post('/clients', form);
      toast.success('Saved'); setOpen(false); load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  const remove = async () => {
    if (confirmId == null) return;
    try {
      await api.delete(`/clients/${confirmId}`);
      toast.success('Deleted');
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clients</h1>
        <button
          onClick={() => { setEditing(null); setForm({ client_name: '', status: 'Active' }); setOpen(true); }}
          className="btn-primary"
        >
          <Plus size={16} /> Add Client
        </button>
      </div>

      <div className="card p-4 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-th">Name</th>
              <th className="table-th">Status</th>
              <th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td className="table-td font-medium text-slate-900">{c.client_name}</td>
                <td className="table-td">
                  <span className={c.status === 'Active' ? 'pill-ok' : 'pill-soft'}>{c.status}</span>
                </td>
                <td className="table-td text-right space-x-2">
                  <button
                    onClick={() => { setEditing(c); setForm({ client_name: c.client_name, status: c.status }); setOpen(true); }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-brand-600 hover:bg-brand-50"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setConfirmId(c.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr><td colSpan={3} className="table-td text-center text-slate-400">No clients.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} title={editing ? 'Edit Client' : 'Add Client'} onClose={() => setOpen(false)} size="lg">
        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="label">Client Name</label>
            <input
              required
              placeholder="e.g. Sundaram"
              value={form.client_name}
              onChange={(e) => setForm({ ...form, client_name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Status</label>
            <Select
              value={form.status}
              options={STATUS_OPTIONS}
              onChange={(v) => setForm({ ...form, status: v })}
            />
          </div>
          <div className="flex justify-end gap-2 -mx-5 -mb-5 px-5 py-4 border-t border-slate-100 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02]">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary">{editing ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete this client?"
        message="This will hide the client from new task entry. Existing tasks remain intact. You cannot undo this from the UI."
        confirmLabel="Delete"
        danger
        onConfirm={remove}
        onClose={() => setConfirmId(null)}
      />
    </div>
  );
}
