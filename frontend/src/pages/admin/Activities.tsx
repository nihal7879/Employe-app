import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import type { Activity } from '../../types';
import ConfirmDialog from '../../components/ConfirmDialog';
import { TableSkeleton } from '../../components/Skeleton';

export default function Activities() {
  const [items, setItems] = useState<Activity[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [name, setName] = useState('');
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setItems((await api.get('/activities')).data); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) await api.put(`/activities/${editing.id}`, { activity_name: name });
      else await api.post('/activities', { activity_name: name });
      toast.success('Saved'); setOpen(false); load();
    } catch (e: any) { toast.error(e.response?.data?.message || 'Failed'); }
  };
  const remove = async () => {
    if (confirmId == null) return;
    try {
      await api.delete(`/activities/${confirmId}`);
      toast.success('Deleted');
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Activities</h1>
        <button onClick={() => { setEditing(null); setName(''); setOpen(true); }} className="btn-primary">
          <Plus size={16} className="mr-2" /> Add Activity
        </button>
      </div>
      <div className="card p-4">
        <table className="w-full">
          <thead><tr><th className="table-th">Activity</th><th className="table-th"></th></tr></thead>
          <tbody>
            {loading && <TableSkeleton rows={5} cols={2} />}
            {!loading && items.map((a) => (
              <tr key={a.id}>
                <td className="table-td font-medium">{a.activity_name}</td>
                <td className="table-td text-right space-x-2">
                  <button onClick={() => { setEditing(a); setName(a.activity_name); setOpen(true); }} className="text-brand-600"><Pencil size={16} /></button>
                  <button onClick={() => setConfirmId(a.id)} className="text-red-600"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && <tr><td colSpan={2} className="table-td text-center text-slate-400">No activities.</td></tr>}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold">{editing ? 'Edit Activity' : 'Add Activity'}</h3>
              <button onClick={() => setOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-3">
              <div>
                <label className="label">Activity Name</label>
                <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editing ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete this activity?"
        message="This will remove the activity. Existing tasks remain intact. You cannot undo this from the UI."
        confirmLabel="Delete"
        danger
        onConfirm={remove}
        onClose={() => setConfirmId(null)}
      />
    </div>
  );
}
