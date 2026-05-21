import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Filter as FilterIcon } from 'lucide-react';
import { api } from '../lib/api';
import type { Activity, Client, DailyTask, Employee, Project } from '../types';

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStartStr = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

type Tab = 'daily' | 'weekly' | 'monthly' | 'drilldown';
type DailyType = 'employee' | 'client' | 'project' | 'activity' | 'pending';
const DAILY_TYPES: DailyType[] = ['employee', 'client', 'project', 'activity', 'pending'];

export default function Reports() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(((params.get('tab') as Tab) || 'daily'));
  const [dailyType, setDailyType] = useState<DailyType>(
    DAILY_TYPES.includes(params.get('type') as DailyType) ? (params.get('type') as DailyType) : 'employee',
  );
  const [date, setDate] = useState(todayStr());
  const [from, setFrom] = useState(monthStartStr());
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<any>(null);

  // Drilldown state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [filters, setFilters] = useState({ employee_id: '', client_id: '', project_id: '', activity_id: '' });
  const [tasks, setTasks] = useState<DailyTask[]>([]);

  useEffect(() => {
    if (tab !== 'drilldown') return;
    Promise.all([
      api.get('/employees'), api.get('/clients'), api.get('/projects'), api.get('/activities'),
    ]).then(([e, c, p, a]) => {
      setEmployees(e.data); setClients(c.data); setProjects(p.data); setActivities(a.data);
    }).catch(() => {});
  }, [tab]);

  const filteredProjects = useMemo(
    () => (filters.client_id ? projects.filter((p) => p.client_id === Number(filters.client_id)) : projects),
    [projects, filters.client_id],
  );

  const load = async () => {
    if (tab === 'daily') {
      const r = await api.get('/reports/daily', { params: { date, type: dailyType } });
      setData(r.data);
    } else if (tab === 'weekly' || tab === 'monthly') {
      const r = await api.get(`/reports/${tab}`, { params: { from, to } });
      setData(r.data);
    } else if (tab === 'drilldown') {
      const r = await api.get('/daily-tasks', {
        params: {
          from, to,
          employee_id: filters.employee_id || undefined,
          client_id:   filters.client_id   || undefined,
          project_id:  filters.project_id  || undefined,
          activity_id: filters.activity_id || undefined,
        },
      });
      setTasks(r.data);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab, dailyType, date, from, to, filters]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-slate-500">Aggregated views and a deep drill-down for any employee, client, or project.</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {(['daily', 'weekly', 'monthly', 'drilldown'] as Tab[]).map((t) => (
          <button key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}>
            {t === 'drilldown' ? 'Drilldown' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ============= AGGREGATE TABS ============= */}
      {tab !== 'drilldown' && (
        <div className="card p-5">
          {tab === 'daily' ? (
            <div className="flex flex-wrap gap-3 items-end mb-4">
              <div>
                <label className="label">Date</label>
                <input type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Report Type</label>
                <select className="w-56" value={dailyType} onChange={(e) => setDailyType(e.target.value as DailyType)}>
                  <option value="employee">Employee Productivity</option>
                  <option value="client">Client Summary</option>
                  <option value="project">Project Summary</option>
                  <option value="activity">Activity Summary</option>
                  <option value="pending">Pending Submissions</option>
                </select>
              </div>
              <button onClick={() => downloadCsv(`daily-${dailyType}-${date}.csv`, data || [])} className="btn-secondary ml-auto">
                <Download size={14} /> Download CSV
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3 items-end mb-4">
              <div><label className="label">From</label>
                <input type="date" className="w-44" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div><label className="label">To</label>
                <input type="date" className="w-44" value={to} onChange={(e) => setTo(e.target.value)} /></div>
              <button onClick={() => downloadCsv(`${tab}-${from}_to_${to}.csv`, data?.employees || [])} className="btn-secondary ml-auto">
                <Download size={14} /> Download CSV (Employees)
              </button>
            </div>
          )}

          {tab === 'daily' ? <DailyTable type={dailyType} data={data} /> : <RangeTables data={data} />}
        </div>
      )}

      {/* ============= DRILLDOWN TAB ============= */}
      {tab === 'drilldown' && (
        <>
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-slate-700">
              <FilterIcon size={16} className="text-brand-600" /> Filters
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="label">From</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <label className="label">To</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div>
                <label className="label">Employee</label>
                <select value={filters.employee_id} onChange={(e) => setFilters({ ...filters, employee_id: e.target.value })}>
                  <option value="">All employees</option>
                  {employees.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Client</label>
                <select value={filters.client_id} onChange={(e) => setFilters({ ...filters, client_id: e.target.value, project_id: '' })}>
                  <option value="">All clients</option>
                  {clients.map((x) => <option key={x.id} value={x.id}>{x.client_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Project</label>
                <select value={filters.project_id} onChange={(e) => setFilters({ ...filters, project_id: e.target.value })}>
                  <option value="">All projects</option>
                  {filteredProjects.map((x) => <option key={x.id} value={x.id}>{x.project_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Activity</label>
                <select value={filters.activity_id} onChange={(e) => setFilters({ ...filters, activity_id: e.target.value })}>
                  <option value="">All activities</option>
                  {activities.map((x) => <option key={x.id} value={x.id}>{x.activity_name}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button onClick={() => setFilters({ employee_id: '', client_id: '', project_id: '', activity_id: '' })} className="btn-ghost">
                Clear filters
              </button>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-sm text-slate-500">
                  <strong className="text-slate-900">{tasks.length}</strong> tasks · <strong className="text-slate-900">{tasks.reduce((s, t) => s + Number(t.hours_spent), 0).toFixed(2)}</strong> hours
                </span>
                <button onClick={() => downloadCsv(`drilldown-${from}_to_${to}.csv`, tasksToCsvRows(tasks))} className="btn-primary">
                  <Download size={14} /> Download CSV
                </button>
              </div>
            </div>
          </div>

          {/* Summary tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryTile label="Tasks" value={tasks.length} />
            <SummaryTile label="Total Hours" value={Number(tasks.reduce((s, t) => s + Number(t.hours_spent), 0).toFixed(2))} />
            <SummaryTile label="Employees" value={new Set(tasks.map((t) => t.employee_id)).size} />
            <SummaryTile label="Projects" value={new Set(tasks.map((t) => t.project_id)).size} />
          </div>

          {/* Tasks table */}
          <div className="card p-5">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-th">Date</th>
                    <th className="table-th">Employee</th>
                    <th className="table-th">Client</th>
                    <th className="table-th">Project</th>
                    <th className="table-th">Activity</th>
                    <th className="table-th">Task</th>
                    <th className="table-th text-right">Hours</th>
                    <th className="table-th">Time</th>
                    <th className="table-th">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id}>
                      <td className="table-td tabular-nums whitespace-nowrap">{t.task_date}</td>
                      <td className="table-td">
                        <div className="font-medium text-slate-900">{t.employee_name}</div>
                        <div className="text-xs text-slate-500">{t.employee_email}</div>
                      </td>
                      <td className="table-td">{t.client_name}</td>
                      <td className="table-td">{t.project_name}</td>
                      <td className="table-td"><span className="pill-brand">{t.activity_name}</span></td>
                      <td className="table-td max-w-[280px]">
                        <div className="font-medium text-slate-900 truncate" title={t.task_title}>{t.task_title}</div>
                        {t.description && <div className="text-xs text-slate-500 line-clamp-2" title={t.description}>{t.description}</div>}
                      </td>
                      <td className="table-td text-right tabular-nums font-semibold">{Number(t.hours_spent).toFixed(2)}</td>
                      <td className="table-td whitespace-nowrap text-xs">{t.start_time || '—'} → {t.end_time || '—'}</td>
                      <td className="table-td text-xs text-slate-500">{t.ip_address || '—'}</td>
                    </tr>
                  ))}
                  {tasks.length === 0 && (
                    <tr><td colSpan={9} className="table-td text-center text-slate-400 py-10">No tasks match these filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// --------- helpers ---------

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function timeSlot(start?: string, end?: string) {
  if (!start && !end) return '';
  return `${start || '—'} → ${end || '—'}`;
}

function durationMinutes(start?: string, end?: string) {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function tasksToCsvRows(tasks: DailyTask[]) {
  return tasks.map((t) => ({
    'Date':            t.task_date,
    'Employee Code':   t.employee_code || '',
    'Employee Name':   t.employee_name || '',
    'Email':           t.employee_email || '',
    'Department':      t.department_name || '',
    'Client':          t.client_name || '',
    'Project Code':    t.project_code || '',
    'Project':         t.project_name || '',
    'Activity':        t.activity_name || '',
    'Task Title':      t.task_title,
    'Description':     t.description || '',
    'Start Time':      t.start_time || '',
    'End Time':        t.end_time || '',
    'Time Slot':       timeSlot(t.start_time, t.end_time),
    'Duration':        durationMinutes(t.start_time, t.end_time),
    'Hours Logged':    Number(t.hours_spent).toFixed(2),
    'Status':          t.submission_status,
    'Remarks':         t.remarks || '',
    'IP Address':      t.ip_address || '',
    'Submitted At':    t.created_at || '',
  }));
}

function downloadCsv(filename: string, rows: Record<string, any>[]) {
  if (!rows || rows.length === 0) { alert('Nothing to export'); return; }
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// --------- aggregate tables (daily/weekly/monthly) ---------

function DailyTable({ type, data }: { type: DailyType; data: any }) {
  if (!Array.isArray(data)) return <p className="text-slate-400 text-sm">Loading…</p>;
  if (data.length === 0) return <p className="text-slate-400 text-sm">No data.</p>;
  const cols: Record<DailyType, { header: string[]; row: (r: any) => any[] }> = {
    employee: { header: ['Employee', 'Email', 'Tasks', 'Total Hours'],
                row: (r) => [r.employee_name, r.employee_email, r.task_count, Number(r.total_hours).toFixed(2)] },
    client:   { header: ['Client', 'Tasks', 'Total Hours'],
                row: (r) => [r.client_name, r.task_count, Number(r.total_hours).toFixed(2)] },
    project:  { header: ['Project', 'Tasks', 'Total Hours'],
                row: (r) => [r.project_name, r.task_count, Number(r.total_hours).toFixed(2)] },
    activity: { header: ['Activity', 'Tasks', 'Total Hours'],
                row: (r) => [r.activity_name, r.task_count, Number(r.total_hours).toFixed(2)] },
    pending:  { header: ['Code', 'Name', 'Email', 'Department'],
                row: (r) => [r.employee_code, r.name, r.email, r.department_name] },
  };
  return (
    <table className="w-full">
      <thead><tr>{cols[type].header.map((h) => <th key={h} className="table-th">{h}</th>)}</tr></thead>
      <tbody>
        {data.map((r: any, i: number) => (
          <tr key={i}>{cols[type].row(r).map((v, j) => <td key={j} className="table-td">{v}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

function RangeTables({ data }: { data: any }) {
  if (!data) return <p className="text-slate-400 text-sm">Loading…</p>;
  return (
    <div className="space-y-6">
      <Section title="Employees"  rows={data.employees}  cols={['employee_name', 'task_count', 'total_hours']} headers={['Employee', 'Tasks', 'Hours']} />
      <Section title="Clients"    rows={data.clients}    cols={['client_name', 'task_count', 'total_hours']}    headers={['Client', 'Tasks', 'Hours']} />
      <Section title="Projects"   rows={data.projects}   cols={['project_name', 'task_count', 'total_hours']}   headers={['Project', 'Tasks', 'Hours']} />
      <Section title="Activities" rows={data.activities} cols={['activity_name', 'task_count', 'total_hours']}  headers={['Activity', 'Tasks', 'Hours']} />
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
              {cols.map((c) => <td key={c} className="table-td">{c === 'total_hours' ? Number(r[c]).toFixed(2) : r[c]}</td>)}
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
