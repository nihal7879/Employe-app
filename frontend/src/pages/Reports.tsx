import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Filter as FilterIcon, Activity as ActIcon, FolderKanban, Users, Briefcase } from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { api } from '../lib/api';
import type { Activity, Client, DailyTask, Employee, Project } from '../types';
import Select from '../components/Select';
import DatePicker from '../components/ui/DatePicker';
import MyTimeTracker from '../components/MyTimeTracker';
import Modal from '../components/Modal';

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid rgba(15,23,42,0.10)',
  boxShadow: '0 12px 32px rgba(15,23,42,0.10)',
  background: '#fff',
  fontSize: 12,
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStartStr = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

type Tab = 'daily' | 'weekly' | 'monthly' | 'drilldown' | 'day-view';
type DailyType = 'employee' | 'client' | 'project' | 'activity' | 'pending';
type RangeType = 'all' | 'employee' | 'client' | 'project' | 'activity' | 'assigned';
const DAILY_TYPES: DailyType[] = ['employee', 'client', 'project', 'activity', 'pending'];

export default function Reports() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(((params.get('tab') as Tab) || 'daily'));
  const [dailyType, setDailyType] = useState<DailyType>(
    DAILY_TYPES.includes(params.get('type') as DailyType) ? (params.get('type') as DailyType) : 'employee',
  );
  const [rangeType, setRangeType] = useState<RangeType>('all');
  // Daily-tab date is deep-linkable via ?date=YYYY-MM-DD (e.g. from the
  // dashboard's "Yesterday's submissions" card).
  const [date, setDate] = useState(
    /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? (params.get('date') as string) : todayStr(),
  );
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
  const [viewTask, setViewTask] = useState<DailyTask | null>(null);

  // Day view state — 'all' = aggregate across every employee (default).
  // Deep-linkable via ?employee=<id> (e.g. from the Present-today page).
  const [dayEmployee, setDayEmployee] = useState(params.get('employee') || 'all');

  useEffect(() => {
    if (tab !== 'drilldown' && tab !== 'day-view') return;
    Promise.all([
      api.get('/employees'), api.get('/clients'), api.get('/projects'), api.get('/activities'),
    ]).then(([e, c, p, a]) => {
      setEmployees(e.data); setClients(c.data); setProjects(p.data); setActivities(a.data);
    }).catch(() => {});
    // eslint-disable-next-line
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

      <div className="flex gap-1 border-b border-slate-200 dark:border-white/10 overflow-x-auto">
        {(['daily', 'weekly', 'monthly', 'drilldown', 'day-view'] as Tab[]).map((t) => (
          <button key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === t ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
            }`}>
            {t === 'drilldown' ? 'Drilldown' : t === 'day-view' ? 'Employee Day' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ============= AGGREGATE TABS ============= */}
      {tab !== 'drilldown' && tab !== 'day-view' && (
        <div className="card p-5">
          {tab === 'daily' ? (
            <div className="flex flex-wrap gap-3 items-end mb-4">
              <div className="w-44">
                <label className="label">Date</label>
                <DatePicker value={date} onChange={setDate} clearable={false} />
              </div>
              <div className="w-56">
                <label className="label">Report Type</label>
                <Select
                  value={dailyType}
                  onChange={(v) => setDailyType(v as DailyType)}
                  options={[
                    { label: 'Employee Productivity', value: 'employee' },
                    { label: 'Client Summary', value: 'client' },
                    { label: 'Project Summary', value: 'project' },
                    { label: 'Activity Summary', value: 'activity' },
                    { label: 'Pending Submissions', value: 'pending' },
                  ]}
                />
              </div>
              <button onClick={() => downloadCsv(`daily-${dailyType}-${date}.csv`, data || [])} className="btn-secondary ml-auto">
                <Download size={14} /> Download CSV
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3 items-end mb-4">
              <div className="w-44">
                <label className="label">From</label>
                <DatePicker value={from} onChange={setFrom} clearable={false} />
              </div>
              <div className="w-44">
                <label className="label">To</label>
                <DatePicker value={to} onChange={setTo} clearable={false} />
              </div>
              <div className="w-56">
                <label className="label">Report Type</label>
                <Select
                  value={rangeType}
                  onChange={(v) => setRangeType(v as RangeType)}
                  options={[
                    { label: 'All Sections', value: 'all' },
                    { label: 'Employees Only', value: 'employee' },
                    { label: 'Clients Only', value: 'client' },
                    { label: 'Projects Only', value: 'project' },
                    { label: 'Activities Only', value: 'activity' },
                    { label: 'Assigned By Only', value: 'assigned' },
                  ]}
                />
              </div>
              <button
                onClick={() => {
                  const keyMap: Record<RangeType, string> = {
                    all: 'employees', employee: 'employees', client: 'clients',
                    project: 'projects', activity: 'activities', assigned: 'assigned',
                  };
                  const rows = (data as any)?.[keyMap[rangeType]] || [];
                  downloadCsv(`${tab}-${rangeType}-${from}_to_${to}.csv`, rows);
                }}
                className="btn-secondary ml-auto"
              >
                <Download size={14} /> Download CSV
              </button>
            </div>
          )}

          {tab === 'daily' ? (
            <DailyTable
              type={dailyType}
              data={data}
              onOpenEmployeeDay={(empId) => {
                setDayEmployee(String(empId));
                setTab('day-view');
              }}
            />
          ) : <RangeTables data={data} only={rangeType} />}
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
                <DatePicker value={from} onChange={setFrom} clearable={false} />
              </div>
              <div>
                <label className="label">To</label>
                <DatePicker value={to} onChange={setTo} clearable={false} />
              </div>
              <div>
                <label className="label">Employee</label>
                <Select
                  value={filters.employee_id}
                  onChange={(v) => setFilters({ ...filters, employee_id: v })}
                  placeholder="All employees"
                  options={[{ label: 'All employees', value: '' }, ...employees.map((x) => ({ label: x.name, value: String(x.id) }))]}
                />
              </div>
              <div>
                <label className="label">Client</label>
                <Select
                  value={filters.client_id}
                  onChange={(v) => setFilters({ ...filters, client_id: v, project_id: '' })}
                  placeholder="All clients"
                  options={[{ label: 'All clients', value: '' }, ...clients.map((x) => ({ label: x.client_name, value: String(x.id) }))]}
                />
              </div>
              <div>
                <label className="label">Project</label>
                <Select
                  value={filters.project_id}
                  onChange={(v) => setFilters({ ...filters, project_id: v })}
                  placeholder="All projects"
                  options={[{ label: 'All projects', value: '' }, ...filteredProjects.map((x) => ({ label: x.project_name, value: String(x.id) }))]}
                />
              </div>
              <div>
                <label className="label">Activity</label>
                <Select
                  value={filters.activity_id}
                  onChange={(v) => setFilters({ ...filters, activity_id: v })}
                  placeholder="All activities"
                  options={[{ label: 'All activities', value: '' }, ...activities.map((x) => ({ label: x.activity_name, value: String(x.id) }))]}
                />
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
            <SummaryTile icon={<FolderKanban size={16} className="text-brand-600 dark:text-brand-300" />} label="Tasks" value={tasks.length} accent="brand" />
            <SummaryTile icon={<ActIcon size={16} className="text-emerald-600 dark:text-emerald-300" />} label="Total Hours" value={Number(tasks.reduce((s, t) => s + Number(t.hours_spent), 0).toFixed(2))} accent="ok" />
            <SummaryTile icon={<Users size={16} className="text-cyan-600 dark:text-cyan-300" />} label="Employees" value={new Set(tasks.map((t) => t.employee_id)).size} accent="cyan" />
            <SummaryTile icon={<Briefcase size={16} className="text-pink-600 dark:text-pink-300" />} label="Projects" value={new Set(tasks.map((t) => t.project_id)).size} accent="pink" />
          </div>

          {/* Charts for filtered data */}
          {tasks.length > 0 && <DrilldownCharts tasks={tasks} />}

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
                    <th className="table-th">Assigned By</th>
                    <th className="table-th text-right">Hours</th>
                    <th className="table-th">Time</th>
                    <th className="table-th">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setViewTask(t)}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                      title="Click to view full task details"
                    >
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
                      <td className="table-td">
                        {t.assigned_by ? (
                          <div className="font-medium text-slate-900">{t.assigned_by}</div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {t.reference && <div className="text-xs text-slate-500">Ref: {t.reference}</div>}
                      </td>
                      <td className="table-td text-right tabular-nums font-semibold">{Number(t.hours_spent).toFixed(2)}</td>
                      <td className="table-td whitespace-nowrap text-xs">{fmtTime12(t.start_time)} → {fmtTime12(t.end_time)}</td>
                      <td className="table-td text-xs text-slate-500">{t.ip_address || '—'}</td>
                    </tr>
                  ))}
                  {tasks.length === 0 && (
                    <tr><td colSpan={10} className="table-td text-center text-slate-400 py-10">No tasks match these filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <TaskDetailModal task={viewTask} onClose={() => setViewTask(null)} />
        </>
      )}

      {/* ============= EMPLOYEE DAY VIEW ============= */}
      {tab === 'day-view' && (
        <EmployeeDayView
          employees={employees}
          employeeId={dayEmployee}
          setEmployeeId={setDayEmployee}
        />
      )}
    </div>
  );
}

function EmployeeDayView({
  employees, employeeId, setEmployeeId,
}: {
  employees: Employee[];
  employeeId: string;
  setEmployeeId: (s: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <FilterIcon size={16} className="text-brand-600" /> Pick an employee
        </div>
        <div className="max-w-sm">
          <label className="label">Employee</label>
          <Select
            value={employeeId}
            options={[
              { label: 'All employees', value: 'all' },
              ...employees.map((e) => ({ label: e.name, value: String(e.id) })),
            ]}
            onChange={setEmployeeId}
            placeholder="Select employee"
            searchable
            searchPlaceholder="Type to search employee…"
          />
        </div>
      </div>

      <MyTimeTracker employeeId={employeeId === 'all' ? undefined : employeeId} adminView />
    </div>
  );
}

// --------- helpers ---------

const ACCENT_CLASSES: Record<string, string> = {
  brand: 'bg-brand-50 dark:bg-brand-500/15',
  ok: 'bg-emerald-50 dark:bg-emerald-500/15',
  cyan: 'bg-cyan-50 dark:bg-cyan-500/15',
  pink: 'bg-pink-50 dark:bg-pink-500/15',
};

function SummaryTile({ icon, label, value, accent = 'brand' }: { icon?: React.ReactNode; label: string; value: number; accent?: string }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      {icon && <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${ACCENT_CLASSES[accent] || ACCENT_CLASSES.brand}`}>{icon}</div>}
      <div>
        <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium">{label}</div>
        <div className="mt-0.5 text-2xl font-bold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function TaskDetailModal({ task, onClose }: { task: DailyTask | null; onClose: () => void }) {
  return (
    <Modal open={!!task} title="Task details" onClose={onClose} size="lg">
      {task && (
        <div className="space-y-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Task</div>
            <div className="font-semibold text-slate-900 dark:text-white whitespace-pre-wrap break-words">{task.task_title}</div>
          </div>
          {task.description && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Description</div>
              <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{task.description}</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-3 border-t border-slate-100 dark:border-white/10">
            <Field label="Date" value={task.task_date} />
            <Field label="Employee" value={task.employee_name} />
            <Field label="Client" value={task.client_name} />
            <Field label="Project" value={task.project_name} />
            <Field label="Activity" value={task.activity_name} />
            <Field label="Assigned By" value={task.assigned_by} />
            <Field label="Reference" value={task.reference} />
            <Field label="Hours" value={Number(task.hours_spent).toFixed(2)} />
            <Field label="Time" value={`${fmtTime12(task.start_time)} → ${fmtTime12(task.end_time)}`} />
            <Field label="Submission" value={task.submission_status} />
            <Field label="Progress" value={task.progress_status} />
            <Field label="IP Address" value={task.ip_address} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-sm text-slate-900 dark:text-white break-words">{value === 0 || value ? value : '—'}</div>
    </div>
  );
}

function DrilldownCharts({ tasks }: { tasks: DailyTask[] }) {
  const workTasks = useMemo(() => tasks.filter((t) => !t.is_break), [tasks]);
  const byActivity = useMemo(() => groupHours(workTasks, 'activity_name'), [workTasks]);
  const byProject  = useMemo(() => groupHours(workTasks, 'project_name'),  [workTasks]);
  const byClient   = useMemo(() => groupHours(workTasks, 'client_name'),   [workTasks]);
  const byEmployee = useMemo(() => groupHours(workTasks, 'employee_name'), [workTasks]);

  return (
    <div className="card p-5 md:p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="font-semibold text-lg">Distribution analytics</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Hours breakdown across activity, project, client, and employee</div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        <ChartBlock title="By Activity" data={byActivity} color="#F59E0B" />
        <ChartBlock title="By Project"  data={byProject}  color="#7C3AED" />
        <ChartBlock title="By Client"   data={byClient}   color="#06B6D4" />
        <ChartBlock title="By Employee" data={byEmployee} color="#10B981" />
      </div>
    </div>
  );
}

function ChartBlock({ title, data, color }: { title: string; data: { label: string; hours: number; count: number }[]; color: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-2">{title}</div>
      <ResponsiveContainer width="100%" height={Math.max(80, Math.min(220, data.length * 30 + 30))}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12 }}>
          <CartesianGrid stroke="rgba(15,23,42,0.06)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94A3B8" />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} stroke="#94A3B8" width={100} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(124,58,237,0.06)' }} formatter={(v: any) => `${Number(v).toFixed(2)}h`} />
          <Bar dataKey="hours" radius={[0, 6, 6, 0]} fill={color} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function groupHours(tasks: DailyTask[], field: keyof DailyTask) {
  const m: Record<string, { label: string; hours: number; count: number }> = {};
  for (const t of tasks) {
    const raw = (t as any)[field];
    if (!raw) continue; // skip rows with no label for this dimension
    const label = String(raw);
    if (!m[label]) m[label] = { label, hours: 0, count: 0 };
    m[label].hours += Number(t.hours_spent || 0);
    m[label].count += 1;
  }
  return Object.values(m).sort((a, b) => b.hours - a.hours);
}

function groupHoursByDate(tasks: DailyTask[]) {
  const m: Record<string, { date: string; hours: number; tasks: number }> = {};
  for (const t of tasks) {
    const d = t.task_date;
    if (!m[d]) m[d] = { date: d.slice(5), hours: 0, tasks: 0 };
    m[d].hours += Number(t.hours_spent || 0);
    m[d].tasks += 1;
  }
  return Object.values(m).sort((a, b) => a.date.localeCompare(b.date));
}

function fmtTime12(t?: string) {
  if (!t) return '—';
  const m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return t;
  const h = Number(m[1]);
  const min = m[2];
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${period}`;
}

function timeSlot(start?: string, end?: string) {
  if (!start && !end) return '';
  return `${fmtTime12(start)} → ${fmtTime12(end)}`;
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
    'Assigned By':     t.assigned_by || '',
    'Reference':       t.reference || '',
    'Start Time':      t.start_time || '',
    'End Time':        t.end_time || '',
    'Time Slot':       timeSlot(t.start_time, t.end_time),
    'Duration':        durationMinutes(t.start_time, t.end_time),
    'Hours Logged':    Number(t.hours_spent).toFixed(2),
    'Status':          t.submission_status,
    'Progress':        t.progress_status || '',
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

function DailyTable({
  type,
  data,
  onOpenEmployeeDay,
}: {
  type: DailyType;
  data: any;
  onOpenEmployeeDay?: (empId: string | number) => void;
}) {
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
  const numeric = (h: string) => ['Tasks', 'Total Hours', 'Hours'].includes(h);
  const headers = cols[type].header;
  const clickable = (r: any) =>
    !!onOpenEmployeeDay && (
      (type === 'employee' && r.employee_id != null) ||
      (type === 'pending'  && r.id != null)
    );
  const rowEmpId = (r: any) => (type === 'pending' ? r.id : r.employee_id);
  return (
    <table className="w-full">
      <thead>
        <tr>{headers.map((h) => <th key={h} className={`table-th ${numeric(h) ? 'text-right' : ''}`}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {data.map((r: any, i: number) => {
          const isClickable = clickable(r);
          return (
            <tr
              key={i}
              onClick={isClickable ? () => onOpenEmployeeDay!(rowEmpId(r)) : undefined}
              className={`hover:bg-slate-50 dark:hover:bg-white/[0.03] ${isClickable ? 'cursor-pointer' : ''}`}
              title={isClickable ? 'View this employee’s day' : undefined}
            >
              {cols[type].row(r).map((v, j) => (
                <td
                  key={j}
                  className={`table-td ${numeric(headers[j]) ? 'text-right tabular-nums' : ''} ${j === 0 ? 'font-medium text-slate-900 dark:text-white' : ''} ${isClickable && j === 0 ? 'text-brand-700 dark:text-brand-300 hover:underline' : ''}`}
                >
                  {v}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function RangeTables({ data, only = 'all' }: { data: any; only?: RangeType }) {
  if (!data) return <p className="text-slate-400 text-sm">Loading…</p>;
  const show = (k: Exclude<RangeType, 'all'>) => only === 'all' || only === k;
  return (
    <div className="space-y-6">
      {show('employee') && (
        <Section title="Employees"  rows={data.employees}  cols={['employee_name', 'task_count', 'total_hours']} headers={['Employee', 'Tasks', 'Hours']} />
      )}
      {show('client') && (
        <Section title="Clients"    rows={data.clients}    cols={['client_name', 'task_count', 'total_hours']}    headers={['Client', 'Tasks', 'Hours']} />
      )}
      {show('project') && (
        <Section title="Projects"   rows={data.projects}   cols={['project_name', 'task_count', 'total_hours']}   headers={['Project', 'Tasks', 'Hours']} />
      )}
      {show('activity') && (
        <Section title="Activities" rows={data.activities} cols={['activity_name', 'task_count', 'total_hours']}  headers={['Activity', 'Tasks', 'Hours']} />
      )}
      {show('assigned') && (
        <Section title="Assigned By" rows={data.assigned} cols={['assigned_by', 'task_count', 'total_hours']} headers={['Assigned By', 'Tasks', 'Hours']} emptyLabel="Unassigned" />
      )}
    </div>
  );
}

function Section({ title, rows, cols, headers, emptyLabel = '—' }: { title: string; rows: any[]; cols: string[]; headers: string[]; emptyLabel?: string }) {
  const list = rows || [];
  const totalTasks = list.reduce((s, r) => s + Number(r.task_count || 0), 0);
  const totalHours = list.reduce((s, r) => s + Number(r.total_hours || 0), 0);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/70 dark:bg-white/[0.03] border-b border-slate-100 dark:border-white/10">
        <h3 className="font-semibold text-sm text-slate-900 dark:text-white">{title}</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-500 dark:text-slate-400 tabular-nums">{totalTasks} tasks</span>
          <span className="font-semibold text-brand-600 dark:text-brand-400 tabular-nums">{totalHours.toFixed(2)} h</span>
        </div>
      </div>
      <table className="w-full table-fixed">
        <thead>
          <tr>{headers.map((h, i) => <th key={h} className={`table-th ${i > 0 ? 'text-right w-32' : ''}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {list.map((r: any, i: number) => (
            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.03]">
              {cols.map((c, j) => (
                <td
                  key={c}
                  className={`table-td ${j === 0 ? 'font-medium text-slate-900 dark:text-white truncate' : 'text-right tabular-nums'}`}
                  title={j === 0 ? String((r[c] ?? '') === '' ? emptyLabel : r[c]) : undefined}
                >
                  {c === 'total_hours' ? Number(r[c]).toFixed(2) : (r[c] ?? '') === '' ? emptyLabel : r[c]}
                </td>
              ))}
            </tr>
          ))}
          {list.length === 0 && (
            <tr><td colSpan={cols.length} className="table-td text-center text-slate-400 py-6">No data.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
