import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus, Trash2, CalendarDays } from 'lucide-react';
import { api } from '../../lib/api';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import DatePicker from '../../components/ui/DatePicker';
import { TableSkeleton } from '../../components/Skeleton';

interface Holiday {
  id: number;
  holiday_date: string;
  name: string;
  description?: string | null;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

function fmtDate(d: string) {
  return new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function Holidays() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [form, setForm] = useState({ holiday_date: todayStr(), name: '', description: '' });
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setHolidays((await api.get('/holidays')).data || []); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.holiday_date) { toast.error('Pick a date'); return; }
    if (!form.name.trim()) { toast.error('Enter a holiday name'); return; }
    setSaving(true);
    try {
      const payload = { holiday_date: form.holiday_date, name: form.name.trim(), description: form.description.trim() || undefined };
      if (editing) await api.put(`/holidays/${editing.id}`, payload);
      else await api.post('/holidays', payload);
      toast.success('Saved'); setOpen(false); load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed');
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (confirmId == null) return;
    try {
      await api.delete(`/holidays/${confirmId}`);
      toast.success('Deleted'); setConfirmId(null); load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  const today = todayStr();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <CalendarDays size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Holidays</h1>
            <p className="text-ink-mute text-sm">Company holiday calendar. Shown to employees; skips reminders on these days.</p>
          </div>
        </div>
        <button
          onClick={() => { setEditing(null); setForm({ holiday_date: today, name: '', description: '' }); setOpen(true); }}
          className="btn-primary"
        >
          <Plus size={16} /> Add Holiday
        </button>
      </div>

      <div className="card p-4 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-th">Date</th>
              <th className="table-th">Holiday</th>
              <th className="table-th">Description</th>
              <th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <TableSkeleton rows={5} cols={4} />}
            {!loading && holidays.map((h) => {
              const past = String(h.holiday_date).slice(0, 10) < today;
              const isToday = String(h.holiday_date).slice(0, 10) === today;
              return (
                <tr key={h.id} className={past ? 'opacity-60' : ''}>
                  <td className="table-td whitespace-nowrap font-medium text-slate-900 dark:text-white">
                    {fmtDate(h.holiday_date)}
                    {isToday && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Today</span>}
                  </td>
                  <td className="table-td">{h.name}</td>
                  <td className="table-td text-sm text-slate-500 dark:text-slate-400">{h.description || '—'}</td>
                  <td className="table-td text-right space-x-2">
                    <button
                      onClick={() => { setEditing(h); setForm({ holiday_date: String(h.holiday_date).slice(0, 10), name: h.name, description: h.description || '' }); setOpen(true); }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-white/[0.06]"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => setConfirmId(h.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-white/[0.06]"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && holidays.length === 0 && (
              <tr><td colSpan={4} className="table-td text-center text-slate-400 py-10">No holidays added yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} title={editing ? 'Edit Holiday' : 'Add Holiday'} onClose={() => setOpen(false)} size="lg">
        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="label">Date</label>
            <DatePicker value={form.holiday_date} onChange={(v) => setForm({ ...form, holiday_date: v || today })} clearable={false} />
          </div>
          <div>
            <label className="label">Holiday name</label>
            <input required placeholder="e.g. Independence Day" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Description <span className="text-ink-mute">(optional)</span></label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Any note about this holiday" className="resize-y" />
          </div>
          <div className="flex justify-end gap-2 -mx-5 -mb-5 px-5 py-4 border-t border-slate-100 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02]">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete this holiday?"
        message="It will be removed from the calendar. You can add it again later."
        confirmLabel="Delete"
        danger
        onConfirm={remove}
        onClose={() => setConfirmId(null)}
      />
    </div>
  );
}
