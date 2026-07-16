import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Search, ShieldCheck, CalendarClock, Clock, Megaphone } from 'lucide-react';
import { api } from '../../lib/api';
import type { Employee } from '../../types';
import { TableSkeleton } from '../../components/Skeleton';
import { APP_CONFIG } from '../../config/app-config';

type PermKey = 'allow_backdated_tasks' | 'allow_log_anytime';
type UntilKey = 'allow_backdated_until' | 'allow_log_anytime_until';

const UNTIL_KEY: Record<PermKey, UntilKey> = {
  allow_backdated_tasks: 'allow_backdated_until',
  allow_log_anytime: 'allow_log_anytime_until',
};

// ISO (stored) → value for <input type="datetime-local"> in the admin's local
// time ("YYYY-MM-DDTHH:MM").
function toLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function expiryLabel(iso?: string | null): { text: string; expired: boolean } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const expired = d.getTime() <= Date.now();
  const text = d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return { text, expired };
}

// Notice text-colour presets (must match the keys the backend accepts and the
// NoticeTicker renders). `swatch` is the button preview colour.
const NOTICE_COLORS = [
  { key: 'red', label: 'Red', swatch: 'bg-red-600' },
  { key: 'amber', label: 'Amber', swatch: 'bg-amber-500' },
  { key: 'blue', label: 'Blue', swatch: 'bg-blue-600' },
  { key: 'green', label: 'Green', swatch: 'bg-emerald-600' },
  { key: 'slate', label: 'Grey', swatch: 'bg-slate-500' },
];

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
  const [noticeColor, setNoticeColor] = useState('red');
  const [savedNoticeColor, setSavedNoticeColor] = useState('red');
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
        if (r.data?.dashboardNoticeColor != null) {
          setNoticeColor(String(r.data.dashboardNoticeColor));
          setSavedNoticeColor(String(r.data.dashboardNoticeColor));
        }
      })
      .catch(() => {});
  }, []);

  const saveNotice = async () => {
    setSavingNotice(true);
    try {
      const { data } = await api.patch('/config', { dashboardNotice: notice, dashboardNoticeColor: noticeColor });
      const next = String(data?.dashboardNotice ?? notice);
      const nextColor = String(data?.dashboardNoticeColor ?? noticeColor);
      setNotice(next); setSavedNotice(next);
      setNoticeColor(nextColor); setSavedNoticeColor(nextColor);
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
    // Optimistic update — revert on failure. Turning off also clears the expiry.
    const untilKey = UNTIL_KEY[key];
    setEmployees((list) => list.map((e) => (e.id === emp.id ? { ...e, [key]: next, ...(next ? {} : { [untilKey]: null }) } : e)));
    try {
      await api.patch(`/employees/${emp.id}/permissions`, { [key]: next });
    } catch {
      setEmployees((list) => list.map((e) => (e.id === emp.id ? { ...e, [key]: !next } : e)));
      toast.error('Could not update permission');
    } finally {
      setSaving((s) => (s === flight ? null : s));
    }
  };

  // Save (or clear) the expiry for a permission. value = local datetime string
  // from the picker, or null to make it permanent.
  const saveUntil = async (emp: Employee, key: PermKey, value: string | null) => {
    const untilKey = UNTIL_KEY[key];
    const iso = value ? new Date(value).toISOString() : null;
    setEmployees((list) => list.map((e) => (e.id === emp.id ? { ...e, [untilKey]: iso } : e)));
    try {
      await api.patch(`/employees/${emp.id}/permissions`, { [untilKey]: iso });
      toast.success(iso ? 'Expiry set' : 'Made permanent');
    } catch {
      toast.error('Could not update expiry');
      load();
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
            {/* Text colour presets — only the scrolling message text is coloured. */}
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-ink-mute mr-1">Text colour:</span>
              {NOTICE_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  onClick={() => setNoticeColor(c.key)}
                  className={`h-6 w-6 rounded-full ${c.swatch} transition
                    ${noticeColor === c.key ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:ring-offset-bg-deep' : 'ring-1 ring-black/10 dark:ring-white/20'}`}
                />
              ))}
            </div>
            {(notice !== savedNotice || noticeColor !== savedNoticeColor) && (
              <div className="mt-3 flex items-center gap-2">
                <button type="button" className="btn-primary !py-1.5 !px-3 text-xs" disabled={savingNotice} onClick={saveNotice}>
                  {savingNotice ? 'Saving…' : 'Save notice'}
                </button>
                <button type="button" className="text-xs text-ink-mute underline" onClick={() => { setNotice(savedNotice); setNoticeColor(savedNoticeColor); }}>
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
                      <PermCell
                        on={!!e.allow_backdated_tasks}
                        busy={saving === `${e.id}:allow_backdated_tasks`}
                        until={e.allow_backdated_until}
                        onToggle={() => toggle(e, 'allow_backdated_tasks')}
                        onSaveUntil={(v) => saveUntil(e, 'allow_backdated_tasks', v)}
                      />
                    </td>
                    <td className="table-td text-center">
                      <PermCell
                        on={!!e.allow_log_anytime}
                        busy={saving === `${e.id}:allow_log_anytime`}
                        until={e.allow_log_anytime_until}
                        onToggle={() => toggle(e, 'allow_log_anytime')}
                        onSaveUntil={(v) => saveUntil(e, 'allow_log_anytime', v)}
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

// One permission cell: the on/off toggle plus, when on, an optional expiry.
// Blank expiry = permanent; a set expiry auto-closes the permission when it
// passes (enforced server-side).
function PermCell({
  on, busy, until, onToggle, onSaveUntil,
}: {
  on: boolean;
  busy: boolean;
  until?: string | null;
  onToggle: () => void;
  onSaveUntil: (value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const label = expiryLabel(until);

  const startEdit = () => { setVal(toLocalInput(until)); setEditing(true); };
  const save = () => { onSaveUntil(val || null); setEditing(false); };
  const clear = () => { onSaveUntil(null); setEditing(false); };

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <Toggle on={on} busy={busy} onClick={onToggle} />
      {on && (
        editing ? (
          <div className="flex items-center gap-1 mt-1">
            <input
              type="datetime-local"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              className="!py-1 !px-2 text-[11px] !w-auto"
            />
            <button type="button" className="btn-primary !py-1 !px-2 text-[11px]" onClick={save}>Set</button>
            <button type="button" className="text-[11px] text-ink-mute underline" onClick={clear}>Permanent</button>
            <button type="button" className="text-[11px] text-ink-mute" onClick={() => setEditing(false)}>✕</button>
          </div>
        ) : label ? (
          <button
            type="button"
            onClick={startEdit}
            title="Change"
            className={`text-[10px] px-1.5 py-0.5 rounded-full ${label.expired ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'}`}
          >
            {label.expired ? 'Expired' : label.text}
          </button>
        ) : (
          <button type="button" onClick={startEdit} title="Set" className="text-[10px] text-brand-600 dark:text-brand-400 hover:underline">
            Set
          </button>
        )
      )}
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
