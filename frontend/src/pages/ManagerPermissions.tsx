import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Search, ShieldCheck, CalendarClock, Clock } from 'lucide-react';
import { api } from '../lib/api';
import { TableSkeleton } from '../components/Skeleton';
import { APP_CONFIG } from '../config/app-config';

type PermKey = 'allow_backdated_tasks' | 'allow_log_anytime';
type TeamMember = {
  id: number;
  name: string;
  email?: string;
  employee_code: string;
  department_name?: string;
  allow_backdated_tasks?: boolean | number;
  allow_log_anytime?: boolean | number;
};

export default function ManagerPermissions() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // `${id}:${key}` in flight
  // Live backdate window (admin-set). Read-only here; falls back to the build value.
  const [backdateMaxDays, setBackdateMaxDays] = useState(APP_CONFIG.backdateMaxDays);

  useEffect(() => {
    api.get('/config')
      .then((r) => { if (r.data?.backdateMaxDays != null) setBackdateMaxDays(Number(r.data.backdateMaxDays)); })
      .catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/managers/me/team/permissions');
      setTeam(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to load team');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (emp: TeamMember, key: PermKey) => {
    const next = !emp[key];
    const flight = `${emp.id}:${key}`;
    setSaving(flight);
    // Optimistic update — revert on failure.
    setTeam((list) => list.map((e) => (e.id === emp.id ? { ...e, [key]: next } : e)));
    try {
      await api.patch(`/managers/me/team/permissions/${emp.id}`, { [key]: next });
    } catch {
      setTeam((list) => list.map((e) => (e.id === emp.id ? { ...e, [key]: !next } : e)));
      toast.error('Could not update permission');
    } finally {
      setSaving((s) => (s === flight ? null : s));
    }
  };

  const q = search.trim().toLowerCase();
  const visible = q
    ? team.filter((e) => e.name.toLowerCase().includes(q) || e.employee_code.toLowerCase().includes(q))
    : team;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-400 flex items-center justify-center">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Permissions</h1>
          <p className="text-ink-mute text-sm">Relax task-logging rules for the team members assigned to you.</p>
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="card p-4 flex items-start gap-3">
          <CalendarClock size={18} className="text-brand-500 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-sm">Backdate tasks</div>
            <div className="text-xs text-ink-mute">Log for past dates (up to {backdateMaxDays} days back), not just today.</div>
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

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="!pl-9"
          placeholder="Search team members…"
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
                <th className="table-th">Team Member</th>
                <th className="table-th">Department</th>
                <th className="table-th text-center">Backdate tasks</th>
                <th className="table-th text-center">Log anytime</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton rows={6} cols={4} />
              ) : visible.length === 0 ? (
                <tr><td colSpan={4} className="table-td text-center text-slate-400 py-10">
                  {team.length === 0 ? 'No team members are assigned to you yet.' : 'No team members match your search.'}
                </td></tr>
              ) : (
                visible.map((e) => (
                  <tr key={e.id}>
                    <td className="table-td">
                      <div className="font-medium text-slate-900 dark:text-white">{e.name}</div>
                      <div className="text-xs text-slate-500">{e.employee_code}{e.email ? ` · ${e.email}` : ''}</div>
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
