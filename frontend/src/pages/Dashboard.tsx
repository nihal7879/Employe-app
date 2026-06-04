import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Briefcase, Users, FolderKanban, AlertTriangle, Clock, CheckCircle2,
  TrendingUp, Activity as ActivityIcon, Flame, Layers, CalendarRange,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
  RadialBarChart, RadialBar,
} from 'recharts';
import StatCard from '../components/StatCard';
import SegmentedBar, { Segment } from '../components/SegmentedBar';
import AnimatedNumber from '../components/AnimatedNumber';
import EmployeeActivityCharts from '../components/EmployeeActivityCharts';
import { Skeleton } from '../components/Skeleton';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import type { DailyTask } from '../types';

// Module-level cache keyed by period so navigating away and back to the
// dashboard paints the last data instantly (stale-while-revalidate) instead of
// flashing empty cards while the API call is in flight.
const dashCache: Record<string, { admin: any; ySubmitted: number; yPendingList: any[]; yDate: string; yOverrides: number }> = {};

const COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#A78BFA', '#84CC16'];

// Decimal hours → "Xh Ym" (e.g. 3.7 → "3h 42m", 2 → "2h", 0.5 → "30m").
const fmtHrMin = (hours?: number) => {
  const total = Math.round(Number(hours || 0) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid rgba(15,23,42,0.10)',
  boxShadow: '0 12px 32px rgba(15,23,42,0.10)',
  background: '#fff',
  fontSize: 12,
};

// Styled tooltip for the compliance donut: colored dot + label + "<n> employees".
// Pinned to the top of the chart (see position prop) so it never covers the
// centered compliance %.
function ComplianceTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const value = Number(p.value) || 0;
  const color = p.payload?.fill || '#7C3AED';
  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-bg-deep shadow-xl px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{p.name}</span>
      </div>
      <div className="mt-1 text-base font-bold tabular-nums text-slate-900 dark:text-white leading-none">
        {value} <span className="text-xs font-medium text-slate-500 dark:text-slate-400">employee{value === 1 ? '' : 's'}</span>
      </div>
    </div>
  );
}

// Small styled hover tooltip (replaces ugly native `title=` popups). Renders
// above the wrapped element on hover; the parent must allow overflow.
function Tip({ text, children, className = '' }: { text: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={`relative group/tip block ${className}`}>
      {children}
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-40 hidden group-hover/tip:block whitespace-nowrap rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-[11px] font-medium px-2.5 py-1.5 shadow-lg">
        {text}
        <span className="absolute left-1/2 -translate-x-1/2 top-full -mt-px border-4 border-transparent border-t-slate-900 dark:border-t-slate-700" />
      </span>
    </span>
  );
}

// Yesterday's submission compliance donut + stats. The center % stays visible at
// all times; the slices are explained by the equal-height stat boxes below
// (which double as the legend), so there's no hover tooltip to overlap it.
function YesterdayComplianceCard({ submittedCount, pendingCount, overrides, yDate }: {
  submittedCount: number; pendingCount: number; overrides: number; yDate: string;
}) {
  const totalEmp = submittedCount + pendingCount;
  const pct = totalEmp > 0 ? Math.round((submittedCount / totalEmp) * 100) : 0;
  const data = [
    { name: 'Submitted', value: submittedCount, fill: '#10B981' },
    { name: 'Pending', value: pendingCount, fill: '#EF4444' },
    { name: 'Logged task before login', value: overrides, fill: '#F59E0B' },
  ].filter((d) => d.value > 0);
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <Link to={`/reports?tab=daily&type=employee&date=${yDate}`} className="group">
          <div className="font-semibold group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">Yesterday's submissions</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{submittedCount} of {totalEmp} submitted yesterday · view report →</div>
        </Link>
        <span className={pct >= 80 ? 'pill-ok' : pct >= 50 ? 'pill-warn' : 'pill-bad'}>{pct}%</span>
      </div>
      <div className="relative h-52 mx-auto w-full max-w-[200px]">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data.length ? data : [{ name: 'empty', value: 1, fill: 'rgba(15,23,42,0.06)' }]}
              dataKey="value" nameKey="name"
              innerRadius="80%" outerRadius="100%"
              paddingAngle={data.length > 1 ? 4 : 0}
              cornerRadius={8}
              stroke="transparent"
              startAngle={90}
              endAngle={-270}
            >
              {(data.length ? data : [{ fill: 'rgba(15,23,42,0.06)' }]).map((d: any, i: number) => (
                <Cell key={i} fill={d.fill} />
              ))}
            </Pie>
            {data.length > 0 && (
              <Tooltip
                content={<ComplianceTooltip />}
                position={{ y: -6 }}
                allowEscapeViewBox={{ x: false, y: true }}
                wrapperStyle={{ outline: 'none', zIndex: 50 }}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 font-semibold">Compliance</div>
          <div className="text-4xl font-bold tabular-nums leading-none mt-1">{pct}%</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">{submittedCount} / {totalEmp}</div>
        </div>
      </div>
      {/* Compliance stats — Submitted / Pending / Logged-before-login, equal height. */}
      <div className="mt-3 grid grid-cols-3 gap-2 items-stretch">
        <Tip text="View employee productivity report" className="h-full">
          <Link to={`/reports?tab=daily&type=employee&date=${yDate}`} className="h-full flex flex-col justify-between gap-1 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 px-3 py-2 transition-colors hover:bg-emerald-100 dark:hover:bg-emerald-500/15">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300 font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" /> Submitted
            </div>
            <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{submittedCount}</div>
          </Link>
        </Tip>
        <Tip text="View pending submissions" className="h-full">
          <Link to={`/reports?tab=daily&type=pending&date=${yDate}`} className="h-full flex flex-col justify-between gap-1 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 px-3 py-2 transition-colors hover:bg-rose-100 dark:hover:bg-rose-500/15">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-rose-700 dark:text-rose-300 font-semibold">
              <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" /> Pending
            </div>
            <div className="text-xl font-bold text-rose-700 dark:text-rose-300 tabular-nums">{pendingCount}</div>
          </Link>
        </Tip>
        <Tip text="Review tasks logged before login" className="h-full">
          <Link
            to={`/admin/login-mismatches?date=${yDate}`}
            className={`h-full flex flex-col justify-between gap-1 rounded-xl px-3 py-2 border transition-colors ${
              overrides > 0
                ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-500/15'
                : 'bg-slate-50 dark:bg-white/[0.04] border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/[0.08]'
            }`}
          >
            <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold ${overrides > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>
              <AlertTriangle size={11} className="shrink-0" /> Before login
            </div>
            <div className={`text-xl font-bold tabular-nums ${overrides > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>{overrides}</div>
          </Link>
        </Tip>
      </div>
    </>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [admin, setAdmin] = useState<any>(null);
  const [myToday, setMyToday] = useState<{ total_hours: number; tasks: DailyTask[] } | null>(null);
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'quarter' | 'year'>('today');
  // Yesterday's submission stats — fetched from /reports/daily so it works
  // independently of analytics restarts and reuses the proven query.
  const [ySubmitted, setYSubmitted] = useState(0);
  const [yPendingList, setYPendingList] = useState<any[]>([]);
  const [yDate, setYDate] = useState('');
  // Yesterday's count of employees who logged tasks before their login (override).
  const [yOverrides, setYOverrides] = useState(0);

  useEffect(() => {
    if (isAdmin) {
      // Paint cached data immediately (no flash); fall back to the skeleton only
      // when this period has never been loaded this session.
      const cached = dashCache[period];
      if (cached) {
        setAdmin(cached.admin);
        setYSubmitted(cached.ySubmitted);
        setYPendingList(cached.yPendingList);
        setYDate(cached.yDate);
        setYOverrides(cached.yOverrides);
      } else {
        setAdmin(null);
      }

      // Yesterday's submission stats from the proven /reports/daily endpoint.
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      setYDate(y);

      Promise.all([
        api.get('/analytics/dashboard', { params: { period } }),
        api.get('/reports/daily', { params: { type: 'pending',  date: y } }),
        api.get('/reports/daily', { params: { type: 'employee', date: y } }),
        api.get('/audit/login-mismatches', { params: { date: y } }),
      ])
        .then(([dash, pending, submitted, overrides]) => {
          const pendingList = Array.isArray(pending.data) ? pending.data : [];
          const submittedCount = Array.isArray(submitted.data) ? submitted.data.length : 0;
          const overrideCount = Array.isArray(overrides.data) ? overrides.data.length : 0;
          setAdmin(dash.data);
          setYPendingList(pendingList);
          setYSubmitted(submittedCount);
          setYOverrides(overrideCount);
          dashCache[period] = { admin: dash.data, ySubmitted: submittedCount, yPendingList: pendingList, yDate: y, yOverrides: overrideCount };
        })
        .catch(() => {});
    } else {
      api.get('/daily-tasks/my/today').then((r) => setMyToday(r.data)).catch(() => {});
    }
  }, [isAdmin, period]);

  const PERIODS: { key: typeof period; label: string }[] = [
    { key: 'today',   label: 'Today' },
    { key: 'week',    label: 'This Week' },
    { key: 'month',   label: 'This Month' },
    { key: 'quarter', label: 'This Quarter' },
    { key: 'year',    label: 'This Year' },
  ];

  const periodLabel = PERIODS.find((p) => p.key === period)?.label || 'This Month';
  const rangeFrom = admin?.range?.from;
  const rangeTo   = admin?.range?.to;

  const hoursToday = Number(myToday?.total_hours || 0);
  const productivityPct = Math.min(100, Math.round((hoursToday / 8) * 100));
  const teamHoursToday = Number(admin?.today?.hours || 0);
  const teamGoal = Number(admin?.counts?.active_employees || 0) * 8;
  const teamPct = teamGoal > 0 ? Math.min(100, Math.round((teamHoursToday / teamGoal) * 100)) : 0;

  // Project × activity segmented bars — built from the server-aggregated
  // project_activity rows (no raw-task fetch needed).
  const projectSegments = useMemo(() => {
    const byProject: Record<string, { project_name: string; tasks: number; total_hours: number; perActivity: Record<string, number> }> = {};
    for (const r of (admin?.project_activity || [])) {
      if (!r.project_name) continue;
      const key = r.project_name;
      const hrs = Number(r.total_hours || 0);
      if (!byProject[key]) byProject[key] = { project_name: key, tasks: 0, total_hours: 0, perActivity: {} };
      byProject[key].tasks += Number(r.tasks || 0);
      byProject[key].total_hours += hrs;
      const a = r.activity_name || 'Other';
      byProject[key].perActivity[a] = (byProject[key].perActivity[a] || 0) + hrs;
    }
    return Object.values(byProject).sort((a, b) => b.total_hours - a.total_hours).slice(0, 8);
  }, [admin]);

  const activityColorMap = useMemo(() => {
    const set = new Set<string>();
    projectSegments.forEach((p) => Object.keys(p.perActivity).forEach((a) => set.add(a)));
    const map: Record<string, string> = {};
    Array.from(set).forEach((a, i) => { map[a] = COLORS[i % COLORS.length]; });
    return map;
  }, [projectSegments]);

  const dailyTrend = (admin?.daily_trend || []).map((d: any) => ({
    date: short(d.task_date), hours: Number(d.hours || 0), tasks: Number(d.tasks || 0),
  }));

  return (
    <div className="space-y-6">
      {/* Hero greeting */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-6 md:p-8 relative">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-500/8 blur-3xl" />
          <div className="absolute -left-10 -bottom-10 h-56 w-56 rounded-full bg-cyan-500/8 blur-3xl" />
        </div>
        <div className="relative flex flex-col md:flex-row md:items-end gap-6">
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <h1 className="text-3xl md:text-4xl font-bold leading-tight">
              {greeting()}, <span className="text-grad">{user?.name?.split(' ')[0]}</span>
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              {isAdmin
                ? 'Here is what your team is shipping across the workspace.'
                : 'Let’s make your day count — log every hour and watch your streak grow.'}
            </p>

          </div>

          {isAdmin && (
            <div className="flex flex-col items-stretch md:items-end gap-2 shrink-0">
              <PeriodFilter period={period} setPeriod={setPeriod} options={PERIODS} />
              {rangeFrom && rangeTo && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/20 text-[11px] text-brand-700 dark:text-brand-300 self-end">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
                  Showing data for <strong className="font-semibold">{periodLabel.toLowerCase()}</strong> · {fmtDate(rangeFrom)} → {fmtDate(rangeTo)}
                </div>
              )}
            </div>
          )}
          {!isAdmin && (
            <div className="flex items-center gap-4">
              <div className="h-24 w-24">
                <ResponsiveContainer>
                  <RadialBarChart innerRadius="70%" outerRadius="100%" data={[{ v: productivityPct }]} startAngle={90} endAngle={-270}>
                    <RadialBar dataKey="v" cornerRadius={10} fill="url(#ring)" background={{ fill: 'rgba(15,23,42,0.06)' }} />
                    <defs>
                      <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#7C3AED" />
                        <stop offset="100%" stopColor="#06B6D4" />
                      </linearGradient>
                    </defs>
                  </RadialBarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider">Today</div>
                <div className="text-3xl font-bold tabular-nums">
                  <AnimatedNumber value={hoursToday} format={(n) => n.toFixed(2)} />
                  <span className="text-base text-slate-500 font-normal"> h</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Loading skeleton — shown on first load (and uncached period switches)
          so the dashboard never flashes empty cards before data arrives. */}
      {isAdmin && !admin && <DashboardSkeleton />}

      {/* Admin stat row — focused on TODAY */}
      {isAdmin && admin && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard to="/admin/today-present"     icon={<Users size={20} />}         label="Present Today"     value={Number(admin.counts.present_today || 0)}     accent="brand" />
          <StatCard to="/admin/today-clients"     icon={<Briefcase size={20} />}     label="Clients Active"    value={(admin.today_clients || []).length}          accent="pink"  />
          <StatCard to="/admin/today-projects"    icon={<FolderKanban size={20} />}  label="Projects Active"   value={(admin.today_projects || []).length}         accent="ok"    />
          <StatCard to="/reports"                 icon={<Clock size={20} />}         label="Hours Till Now"    value={Number(admin.today?.hours || 0)}             accent="cyan"  format={(n) => { const t = Math.round(n * 60), h = Math.floor(t / 60), m = t % 60; return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`; }} />
          <StatCard to="/admin/yesterday-pending" icon={<AlertTriangle size={20} />} label="Yesterday Pending" value={yPendingList.length}                         accent="bad"   />
        </div>
      )}

      {/* Submission compliance + Hours by weekday + Activity pie */}
      {isAdmin && admin && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Submission compliance — YESTERDAY's data (today is still in progress) */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
            <YesterdayComplianceCard submittedCount={ySubmitted} pendingCount={yPendingList.length} overrides={yOverrides} yDate={yDate} />
          </motion.div>

          {/* Hours by day of week */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5 lg:col-span-2">
            {(() => {
              const dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
              const buckets = Array(7).fill(0).map((_, i) => ({ day: dows[i], hours: 0, tasks: 0 }));
              for (const r of (admin?.hours_by_weekday || [])) {
                const idx = (Number(r.dow) + 5) % 7; // MySQL DAYOFWEEK 1=Sun → Monday=0
                buckets[idx].hours += Number(r.hours || 0);
                buckets[idx].tasks += Number(r.tasks || 0);
              }
              const topDay = [...buckets].sort((a, b) => b.hours - a.hours)[0];
              return (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="font-semibold">Hours by weekday</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {topDay?.hours > 0 ? <>Peak day: <strong>{topDay.day}</strong> — {fmtHrMin(topDay.hours)} this month</> : 'No data yet'}
                      </div>
                    </div>
                    <span className="pill-brand"><TrendingUp size={12} /> Month</span>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={buckets} margin={{ left: -10, right: 8, top: 8 }}>
                      <defs>
                        <linearGradient id="dow" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#7C3AED" />
                          <stop offset="100%" stopColor="#06B6D4" stopOpacity={0.6} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(15,23,42,0.06)" vertical={false} />
                      <XAxis dataKey="day" stroke="#94A3B8" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#94A3B8" tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(124,58,237,0.06)' }} formatter={(v: any) => fmtHrMin(Number(v))} />
                      <Bar dataKey="hours" radius={[8, 8, 0, 0]} fill="url(#dow)" />
                    </BarChart>
                  </ResponsiveContainer>
                </>
              );
            })()}
          </motion.div>
        </div>
      )}

      {/* Activity mix — horizontal bar leaderboard */}
      {isAdmin && admin && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5 md:p-6">
          {(() => {
            const acts = [...(admin.activity_distribution || [])]
              .map((a: any) => ({ ...a, total_hours: Number(a.total_hours || 0) }))
              .sort((a, b) => b.total_hours - a.total_hours);
            const total = acts.reduce((s, x) => s + x.total_hours, 0);
            const max = Math.max(...acts.map((a) => a.total_hours), 0);

            return (
              <>
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-5">
                  <div>
                    <h3 className="font-semibold text-lg">Activity composition</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Where the team's time is going this month — {fmtHrMin(total)} total across {acts.length} activit{acts.length === 1 ? 'y' : 'ies'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {acts.slice(0, 4).map((a, i) => (
                      <span
                        key={a.activity_name || 'Other'}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200"
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        {a.activity_name || 'Other'}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-white/[0.06]">
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4 px-1">
                    <span>Activity · share of total hours</span>
                    <span>Hours</span>
                  </div>

                  {acts.length === 0 ? (
                    <div className="text-sm text-slate-400 py-6 text-center">No activity data yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {acts.map((a, i) => {
                        const pct = total ? Math.round((a.total_hours / total) * 100) : 0;
                        const widthPct = max ? (a.total_hours / max) * 100 : 0;
                        const color = COLORS[i % COLORS.length];
                        return (
                          <div key={a.activity_name || 'Other'} className="flex items-center gap-4">
                            <div className="flex items-center gap-2 w-40 shrink-0">
                              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
                              <span className="text-sm font-medium text-slate-900 dark:text-white truncate">{a.activity_name || 'Other'}</span>
                            </div>
                            <div className="flex-1 h-3 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${widthPct}%` }}
                                transition={{ duration: 0.9, ease: 'easeOut', delay: i * 0.05 }}
                                className="h-full rounded-full"
                                style={{ background: `linear-gradient(90deg, ${color}, ${color}cc)` }}
                              />
                            </div>
                            <div className="w-24 text-right tabular-nums">
                              <span className="text-sm font-bold text-slate-900 dark:text-white">{fmtHrMin(a.total_hours)}</span>
                              <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">{pct}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </motion.div>
      )}

      {/* Top projects bar + top clients bar */}
      {isAdmin && admin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-semibold">Top projects</div>
                <div className="text-xs text-slate-500">Hours this month</div>
              </div>
              <span className="pill-brand"><Flame size={12} /> Live</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={admin.top_projects || []} margin={{ left: -10, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="barg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7C3AED" />
                    <stop offset="100%" stopColor="#A78BFA" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(15,23,42,0.06)" vertical={false} />
                <XAxis dataKey="project_name" stroke="#94A3B8" tick={{ fontSize: 11 }} />
                <YAxis stroke="#94A3B8" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(124,58,237,0.06)' }} formatter={(v: any) => [fmtHrMin(Number(v)), 'Hours']} />
                <Bar dataKey="total_hours" radius={[8, 8, 0, 0]} fill="url(#barg)" />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-semibold">Top clients</div>
                <div className="text-xs text-slate-500">Hours this month</div>
              </div>
              <span className="pill-cyan"><Briefcase size={12} /> Month</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={admin.top_clients || []} layout="vertical" margin={{ left: 30, right: 16, top: 8 }}>
                <defs>
                  <linearGradient id="cbar" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#06B6D4" />
                    <stop offset="100%" stopColor="#22D3EE" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(15,23,42,0.06)" horizontal={false} />
                <XAxis type="number" stroke="#94A3B8" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="client_name" stroke="#94A3B8" tick={{ fontSize: 11 }} width={100} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(6,182,212,0.06)' }} formatter={(v: any) => [fmtHrMin(Number(v)), 'Hours']} />
                <Bar dataKey="total_hours" radius={[0, 8, 8, 0]} fill="url(#cbar)" />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </div>
      )}

      {/* Project activity breakdown segmented bars */}
      {isAdmin && projectSegments.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5 md:p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-5">
            <div>
              <h3 className="font-semibold text-lg">Activity composition by project</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {projectSegments.length} project{projectSegments.length === 1 ? '' : 's'} — hours split by activity type
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(activityColorMap).slice(0, 6).map(([label, color]) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-white/[0.06]">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4 px-1">
              <span>Project · activity breakdown</span>
              <span>Hours</span>
            </div>

            <div className="space-y-6">
              {projectSegments.map((p) => {
                const segs: Segment[] = Object.entries(p.perActivity).map(([label, value]) => ({
                  label, value: Number(value), color: activityColorMap[label],
                }));
                return (
                  <div key={p.project_name}>
                    <div className="flex items-baseline justify-between mb-2 gap-3">
                      <div className="font-semibold text-slate-900 dark:text-white truncate">{p.project_name}</div>
                      <div className="text-sm tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                        <span className="font-bold text-slate-900 dark:text-white">{fmtHrMin(p.total_hours)}</span>
                        <span className="text-slate-400 dark:text-slate-500"> · {p.tasks} task{p.tasks === 1 ? '' : 's'}</span>
                      </div>
                    </div>
                    <SegmentedBar segments={segs} height={14} />
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                      {segs.map((s) => (
                        <span key={s.label} className="inline-flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                          <span className="font-semibold tabular-nums">{fmtHrMin(s.value)}</span>
                          <span className="text-slate-500 dark:text-slate-400">{s.label}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* Bottom row: top employees bar + client distribution pie */}
      {isAdmin && admin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                <Layers size={18} />
              </div>
              <div>
                <div className="font-semibold">Top employees</div>
                <div className="text-xs text-slate-500">Hours logged this month</div>
              </div>
              <span className="ml-auto pill-brand"><Users size={12} /> {admin?.top_employees?.length || 0}</span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={admin?.top_employees || []} layout="vertical" margin={{ left: 30, right: 16, top: 8 }}>
                <defs>
                  <linearGradient id="ebar" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#7C3AED" />
                    <stop offset="100%" stopColor="#A78BFA" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(15,23,42,0.06)" horizontal={false} />
                <XAxis type="number" stroke="#94A3B8" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" stroke="#94A3B8" tick={{ fontSize: 11 }} width={110} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(124,58,237,0.06)' }} formatter={(v: any) => [fmtHrMin(Number(v)), 'Hours']} />
                <Bar dataKey="total_hours" name="Hours" radius={[0, 8, 8, 0]} fill="url(#ebar)" />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center">
                <Briefcase size={18} />
              </div>
              <div>
                <div className="font-semibold">Hours by client</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Distribution · {periodLabel.toLowerCase()}</div>
              </div>
              <span className="ml-auto pill-cyan">{(admin?.top_clients || []).length}</span>
            </div>
            {(() => {
              const clientsSorted = [...(admin?.top_clients || [])]
                .map((c) => ({ ...c, total_hours: Number(c.total_hours) || 0 }))
                .filter((c) => c.total_hours > 0)
                .sort((a, b) => b.total_hours - a.total_hours);
              const total = clientsSorted.reduce((s, c) => s + Number(c.total_hours || 0), 0);
              const top = clientsSorted[0];
              if (clientsSorted.length === 0) {
                return <div className="text-center text-sm text-slate-400 py-12">No client hours logged yet.</div>;
              }
              return (
                <>
                  <div className="relative h-64">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={clientsSorted}
                          dataKey="total_hours"
                          nameKey="client_name"
                          innerRadius="62%"
                          outerRadius="84%"
                          paddingAngle={clientsSorted.length > 1 ? 4 : 0}
                          cornerRadius={clientsSorted.length > 1 ? 8 : 0}
                          startAngle={90}
                          endAngle={-270}
                          stroke="transparent"
                        >
                          {clientsSorted.map((_: any, i: number) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    {top && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 font-semibold">Top client</div>
                        <div className="text-base font-bold text-slate-900 dark:text-white truncate max-w-[110px] text-center mt-0.5">{top.client_name}</div>
                        <div className="text-2xl font-bold text-brand-600 dark:text-brand-300 tabular-nums leading-none mt-1">
                          {fmtHrMin(Number(top.total_hours))}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">{total ? Math.round((top.total_hours / total) * 100) : 0}% of total</div>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 space-y-1.5 max-h-32 overflow-y-auto thin-scrollbar pr-1">
                    {clientsSorted.map((c: any, i: number) => {
                      const pct = Math.round((Number(c.total_hours) / (total || 1)) * 100);
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs px-2 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.04]">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-white dark:ring-bg-deep" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{c.client_name}</span>
                          <span className="tabular-nums font-semibold text-slate-900 dark:text-white">{fmtHrMin(Number(c.total_hours))}</span>
                          <span className="tabular-nums text-slate-400 w-8 text-right">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </motion.div>

        </div>
      )}

      {/* Activity overview charts — employees only */}
      {!isAdmin && <EmployeeActivityCharts />}

      {/* My today — employees only (full breakdown lives on the My Activity page) */}
      {!isAdmin && myToday && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <Clock className="text-brand-600" size={20} />
            <h2 className="font-semibold">My tasks · today</h2>
            <span className="ml-auto text-xs text-slate-500">{myToday.tasks.length} logged</span>
            <a href="/my-activity" className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700">View my activity →</a>
          </div>
          {myToday.tasks.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex h-14 w-14 rounded-2xl bg-slate-50 dark:bg-white/[0.06] items-center justify-center mb-3">
                <CheckCircle2 size={24} className="text-slate-400" />
              </div>
              <p className="text-sm text-slate-500 mb-3">No tasks submitted yet today.</p>
              <a href="/tasks" className="btn-primary inline-flex">Log your first task</a>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-th">Project</th>
                    <th className="table-th">Activity</th>
                    <th className="table-th">Task</th>
                    <th className="table-th text-right">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {myToday.tasks.map((t) => (
                    <tr key={t.id}>
                      <td className="table-td font-medium text-slate-900 dark:text-white">{t.project_name}</td>
                      <td className="table-td"><span className="pill-brand">{t.activity_name}</span></td>
                      <td className="table-td">{t.task_title}</td>
                      <td className="table-td text-right tabular-nums font-semibold">{Number(t.hours_spent).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card p-4 space-y-3">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
      {/* Compliance pie + weekday bars */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 flex flex-col items-center justify-center gap-4 h-72">
          <Skeleton className="h-40 w-40 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="card p-5 lg:col-span-2 space-y-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-52 w-full" />
        </div>
      </div>
      {/* Two wide chart cards */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="card p-5 md:p-6 space-y-4">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-60 w-full" />
        </div>
      ))}
    </>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
function today() { return new Date().toISOString().slice(0, 10); }
function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function short(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function PeriodFilter<T extends string>({
  period, setPeriod, options,
}: {
  period: T;
  setPeriod: (p: T) => void;
  options: { key: T; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.key === period);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border transition-all
          ${open ? 'bg-white dark:bg-white/[0.08] border-brand-500 shadow-[0_0_0_3px_rgba(124,58,237,0.18)]'
                 : 'bg-white dark:bg-white/[0.04] border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'}`}
      >
        <CalendarRange size={15} className="text-brand-600 dark:text-brand-400" />
        <span className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">Period</span>
        <span className="text-sm font-semibold text-slate-900 dark:text-white">{current?.label || 'This Month'}</span>
        <ChevronDownIcon className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 z-[60] w-56 rounded-xl bg-white dark:bg-bg-deep border border-slate-200 dark:border-white/10 shadow-xl overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-slate-100 dark:border-white/10 text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
              Select Period
            </div>
            {options.map((o) => (
              <button
                key={o.key}
                onClick={() => { setPeriod(o.key); setOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-sm transition-colors ${
                  o.key === period
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300 font-semibold'
                    : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/[0.05]'
                }`}
              >
                <span>{o.label}</span>
                {o.key === period && <CheckIcon className="text-brand-600 dark:text-brand-400" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChevronDownIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
