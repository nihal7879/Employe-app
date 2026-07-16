import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus, Trash2, Megaphone } from 'lucide-react';
import { api } from '../../lib/api';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { TableSkeleton } from '../../components/Skeleton';

interface Notice {
  id: number;
  message: string;
  color: string;
  is_active: boolean | number;
  created_at?: string;
}

// Text-colour presets (must match the backend's accepted keys and the
// NoticeTicker renderer). `swatch` is the picker preview; `text` previews the
// message colour in the table.
const COLORS = [
  { key: 'red', label: 'Red', swatch: 'bg-red-600', text: 'text-red-700 dark:text-red-300' },
  { key: 'amber', label: 'Amber', swatch: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300' },
  { key: 'blue', label: 'Blue', swatch: 'bg-blue-600', text: 'text-blue-700 dark:text-blue-300' },
  { key: 'green', label: 'Green', swatch: 'bg-emerald-600', text: 'text-emerald-700 dark:text-emerald-300' },
  { key: 'slate', label: 'Grey', swatch: 'bg-slate-500', text: 'text-slate-700 dark:text-slate-200' },
];
const textOf = (c: string) => (COLORS.find((x) => x.key === c) || COLORS[0]).text;

function fmtDate(d?: string) {
  if (!d) return '';
  return new Date(String(d).replace(' ', 'T')).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function Notices() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [form, setForm] = useState({ message: '', color: 'red', is_active: true });
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setNotices((await api.get('/notices')).data || []); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.message.trim()) { toast.error('Enter a notice message'); return; }
    setSaving(true);
    try {
      const payload = { message: form.message.trim(), color: form.color, is_active: form.is_active };
      if (editing) await api.put(`/notices/${editing.id}`, payload);
      else await api.post('/notices', payload);
      toast.success('Saved'); setOpen(false); load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed');
    } finally { setSaving(false); }
  };

  // Flip active without opening the modal.
  const toggleActive = async (n: Notice) => {
    const next = !(n.is_active === true || n.is_active === 1);
    setNotices((xs) => xs.map((x) => (x.id === n.id ? { ...x, is_active: next } : x)));
    try { await api.put(`/notices/${n.id}`, { is_active: next }); }
    catch { toast.error('Failed'); load(); }
  };

  const remove = async () => {
    if (confirmId == null) return;
    try {
      await api.delete(`/notices/${confirmId}`);
      toast.success('Deleted'); setConfirmId(null); load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  const isOn = (n: Notice) => n.is_active === true || n.is_active === 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <Megaphone size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Notices</h1>
            <p className="text-ink-mute text-sm">Scrolling dashboard messages shown to employees. Active notices appear newest first.</p>
          </div>
        </div>
        <button
          onClick={() => { setEditing(null); setForm({ message: '', color: 'red', is_active: true }); setOpen(true); }}
          className="btn-primary"
        >
          <Plus size={16} /> Add Notice
        </button>
      </div>

      <div className="card p-4 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-th">Message</th>
              <th className="table-th">Added</th>
              <th className="table-th text-center">Active</th>
              <th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <TableSkeleton rows={4} cols={4} />}
            {!loading && notices.map((n) => (
              <tr key={n.id} className={isOn(n) ? '' : 'opacity-50'}>
                <td className={`table-td font-medium ${textOf(n.color)}`}>{n.message}</td>
                <td className="table-td whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">{fmtDate(n.created_at)}</td>
                <td className="table-td text-center">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isOn(n)}
                    onClick={() => toggleActive(n)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isOn(n) ? 'bg-brand-600' : 'bg-slate-300 dark:bg-white/15'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isOn(n) ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </td>
                <td className="table-td text-right space-x-2">
                  <button
                    onClick={() => { setEditing(n); setForm({ message: n.message, color: n.color, is_active: isOn(n) }); setOpen(true); }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-white/[0.06]"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setConfirmId(n.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-white/[0.06]"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {!loading && notices.length === 0 && (
              <tr><td colSpan={4} className="table-td text-center text-slate-400 py-10">No notices yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} title={editing ? 'Edit Notice' : 'Add Notice'} onClose={() => setOpen(false)} size="lg">
        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="label">Message</label>
            <textarea
              rows={2}
              maxLength={500}
              required
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="e.g. Please log each task within 60 minutes of finishing it."
              className="resize-y w-full"
            />
          </div>
          <div>
            <label className="label">Text colour</label>
            <div className="flex items-center gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  onClick={() => setForm({ ...form, color: c.key })}
                  className={`h-7 w-7 rounded-full ${c.swatch} transition
                    ${form.color === c.key ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:ring-offset-bg-deep' : 'ring-1 ring-black/10 dark:ring-white/20'}`}
                />
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="!w-auto" />
            Active (show on employee dashboards)
          </label>
          <div className="flex justify-end gap-2 -mx-5 -mb-5 px-5 py-4 border-t border-slate-100 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02]">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete this notice?"
        message="It will be removed from the list and stop showing to employees."
        confirmLabel="Delete"
        danger
        onConfirm={remove}
        onClose={() => setConfirmId(null)}
      />
    </div>
  );
}
