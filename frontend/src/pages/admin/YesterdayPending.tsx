import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { TableSkeleton } from '../../components/Skeleton';

interface PendingRow {
  id: number;
  name: string;
  email: string;
  employee_code: string;
  department_name?: string | null;
}

export default function YesterdayPending() {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [date, setDate] = useState<string>('');
  const [submitted, setSubmitted] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    // Compute yesterday in the browser's local timezone so it matches what the
    // user sees as "yesterday" on their calendar.
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setDate(yesterday);

    setLoading(true);
    Promise.all([
      api.get('/reports/daily', { params: { type: 'pending', date: yesterday } }),
      api.get('/reports/daily', { params: { type: 'employee', date: yesterday } }),
    ])
      .then(([pending, submitted]) => {
        setRows((pending.data || []) as PendingRow[]);
        setSubmitted(Array.isArray(submitted.data) ? submitted.data.length : 0);
      })
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

  const pendingCount = rows.length;
  const total = submitted + pendingCount;
  const pct = total > 0 ? Math.round((submitted / total) * 100) : 0;
  const dateLabel = date
    ? new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : 'Yesterday';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/" className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-500">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Yesterday — pending submissions</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {dateLabel} · {submitted} of {total} submitted ({pct}%)
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 pill-bad">
          <AlertTriangle size={12} /> {pendingCount} pending
        </span>
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
                <th className="table-th">Department</th>
              </tr>
            </thead>
            <tbody>
              {loading && <TableSkeleton rows={6} cols={3} />}
              {!loading && filtered.map((r) => (
                <tr key={r.id} className="hover:bg-rose-50/40 dark:hover:bg-rose-500/[0.06]">
                  <td className="table-td">{r.employee_code}</td>
                  <td className="table-td font-medium text-slate-900 dark:text-white">{r.name}</td>
                  <td className="table-td">{r.department_name || '—'}</td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={3} className="table-td text-center text-slate-400 py-8">
                  {pendingCount === 0 ? 'Everyone submitted yesterday — nothing pending.' : 'No employees match that filter.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
