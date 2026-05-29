import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LogIn, LogOut, Search, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { TableSkeleton } from '../../components/Skeleton';

interface PresentRow {
  id: number;
  name: string;
  email: string;
  employee_code: string;
  department_name?: string | null;
  first_login?: string | null;
  last_logout?: string | null;
}

function fmtTime(s?: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
function fmtDuration(a?: string | null, b?: string | null) {
  if (!a) return '—';
  const start = new Date(a).getTime();
  const end = b ? new Date(b).getTime() : Date.now();
  const ms = Math.max(0, end - start);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m${b ? '' : ' (still in)'}`;
}

export default function TodayPresent() {
  const [rows, setRows] = useState<PresentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get('/analytics/dashboard', { params: { period: 'today' } })
      .then((r) => setRows(r.data?.present_today || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter((r) =>
    !search
      ? true
      : [r.name, r.email, r.employee_code, r.department_name || ''].some((v) =>
          (v || '').toLowerCase().includes(search.toLowerCase()),
        ),
  );

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/" className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-500">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Present today</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{todayLabel} · {filtered.length} employee{filtered.length === 1 ? '' : 's'} logged in</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 pill-ok"><Users size={12} /> {filtered.length}</span>
      </div>

      <div className="card p-4">
        <div className="relative max-w-sm mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            className="!pl-9"
            placeholder="Search by name, email, code, department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Code</th>
                <th className="table-th">Name</th>
                <th className="table-th">Email</th>
                <th className="table-th">Department</th>
                <th className="table-th">First login</th>
                <th className="table-th">Last logout</th>
              </tr>
            </thead>
            <tbody>
              {loading && <TableSkeleton rows={6} cols={7} />}
              {!loading && filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                  <td className="table-td">{r.employee_code}</td>
                  <td className="table-td font-medium text-slate-900 dark:text-white">{r.name}</td>
                  <td className="table-td">{r.email}</td>
                  <td className="table-td">{r.department_name || '—'}</td>
                  <td className="table-td">
                    <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                      <LogIn size={13} /> {fmtTime(r.first_login)}
                    </span>
                  </td>
                  <td className="table-td">
                    {r.last_logout ? (
                      <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                        <LogOut size={13} /> {fmtTime(r.last_logout)}
                      </span>
                    ) : (
                      <span className="pill-ok">Still online</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="table-td text-center text-slate-400 py-8">No one logged in {search ? 'matching that filter' : 'yet today'}.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
