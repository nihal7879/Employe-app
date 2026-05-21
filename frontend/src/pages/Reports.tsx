import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const todayStr = () => new Date().toISOString().slice(0, 10);

type Tab = 'daily' | 'weekly' | 'monthly';
type DailyType = 'employee' | 'client' | 'project' | 'activity' | 'pending';

export default function Reports() {
  const [tab, setTab] = useState<Tab>('daily');
  const [dailyType, setDailyType] = useState<DailyType>('employee');
  const [date, setDate] = useState(todayStr());
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<any>(null);

  const load = async () => {
    if (tab === 'daily') {
      const r = await api.get('/reports/daily', { params: { date, type: dailyType } });
      setData(r.data);
    } else {
      const r = await api.get(`/reports/${tab}`, { params: { from, to } });
      setData(r.data);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab, dailyType, date, from, to]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports</h1>

      <div className="flex gap-2 border-b border-slate-200">
        {(['daily', 'weekly', 'monthly'] as Tab[]).map((t) => (
          <button key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'
            }`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="card p-4">
        {tab === 'daily' ? (
          <div className="flex flex-wrap gap-3 items-end mb-4">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Report Type</label>
              <select className="input" value={dailyType} onChange={(e) => setDailyType(e.target.value as DailyType)}>
                <option value="employee">Employee Productivity</option>
                <option value="client">Client Summary</option>
                <option value="project">Project Summary</option>
                <option value="activity">Activity Summary</option>
                <option value="pending">Pending Submissions</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 items-end mb-4">
            <div><label className="label">From</label>
              <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><label className="label">To</label>
              <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
        )}

        {tab === 'daily' ? <DailyTable type={dailyType} data={data} /> : <RangeTables data={data} />}
      </div>
    </div>
  );
}

function DailyTable({ type, data }: { type: DailyType; data: any }) {
  if (!Array.isArray(data)) return <p className="text-slate-400 text-sm">Loading…</p>;
  if (data.length === 0) return <p className="text-slate-400 text-sm">No data.</p>;

  const cols: Record<DailyType, { header: string[]; row: (r: any) => any[] }> = {
    employee: {
      header: ['Employee', 'Email', 'Tasks', 'Total Hours'],
      row: (r) => [r.employee_name, r.employee_email, r.task_count, Number(r.total_hours).toFixed(2)],
    },
    client: {
      header: ['Client', 'Tasks', 'Total Hours'],
      row: (r) => [r.client_name, r.task_count, Number(r.total_hours).toFixed(2)],
    },
    project: {
      header: ['Project', 'Tasks', 'Total Hours'],
      row: (r) => [r.project_name, r.task_count, Number(r.total_hours).toFixed(2)],
    },
    activity: {
      header: ['Activity', 'Tasks', 'Total Hours'],
      row: (r) => [r.activity_name, r.task_count, Number(r.total_hours).toFixed(2)],
    },
    pending: {
      header: ['Code', 'Name', 'Email', 'Department'],
      row: (r) => [r.employee_code, r.name, r.email, r.department_name],
    },
  };

  return (
    <table className="w-full">
      <thead><tr>{cols[type].header.map((h) => <th key={h} className="table-th">{h}</th>)}</tr></thead>
      <tbody>
        {data.map((r: any, i: number) => (
          <tr key={i}>
            {cols[type].row(r).map((v, j) => <td key={j} className="table-td">{v}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RangeTables({ data }: { data: any }) {
  if (!data) return <p className="text-slate-400 text-sm">Loading…</p>;
  return (
    <div className="space-y-6">
      <Section title="Employees" rows={data.employees}
        cols={['employee_name', 'task_count', 'total_hours']}
        headers={['Employee', 'Tasks', 'Hours']} />
      <Section title="Clients" rows={data.clients}
        cols={['client_name', 'task_count', 'total_hours']}
        headers={['Client', 'Tasks', 'Hours']} />
      <Section title="Projects" rows={data.projects}
        cols={['project_name', 'task_count', 'total_hours']}
        headers={['Project', 'Tasks', 'Hours']} />
      <Section title="Activities" rows={data.activities}
        cols={['activity_name', 'task_count', 'total_hours']}
        headers={['Activity', 'Tasks', 'Hours']} />
    </div>
  );
}

function Section({ title, rows, cols, headers }: { title: string; rows: any[]; cols: string[]; headers: string[] }) {
  return (
    <div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <table className="w-full">
        <thead><tr>{headers.map((h) => <th key={h} className="table-th">{h}</th>)}</tr></thead>
        <tbody>
          {(rows || []).map((r: any, i: number) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c} className="table-td">
                  {c === 'total_hours' ? Number(r[c]).toFixed(2) : r[c]}
                </td>
              ))}
            </tr>
          ))}
          {(!rows || rows.length === 0) && (
            <tr><td colSpan={cols.length} className="table-td text-center text-slate-400">No data.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
