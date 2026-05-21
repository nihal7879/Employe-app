import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import type { Client } from '../../types';

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({ client_name: '', status: 'Active' });

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
  const remove = async (id: number) => {
    if (!confirm('Delete this client?')) return;
    await api.delete(`/clients/${id}`); toast.success('Deleted'); load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clients</h1>
        <button onClick={() => { setEditing(null); setForm({ client_name: '', status: 'Active' }); setOpen(true); }} className="btn-primary">
          <Plus size={16} className="mr-2" /> Add Client
        </button>
      </div>
      <div className="card p-4 overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            <th className="table-th">Name</th><th className="table-th">Status</th><th className="table-th"></th>
          </tr></thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td className="table-td font-medium">{c.client_name}</td>
                <td className="table-td">{c.status}</td>
                <td className="table-td text-right space-x-2">
                  <button onClick={() => { setEditing(c); setForm({ client_name: c.client_name, status: c.status }); setOpen(true); }} className="text-brand-600"><Pencil size={16} /></button>
                  <button onClick={() => remove(c.id)} className="text-red-600"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
            {clients.length === 0 && <tr><td colSpan={3} className="table-td text-center text-slate-400">No clients.</td></tr>}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold">{editing ? 'Edit Client' : 'Add Client'}</h3>
              <button onClick={() => setOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-3">
              <div>
                <label className="label">Client Name</label>
                <input className="input" required value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option>Active</option><option>Inactive</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
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
