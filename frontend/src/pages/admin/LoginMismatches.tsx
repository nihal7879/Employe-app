import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, LogIn, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { TableSkeleton } from '../../components/Skeleton';
import DatePicker from '../../components/ui/DatePicker';

interface MismatchRow {
  id: number;
  name: string;
  email: string;
  employee_code: string;
  department_name?: string | null;
  first_login?: string | null;
  earliest_task?: string | null;
  tasks_before_login: number;
}

function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}
// "HH:MM[:SS]" -> "h:MM AM/PM"
function fmt12(s?: string | null) {
  if (!s) return '—';
  const m = String(s).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '—';
  const h = Number(m[1]);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${period}`;
}

export default function LoginMismatches() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [date, setDate] = useState(params.get('date') || yesterdayStr());
  const [rows, setRows] = useState<MismatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get('/audit/login-mismatches', { params: { date } })
      .then((r) => setRows(r.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [date]);

  const filtered = rows.filter((r) =>
    !search
      ? true
      : [r.name, r.email, r.employee_code, r.department_name || ''].some((v) =>
          (v || '').toLowerCase().includes(search.toLowerCase()),
        ),
  );

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const openEmployeeDay = (empId: number) =>
    navigate(`/reports?tab=day-view&employee=${empId}&date=${date}`);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/" className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-500">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Logged before login</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{dateLabel} · {filtered.length} employee{filtered.length === 1 ? '' : 's'} overrode the login window</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 pill-warn"><AlertTriangle size={12} /> {filtered.length}</span>
      </div>

      <div className="card p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
          <div className="w-full sm:w-52">
            <DatePicker value={date} clearable={false} maxDate={todayStr()} onChange={(v) => setDate(v || yesterdayStr())} />
          </div>
          <div className="relative w-full sm:max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input className="!pl-9" placeholder="Search by name, email, code, department…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Code</th>
                <th className="table-th">Name</th>
                <th className="table-th">Department</th>
                <th className="table-th">First login</th>
                <th className="table-th">Earliest task</th>
                <th className="table-th text-right">Tasks before login</th>
              </tr>
            </thead>
            <tbody>
              {loading && <TableSkeleton rows={6} cols={6} />}
              {!loading && filtered.map((r) => (
                <tr key={r.id}
                  onClick={() => openEmployeeDay(r.id)}
                  title="View this employee’s day"
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                  <td className="table-td">{r.employee_code}</td>
                  <td className="table-td font-medium text-slate-900 dark:text-white">{r.name}</td>
                  <td className="table-td">{r.department_name || '—'}</td>
                  <td className="table-td">
                    <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                      <LogIn size={13} /> {fmt12(r.first_login)}
                    </span>
                  </td>
                  <td className="table-td text-amber-700 dark:text-amber-400 font-medium">{fmt12(r.earliest_task)}</td>
                  <td className="table-td text-right tabular-nums font-semibold">{r.tasks_before_login}</td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="table-td text-center text-slate-400 py-8">No one logged tasks before their login {search ? 'matching that filter' : 'on this date'}.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
