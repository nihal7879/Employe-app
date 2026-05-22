import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { PieChart as PieIcon } from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { api } from '../lib/api';
import type { DailyTask } from '../types';
import DatePicker from './ui/DatePicker';

const COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#A78BFA', '#84CC16', '#F97316', '#14B8A6'];
const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid rgba(15,23,42,0.10)',
  boxShadow: '0 12px 32px rgba(15,23,42,0.10)',
  background: '#fff',
  fontSize: 12,
};

const ymd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};
const todayStr = () => ymd(new Date());
const monthStartStr = () => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth(), 1)); };

export default function EmployeeActivityCharts() {
  const [mode, setMode] = useState<'month' | 'range'>('month');
  const [month, setMonth] = useState(todayStr());
  const [from, setFrom] = useState(monthStartStr());
  const [to, setTo] = useState(todayStr());
  const [tasks, setTasks] = useState<DailyTask[]>([]);

  const range = useMemo(() => {
    if (mode === 'range') return { from, to };
    const d = new Date(month + 'T00:00:00');
    return {
      from: ymd(new Date(d.getFullYear(), d.getMonth(), 1)),
      to: ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
    };
  }, [mode, month, from, to]);

  useEffect(() => {
    api.get('/daily-tasks', { params: { from: range.from, to: range.to } })
      .then((r) => setTasks(r.data || []))
      .catch(() => setTasks([]));
  }, [range.from, range.to]);

  const byProject = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of tasks) { const p = t.project_name || '—'; m[p] = (m[p] || 0) + Number(t.hours_spent || 0); }
    return Object.entries(m).map(([name, hours]) => ({ name, hours })).sort((a, b) => b.hours - a.hours);
  }, [tasks]);
  const byActivity = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of tasks) { const a = t.activity_name || 'Other'; m[a] = (m[a] || 0) + Number(t.hours_spent || 0); }
    return Object.entries(m).map(([name, hours]) => ({ name, hours })).sort((a, b) => b.hours - a.hours);
  }, [tasks]);

  const projectColors = useMemo(() => {
    const m: Record<string, string> = {};
    byProject.forEach((p, i) => { m[p.name] = COLORS[i % COLORS.length]; });
    return m;
  }, [byProject]);
  const activityColors = useMemo(() => {
    const m: Record<string, string> = {};
    byActivity.forEach((a, i) => { m[a.name] = COLORS[(i + 3) % COLORS.length]; });
    return m;
  }, [byActivity]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5 md:p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-brand-500/15 text-brand-500 flex items-center justify-center">
            <PieIcon size={18} />
          </div>
          <div>
            <h2 className="font-semibold text-lg leading-tight">Activity overview</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Your hours by activity and project</p>
          </div>
        </div>

        <div className="lg:ml-auto flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-white/[0.06] p-0.5">
            {(['month', 'range'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setMode(v)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  mode === v
                    ? 'bg-white dark:bg-white/[0.12] text-brand-700 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {v === 'month' ? 'Monthly' : 'Custom'}
              </button>
            ))}
          </div>
          {mode === 'range' ? (
            <div className="flex items-center gap-2">
              <div className="w-40"><DatePicker value={from} onChange={setFrom} clearable={false} /></div>
              <span className="text-slate-400 text-sm">→</span>
              <div className="w-40"><DatePicker value={to} onChange={setTo} clearable={false} /></div>
            </div>
          ) : (
            <div className="w-44"><DatePicker value={month} onChange={setMonth} clearable={false} /></div>
          )}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="text-center text-sm text-slate-400 py-12">No tasks logged in this period.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Hours by activity — pie */}
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Hours by activity</div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={byActivity} dataKey="hours" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2} stroke="transparent">
                  {byActivity.map((a) => <Cell key={a.name} fill={activityColors[a.name]} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any, n: any) => [`${Number(v).toFixed(2)} h`, n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Hours by project — bar */}
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Hours by project</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byProject} layout="vertical" margin={{ left: 8, right: 16, top: 4 }}>
                <CartesianGrid stroke="rgba(15,23,42,0.06)" horizontal={false} />
                <XAxis type="number" stroke="#94A3B8" tick={{ fontSize: 11 }} unit="h" />
                <YAxis type="category" dataKey="name" stroke="#94A3B8" tick={{ fontSize: 11 }} width={110} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(124,58,237,0.06)' }} formatter={(v: any) => `${Number(v).toFixed(2)} h`} />
                <Bar dataKey="hours" radius={[0, 6, 6, 0]}>
                  {byProject.map((p) => <Cell key={p.name} fill={projectColors[p.name]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </motion.div>
  );
}
