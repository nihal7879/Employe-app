import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Briefcase, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { TableSkeleton } from '../../components/Skeleton';

interface ClientRow {
  client_name: string | null;
  total_hours: number | string;
  tasks: number | string;
}

// Decimal hours → "1h 30m" (drops the leading "0h" / trailing "0m").
const fmtHrMin = (hours?: number) => {
  const total = Math.round(Number(hours || 0) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

export default function TodayClients() {
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get('/analytics/dashboard', { params: { period: 'today' } })
      .then((r) => setRows(r.data?.today_clients || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter((r) =>
    !search ? true : (r.client_name || '').toLowerCase().includes(search.toLowerCase()),
  );

  const totalHours = filtered.reduce((s, r) => s + Number(r.total_hours || 0), 0);
  const totalTasks = filtered.reduce((s, r) => s + Number(r.tasks || 0), 0);
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
          <h1 className="text-2xl font-bold">Clients active today</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {todayLabel} · {filtered.length} client{filtered.length === 1 ? '' : 's'} · {fmtHrMin(totalHours)} total
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 pill-cyan"><Briefcase size={12} /> {filtered.length}</span>
      </div>

      <div className="card p-4">
        <div className="relative max-w-sm mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            className="!pl-9"
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Client</th>
                <th className="table-th text-right">Tasks logged</th>
                <th className="table-th text-right">Hours till now</th>
              </tr>
            </thead>
            <tbody>
              {loading && <TableSkeleton rows={5} cols={3} />}
              {!loading && filtered.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                  <td className="table-td font-medium text-slate-900 dark:text-white">{r.client_name || 'Unassigned'}</td>
                  <td className="table-td text-right tabular-nums">{Number(r.tasks).toFixed(0)}</td>
                  <td className="table-td text-right tabular-nums font-semibold text-brand-600 dark:text-brand-300">{fmtHrMin(Number(r.total_hours))}</td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={3} className="table-td text-center text-slate-400 py-8">No client work logged {search ? 'matching that filter' : 'yet today'}.</td></tr>
              )}
              {!loading && filtered.length > 0 && (
                <tr className="border-t-2 border-slate-200 dark:border-white/10 font-semibold">
                  <td className="table-td">Total</td>
                  <td className="table-td text-right tabular-nums">{totalTasks}</td>
                  <td className="table-td text-right tabular-nums text-brand-700 dark:text-brand-300">{fmtHrMin(totalHours)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
