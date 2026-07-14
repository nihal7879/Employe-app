import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Filter as FilterIcon, Activity as ActIcon, FolderKanban, Users, Briefcase, SlidersHorizontal, Check, ArrowUpNarrowWide, ArrowDownWideNarrow } from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { api } from '../lib/api';
import type { Activity, Client, DailyTask, Employee, Project } from '../types';
import Select from '../components/Select';
import MultiSelect from '../components/MultiSelect';
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
  // Each filter holds a list of selected ids (multi-select). Empty = "All".
  const [filters, setFilters] = useState<{ employee_id: string[]; client_id: string[]; project_id: string[]; activity_id: string[] }>(
    { employee_id: [], client_id: [], project_id: [], activity_id: [] },
  );
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [viewTask, setViewTask] = useState<DailyTask | null>(null);
  // Chronological sort direction for the drilldown table + CSV. 'asc' = oldest
  // first (1 → 30, and within a day 9am → 6pm); 'desc' = newest first.
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Break entries (imported "Lunch"/"Break" rows, is_break=true) are NOT listed
  // as individual task rows in the drilldown — their time is rolled up into a
  // single "Break" total instead. Everything else counts as work.
  // Sorted by date, then by start time within the day — so the order is truly
  // chronological regardless of the order tasks were entered/created.
  const workTasks = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return tasks
      .filter((t) => !t.is_break)
      .slice()
      .sort((a, b) => {
        const d = (a.task_date || '').localeCompare(b.task_date || '');
        if (d !== 0) return d * dir;
        const sa = toMinOfDay(a.start_time), sb = toMinOfDay(b.start_time);
        if (sa == null && sb == null) return 0;
        if (sa == null) return 1;   // untimed tasks sort last, both directions
        if (sb == null) return -1;
        return (sa - sb) * dir;
      });
  }, [tasks, sortDir]);
  const workHours = useMemo(() => workTasks.reduce((s, t) => s + Number(t.hours_spent || 0), 0), [workTasks]);
  // Includes idle gaps between tasks (same definition as the employee day view),
  // not just explicit "Lunch"/"Break" rows.
  const breakHours = useMemo(() => totalBreakHours(tasks), [tasks]);

  // Drilldown column visibility (admin can show/hide columns; persisted locally).
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem(DRILL_COLS_KEY); if (s) return new Set(JSON.parse(s) as string[]); } catch { /* noop */ }
    return new Set(DRILL_COLUMNS.filter((c) => c.defaultOn).map((c) => c.key));
  });
  useEffect(() => { try { localStorage.setItem(DRILL_COLS_KEY, JSON.stringify([...visibleCols])); } catch { /* noop */ } }, [visibleCols]);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const shownCols = DRILL_COLUMNS.filter((c) => visibleCols.has(c.key));
  const toggleCol = (k: string) => setVisibleCols((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  // Day view state — empty list = aggregate across every employee (default).
  // Multiple ids show each selected employee's day. Deep-linkable via
  // ?employee=<id> (e.g. from the Present-today page).
  const [dayEmployees, setDayEmployees] = useState<string[]>(() => {
    const p = params.get('employee');
    return p ? [p] : [];
  });

  useEffect(() => {
    if (tab !== 'drilldown' && tab !== 'day-view') return;
    Promise.all([
      api.get('/employees'), api.get('/clients'), api.get('/projects'), api.get('/activities'),
    ]).then(([e, c, p, a]) => {
      setEmployees(e.data); setClients(c.data); setProjects(p.data); setActivities(a.data);
    }).catch(() => {});
    // eslint-disable-next-line
  }, [tab]);

  const filteredProjects = useMemo(() => {
    if (!filters.client_id.length) return projects;
    const sel = new Set(filters.client_id.map(Number));
    return projects.filter((p) => sel.has(p.client_id));
  }, [projects, filters.client_id]);

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
          employee_id: filters.employee_id.join(',') || undefined,
          client_id:   filters.client_id.join(',')   || undefined,
          project_id:  filters.project_id.join(',')  || undefined,
          activity_id: filters.activity_id.join(',') || undefined,
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
              <div className="w-full sm:w-44">
                <label className="label">Date</label>
                <DatePicker value={date} onChange={setDate} clearable={false} />
              </div>
              <div className="w-full sm:w-56">
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
              <button onClick={() => downloadCsv(`daily-${dailyType}-${date}.csv`, data || [])} className="btn-secondary w-full sm:w-auto sm:ml-auto">
                <Download size={14} /> Download CSV
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3 items-end mb-4">
              <div className="w-[calc(50%-0.375rem)] sm:w-44">
                <label className="label">From</label>
                <DatePicker value={from} onChange={setFrom} clearable={false} />
              </div>
              <div className="w-[calc(50%-0.375rem)] sm:w-44">
                <label className="label">To</label>
                <DatePicker value={to} onChange={setTo} clearable={false} />
              </div>
              <div className="w-full sm:w-56">
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
                className="btn-secondary w-full sm:w-auto sm:ml-auto"
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
                setDayEmployees([String(empId)]);
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
                <MultiSelect
                  value={filters.employee_id}
                  onChange={(v) => setFilters({ ...filters, employee_id: v })}
                  placeholder="All employees"
                  searchable searchPlaceholder="Search employees…"
                  options={employees.map((x) => ({ label: x.name, value: String(x.id) }))}
                />
              </div>
              <div>
                <label className="label">Client</label>
                <MultiSelect
                  value={filters.client_id}
                  onChange={(v) => setFilters({ ...filters, client_id: v, project_id: [] })}
                  placeholder="All clients"
                  searchable searchPlaceholder="Search clients…"
                  options={clients.map((x) => ({ label: x.client_name, value: String(x.id) }))}
                />
              </div>
              <div>
                <label className="label">Project</label>
                <MultiSelect
                  value={filters.project_id}
                  onChange={(v) => setFilters({ ...filters, project_id: v })}
                  placeholder="All projects"
                  searchable searchPlaceholder="Search projects…"
                  options={filteredProjects.map((x) => ({ label: x.project_name, value: String(x.id) }))}
                />
              </div>
              <div>
                <label className="label">Activity</label>
                <MultiSelect
                  value={filters.activity_id}
                  onChange={(v) => setFilters({ ...filters, activity_id: v })}
                  placeholder="All activities"
                  searchable searchPlaceholder="Search activities…"
                  options={activities.map((x) => ({ label: x.activity_name, value: String(x.id) }))}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end">
              <button onClick={() => setFilters({ employee_id: [], client_id: [], project_id: [], activity_id: [] })} className="btn-ghost">
                Clear filters
              </button>
            </div>
          </div>

          {/* Summary tiles */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SummaryTile icon={<FolderKanban size={16} className="text-brand-600 dark:text-brand-300" />} label="Tasks" value={workTasks.length} accent="brand" />
            <SummaryTile icon={<ActIcon size={16} className="text-emerald-600 dark:text-emerald-300" />} label="Total Hours" value={fmtHr(workHours)} accent="ok" />
            <SummaryTile icon={<ActIcon size={16} className="text-amber-600 dark:text-amber-300" />} label="Break Hours" value={fmtHr(breakHours)} accent="amber" />
            <SummaryTile icon={<Users size={16} className="text-cyan-600 dark:text-cyan-300" />} label="Employees" value={new Set(workTasks.map((t) => t.employee_id)).size} accent="cyan" />
            <SummaryTile icon={<Briefcase size={16} className="text-pink-600 dark:text-pink-300" />} label="Projects" value={new Set(workTasks.map((t) => t.project_id)).size} accent="pink" />
          </div>

          {/* Charts for filtered data */}
          {tasks.length > 0 && <DrilldownCharts tasks={tasks} />}

          {/* Tasks table — columns driven by the chooser; scrolls horizontally */}
          <div className="card p-5">
            {/* Table toolbar (upper right): sort + column chooser + download */}
            <div className="flex items-center justify-end gap-3 mb-4">
              <button
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                className="btn-ghost"
                title="Toggle date/time order"
              >
                {sortDir === 'asc'
                  ? <><ArrowUpNarrowWide size={14} /> Oldest first</>
                  : <><ArrowDownWideNarrow size={14} /> Newest first</>}
              </button>
              <div className="relative">
                <button onClick={() => setColMenuOpen((o) => !o)} className="btn-ghost" title="Show / hide columns">
                  <SlidersHorizontal size={14} /> Columns
                </button>
                {colMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setColMenuOpen(false)} />
                    <div className="absolute right-0 mt-1 z-20 w-56 max-h-80 overflow-y-auto thin-scrollbar rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-lg p-2">
                      <div className="flex items-center justify-between px-2 py-1 text-xs text-slate-500">
                        <button className="hover:text-brand-600" onClick={() => setVisibleCols(new Set(DRILL_COLUMNS.map((c) => c.key)))}>Show all</button>
                        <button className="hover:text-brand-600" onClick={() => setVisibleCols(new Set(DRILL_COLUMNS.filter((c) => c.defaultOn).map((c) => c.key)))}>Default</button>
                      </div>
                      {DRILL_COLUMNS.map((c) => (
                        <button
                          key={c.key}
                          onClick={() => toggleCol(c.key)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.04] text-left"
                        >
                          <span className={`h-4 w-4 flex items-center justify-center rounded border ${visibleCols.has(c.key) ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-300 dark:border-white/20'}`}>
                            {visibleCols.has(c.key) && <Check size={12} />}
                          </span>
                          <span className="text-slate-700 dark:text-slate-200">{c.label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={() => downloadCsv(
                  `drilldown-${from}_to_${to}.csv`,
                  workTasks.map((t) => {
                    const row: Record<string, string> = {};
                    for (const c of shownCols) {
                      // In the CSV, split Task into separate Task + Description columns.
                      if (c.key === 'task') { row['Task'] = t.task_title || ''; row['Description'] = t.description || ''; }
                      else row[c.label] = c.text(t);
                    }
                    return row;
                  }),
                )}
                className="btn-primary"
              >
                <Download size={14} /> Download CSV
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead>
                  <tr>
                    {shownCols.map((c) => (
                      <th key={c.key} className={`table-th ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workTasks.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setViewTask(t)}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                    >
                      {shownCols.map((c) => (
                        <td key={c.key} className={`table-td ${c.align === 'right' ? 'text-right' : ''} ${c.tdClass || ''}`}>{c.cell(t)}</td>
                      ))}
                    </tr>
                  ))}
                  {workTasks.length === 0 && (
                    <tr><td colSpan={shownCols.length || 1} className="table-td text-center text-slate-400 py-10">No tasks match these filters.</td></tr>
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
          employeeIds={dayEmployees}
          setEmployeeIds={setDayEmployees}
          initialDate={date}
        />
      )}
    </div>
  );
}

function EmployeeDayView({
  employees, employeeIds, setEmployeeIds, initialDate,
}: {
  employees: Employee[];
  employeeIds: string[];
  setEmployeeIds: (s: string[]) => void;
  initialDate?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <FilterIcon size={16} className="text-brand-600" /> Pick employees
        </div>
        <div className="max-w-sm">
          <label className="label">Employee</label>
          <MultiSelect
            value={employeeIds}
            options={employees.map((e) => ({ label: e.name, value: String(e.id) }))}
            onChange={setEmployeeIds}
            placeholder="All employees"
            searchable
            searchPlaceholder="Type to search employee…"
          />
        </div>
      </div>

      <MyTimeTracker employeeId={employeeIds.join(',') || undefined} adminView initialDate={initialDate} />
    </div>
  );
}

// --------- helpers ---------

const ACCENT_CLASSES: Record<string, string> = {
  brand: 'bg-brand-50 dark:bg-brand-500/15',
  ok: 'bg-emerald-50 dark:bg-emerald-500/15',
  cyan: 'bg-cyan-50 dark:bg-cyan-500/15',
  pink: 'bg-pink-50 dark:bg-pink-500/15',
  amber: 'bg-amber-50 dark:bg-amber-500/15',
};

function SummaryTile({ icon, label, value, accent = 'brand' }: { icon?: React.ReactNode; label: string; value: number | string; accent?: string }) {
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
            <Field label="Duration" value={fmtDuration(Number(task.hours_spent), task.start_time, task.end_time)} />
            <Field label="Time" value={`${fmtTime12(task.start_time)} - ${fmtTime12(task.end_time)}`} />
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
      <ResponsiveContainer width="100%" height={Math.max(80, Math.min(480, data.length * 34 + 30))}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12 }}>
          <CartesianGrid stroke="rgba(15,23,42,0.06)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94A3B8" />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} stroke="#94A3B8" width={100} interval={0} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(124,58,237,0.06)' }} formatter={(v: any) => fmtHr(Number(v))} />
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
  // Drop groups with no logged hours — they render as a label with no bar.
  return Object.values(m)
    .filter((g) => g.hours > 0)
    .sort((a, b) => b.hours - a.hours);
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

// Render a duration as "2:45:00" (H:MM:SS) instead of the misleading decimal
// hours (2.17). Prefer the exact start→end span so it matches the Time column;
// fall back to the stored decimal hours when a time is missing.
function fmtDuration(hours?: number, start?: string, end?: string) {
  const toSec = (t?: string) => {
    const m = t?.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0) : null;
  };
  let secs: number | null = null;
  const s = toSec(start), e = toSec(end);
  if (s != null && e != null) { secs = e - s; if (secs < 0) secs += 86400; }
  else if (Number.isFinite(hours)) secs = Math.round(Number(hours) * 3600);
  if (secs == null) return '—';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), sec = secs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h}:${pad(m)}:${pad(sec)}`;
}

// Drilldown table columns. `defaultOn` controls what an admin sees by default;
// the rest (Assigned By, IP, GPS, Device, Browser, …) are hidden until toggled
// on via the Columns chooser. The full set makes the table wide → it scrolls
// horizontally inside its overflow-x-auto wrapper.
type DrillCol = {
  key: string; label: string; defaultOn: boolean; align?: 'right';
  cell: (t: DailyTask) => React.ReactNode;        // table rendering
  text: (t: DailyTask) => string;                  // CSV / plain value
  tdClass?: string;
};
const DRILL_COLUMNS: DrillCol[] = [
  { key: 'date', label: 'Date', defaultOn: true, text: (t) => t.task_date || '', cell: (t) => <span className="tabular-nums whitespace-nowrap">{t.task_date}</span> },
  { key: 'employee', label: 'Employee', defaultOn: true, text: (t) => t.employee_name || '', cell: (t) => (<><div className="font-medium text-slate-900">{t.employee_name}</div><div className="text-xs text-slate-500">{t.employee_email}</div></>) },
  { key: 'department', label: 'Department', defaultOn: false, text: (t) => t.department_name || '', cell: (t) => t.department_name || '—' },
  { key: 'client', label: 'Client', defaultOn: true, text: (t) => t.client_name || '', cell: (t) => t.client_name || '—' },
  { key: 'project', label: 'Project', defaultOn: true, text: (t) => t.project_name || '', cell: (t) => t.project_name || '—' },
  { key: 'activity', label: 'Activity', defaultOn: true, text: (t) => t.activity_name || '', cell: (t) => (t.activity_name ? <span className="pill-brand">{t.activity_name}</span> : '—') },
  { key: 'task', label: 'Task', defaultOn: true, tdClass: 'max-w-[280px]', text: (t) => [t.task_title, t.description].filter(Boolean).join(' — '), cell: (t) => (<><div className="font-medium text-slate-900 truncate">{t.task_title}</div>{t.description && <div className="text-xs text-slate-500 line-clamp-2">{t.description}</div>}</>) },
  { key: 'assigned_by', label: 'Assigned By', defaultOn: false, text: (t) => t.assigned_by || '', cell: (t) => t.assigned_by || '—' },
  { key: 'reference', label: 'Reference', defaultOn: false, text: (t) => t.reference || '', cell: (t) => t.reference || '—' },
  { key: 'duration', label: 'Duration', defaultOn: true, align: 'right', text: (t) => fmtDuration(Number(t.hours_spent), t.start_time, t.end_time), cell: (t) => <span className="tabular-nums font-semibold">{fmtDuration(Number(t.hours_spent), t.start_time, t.end_time)}</span> },
  { key: 'time', label: 'Time', defaultOn: true, text: (t) => `${fmtTime12(t.start_time)} - ${fmtTime12(t.end_time)}`, cell: (t) => <span className="whitespace-nowrap text-xs">{fmtTime12(t.start_time)} - {fmtTime12(t.end_time)}</span> },
  { key: 'progress', label: 'Progress', defaultOn: false, text: (t) => t.progress_status || '', cell: (t) => t.progress_status || '—' },
  { key: 'ip', label: 'IP', defaultOn: false, text: (t) => t.ip_address || '', cell: (t) => <span className="text-xs text-slate-500">{t.ip_address || '—'}</span> },
  { key: 'gps', label: 'GPS', defaultOn: false, text: (t) => t.created_gps || '', cell: (t) => <span className="text-xs text-slate-500">{t.created_gps || '—'}</span> },
  { key: 'device', label: 'Device', defaultOn: false, text: (t) => t.created_device || '', cell: (t) => <span className="text-xs text-slate-500">{t.created_device || '—'}</span> },
  { key: 'browser', label: 'Browser', defaultOn: false, text: (t) => t.created_browser || '', cell: (t) => <span className="text-xs text-slate-500">{t.created_browser || '—'}</span> },
  { key: 'logged_at', label: 'Logged At', defaultOn: false, text: (t) => t.created_at || '', cell: (t) => <span className="text-xs text-slate-500 whitespace-nowrap">{t.created_at || '—'}</span> },
];
const DRILL_COLS_KEY = 'em_drilldown_cols';

const toMinOfDay = (t?: string) => { const m = t?.match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

// Hours only (rounded), e.g. 16.51 -> "17h". Used for all aggregate hour
// totals (drilldown tiles, distribution charts, daily/weekly/monthly tables).
function fmtHr(hours?: number) {
  const total = Math.round(Number(hours || 0) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// Total break hours, matching the employee day view: idle GAPS between work
// tasks PLUS explicit break rows. Computed per employee-day (so a gap never
// spans two days or two employees), then summed. This is why the drilldown
// previously showed 0 for days where the employee just left a gap for lunch
// instead of logging an explicit "Lunch" break row.
function totalBreakHours(tasks: DailyTask[]): number {
  const groups = new Map<string, DailyTask[]>();
  for (const t of tasks) {
    const k = `${t.employee_id}|${t.task_date}`;
    const arr = groups.get(k); if (arr) arr.push(t); else groups.set(k, [t]);
  }
  let mins = 0;
  for (const g of groups.values()) {
    const timed = g
      .map((t) => ({ t, s: toMinOfDay(t.start_time), e: toMinOfDay(t.end_time) }))
      .filter((x): x is { t: DailyTask; s: number; e: number } => x.s != null && x.e != null && x.e > x.s)
      .sort((a, b) => a.s - b.s);
    const work = timed.filter((x) => !x.t.is_break);
    const explicit = timed.filter((x) => !!x.t.is_break).map((x) => ({ s: x.s, e: x.e }));
    const gaps: { s: number; e: number }[] = [];
    if (work.length) {
      let cursor = work[0].s;
      for (const b of work) { if (b.s > cursor) gaps.push({ s: cursor, e: b.s }); cursor = Math.max(cursor, b.e); }
    }
    // Drop gaps already covered by an explicit break (avoid double-counting).
    const gapsOnly = gaps.filter((gp) => !explicit.some((e) => e.s >= gp.s && e.e <= gp.e));
    mins += [...gapsOnly, ...explicit].reduce((s, b) => s + (b.e - b.s), 0);
  }
  return mins / 60;
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
    'GPS':             t.created_gps || '',
    'Device':          t.created_device || '',
    'Browser':         t.created_browser || '',
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
                row: (r) => [r.employee_name, r.employee_email, r.task_count, fmtHr(Number(r.total_hours))] },
    client:   { header: ['Client', 'Tasks', 'Total Hours'],
                row: (r) => [r.client_name, r.task_count, fmtHr(Number(r.total_hours))] },
    project:  { header: ['Project', 'Tasks', 'Total Hours'],
                row: (r) => [r.project_name, r.task_count, fmtHr(Number(r.total_hours))] },
    activity: { header: ['Activity', 'Tasks', 'Total Hours'],
                row: (r) => [r.activity_name, r.task_count, fmtHr(Number(r.total_hours))] },
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
    <div className="overflow-x-auto -mx-5 px-5">
      <table className="w-full min-w-[480px]">
        <thead>
          <tr>{headers.map((h) => <th key={h} className={`table-th whitespace-nowrap ${numeric(h) ? 'text-right' : ''}`}>{h}</th>)}</tr>
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
                    className={`table-td ${numeric(headers[j]) ? 'text-right tabular-nums whitespace-nowrap' : ''} ${j === 0 ? 'font-medium text-slate-900 dark:text-white' : ''} ${isClickable && j === 0 ? 'text-brand-700 dark:text-brand-300 hover:underline' : ''}`}
                  >
                    {v}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
          <span className="font-semibold text-brand-600 dark:text-brand-400 tabular-nums">{fmtHr(totalHours)}</span>
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
                  {c === 'total_hours' ? fmtHr(Number(r[c])) : (r[c] ?? '') === '' ? emptyLabel : r[c]}
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
