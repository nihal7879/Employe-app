import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LogIn, LogOut, Search, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { TableSkeleton } from '../../components/Skeleton';
import DatePicker from '../../components/ui/DatePicker';

interface PresentRow {
  id: number;
  name: string;
  email: string;
  employee_code: string;
  department_name?: string | null;
  first_login?: string | null;
  last_logout?: string | null;
}

function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

function fmtTime(s?: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function TodayPresent() {
  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState<PresentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const isToday = date === todayStr();

  useEffect(() => {
    setLoading(true);
    api.get('/audit/present', { params: { date } })
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/" className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-500">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{isToday ? 'Present today' : 'Presence'}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{dateLabel} · {filtered.length} employee{filtered.length === 1 ? '' : 's'} logged in</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 pill-ok"><Users size={12} /> {filtered.length}</span>
      </div>

      <div className="card p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
          {/* Pick any date to see who logged in / out that day. */}
          <div className="w-full sm:w-52">
            <DatePicker
              value={date}
              clearable={false}
              maxDate={todayStr()}
              onChange={(v) => setDate(v || todayStr())}
            />
          </div>
          <div className="relative w-full sm:max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              className="!pl-9"
              placeholder="Search by name, email, code, department…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
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
                    ) : isToday ? (
                      <span className="pill-ok">Still online</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="table-td text-center text-slate-400 py-8">No one logged in {search ? 'matching that filter' : isToday ? 'yet today' : 'on this date'}.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
