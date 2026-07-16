import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Search, ShieldCheck, CalendarClock, Clock, Megaphone } from 'lucide-react';
import { api } from '../../lib/api';
import type { Employee } from '../../types';
import { TableSkeleton } from '../../components/Skeleton';
import { APP_CONFIG } from '../../config/app-config';

type PermKey = 'allow_backdated_tasks' | 'allow_log_anytime';

export default function Permissions() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // `${id}:${key}` in flight

  // Global backdate window (days back a backdater may log). Admin-tunable; the
  // build-time const is only the initial value until /config responds.
  const [backdateDays, setBackdateDays] = useState(String(APP_CONFIG.backdateMaxDays));
  const [savedDays, setSavedDays] = useState(String(APP_CONFIG.backdateMaxDays));
  const [savingDays, setSavingDays] = useState(false);

  // Scrolling dashboard notice (admin-editable, live via runtime-config).
  const [notice, setNotice] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const [savingNotice, setSavingNotice] = useState(false);

  useEffect(() => {
    api.get('/config')
      .then((r) => {
        if (r.data?.backdateMaxDays != null) {
          setBackdateDays(String(r.data.backdateMaxDays));
          setSavedDays(String(r.data.backdateMaxDays));
        }
        if (r.data?.dashboardNotice != null) {
          setNotice(String(r.data.dashboardNotice));
          setSavedNotice(String(r.data.dashboardNotice));
        }
      })
      .catch(() => {});
  }, []);

  const saveNotice = async () => {
    setSavingNotice(true);
    try {
      const { data } = await api.patch('/config', { dashboardNotice: notice });
      const next = String(data?.dashboardNotice ?? notice);
      setNotice(next); setSavedNotice(next);
      toast.success('Dashboard notice updated');
    } catch {
      toast.error('Could not update notice');
    } finally {
      setSavingNotice(false);
    }
  };

  const saveBackdateDays = async () => {
    const n = Number(backdateDays);
    if (!Number.isInteger(n) || n < 0 || n > 365) {
      toast.error('Enter a whole number of days (0–365)'); return;
    }
    setSavingDays(true);
    try {
      const { data } = await api.patch('/config', { backdateMaxDays: n });
      const next = String(data?.backdateMaxDays ?? n);
      setBackdateDays(next); setSavedDays(next);
      toast.success('Backdate window updated');
    } catch {
      toast.error('Could not update backdate window');
    } finally {
      setSavingDays(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/employees', { params: { search: search || undefined } });
      setEmployees(data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [search]);

  const toggle = async (emp: Employee, key: PermKey) => {
    const next = !emp[key];
    const flight = `${emp.id}:${key}`;
    setSaving(flight);
    // Optimistic update — revert on failure.
    setEmployees((list) => list.map((e) => (e.id === emp.id ? { ...e, [key]: next } : e)));
    try {
      await api.patch(`/employees/${emp.id}/permissions`, { [key]: next });
    } catch {
      setEmployees((list) => list.map((e) => (e.id === emp.id ? { ...e, [key]: !next } : e)));
      toast.error('Could not update permission');
    } finally {
      setSaving((s) => (s === flight ? null : s));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-400 flex items-center justify-center">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Permissions</h1>
          <p className="text-ink-mute text-sm">Relax task-logging rules per employee.</p>
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="card p-4 flex items-start gap-3">
          <CalendarClock size={18} className="text-brand-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-sm">Backdate tasks</div>
            <div className="text-xs text-ink-mute">Log for past dates, not just today. How far back:</div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={365}
                className="!w-20 !py-1.5 text-sm"
                value={backdateDays}
                onChange={(e) => setBackdateDays(e.target.value)}
              />
              <span className="text-xs text-ink-mute">days back</span>
              {backdateDays !== savedDays && (
                <button
                  type="button"
                  className="btn-primary !py-1.5 !px-3 text-xs"
                  disabled={savingDays}
                  onClick={saveBackdateDays}
                >
                  {savingDays ? 'Saving…' : 'Save'}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="card p-4 flex items-start gap-3">
          <Clock size={18} className="text-cyan-500 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-sm">Log anytime</div>
            <div className="text-xs text-ink-mute">Log work before the morning login (for a forgotten login).</div>
          </div>
        </div>
      </div>

      {/* Dashboard notice editor */}
      <div className="card p-4">
        <div className="flex items-start gap-3">
          <Megaphone size={18} className="text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-sm">Dashboard notice</div>
            <div className="text-xs text-ink-mute">Scrolling message shown to all employees on their dashboard. Leave empty to hide it.</div>
            <textarea
              className="mt-2 w-full text-sm !py-2"
              rows={2}
              maxLength={500}
              placeholder="e.g. Please log each task within 60 minutes of finishing it."
              value={notice}
              onChange={(e) => setNotice(e.target.value)}
            />
            {notice !== savedNotice && (
              <div className="mt-2 flex items-center gap-2">
                <button type="button" className="btn-primary !py-1.5 !px-3 text-xs" disabled={savingNotice} onClick={saveNotice}>
                  {savingNotice ? 'Saving…' : 'Save notice'}
                </button>
                <button type="button" className="text-xs text-ink-mute underline" onClick={() => setNotice(savedNotice)}>
                  Reset
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="!pl-9"
          placeholder="Search employees…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Employee</th>
                <th className="table-th">Department</th>
                <th className="table-th text-center">Backdate tasks</th>
                <th className="table-th text-center">Log anytime</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton rows={6} cols={4} />
              ) : employees.length === 0 ? (
                <tr><td colSpan={4} className="table-td text-center text-slate-400 py-10">No employees found.</td></tr>
              ) : (
                employees.map((e) => (
                  <tr key={e.id}>
                    <td className="table-td">
                      <div className="font-medium text-slate-900 dark:text-white">{e.name}</div>
                      <div className="text-xs text-slate-500">{e.employee_code} · {e.email}</div>
                    </td>
                    <td className="table-td text-sm text-slate-600 dark:text-slate-300">{e.department_name || '—'}</td>
                    <td className="table-td text-center">
                      <Toggle
                        on={!!e.allow_backdated_tasks}
                        busy={saving === `${e.id}:allow_backdated_tasks`}
                        onClick={() => toggle(e, 'allow_backdated_tasks')}
                      />
                    </td>
                    <td className="table-td text-center">
                      <Toggle
                        on={!!e.allow_log_anytime}
                        busy={saving === `${e.id}:allow_log_anytime`}
                        onClick={() => toggle(e, 'allow_log_anytime')}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, busy, onClick }: { on: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50
        ${on ? 'bg-brand-600' : 'bg-slate-300 dark:bg-white/15'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
          ${on ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  );
}
