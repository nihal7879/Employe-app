import { useEffect, useState } from 'react';
import { Briefcase, Users, FolderKanban, AlertTriangle, Clock } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import StatCard from '../components/StatCard';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import type { DailyTask } from '../types';

const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#84cc16', '#f43f5e'];

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [admin, setAdmin] = useState<any>(null);
  const [myToday, setMyToday] = useState<{ total_hours: number; tasks: DailyTask[] } | null>(null);

  useEffect(() => {
    if (isAdmin) {
      api.get('/analytics/dashboard').then((r) => setAdmin(r.data)).catch(() => {});
    }
    api.get('/daily-tasks/my/today').then((r) => setMyToday(r.data)).catch(() => {});
  }, [isAdmin]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {isAdmin && admin && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<Users size={22} />} label="Active Employees" value={admin.counts.active_employees} />
            <StatCard icon={<Briefcase size={22} />} label="Active Clients" value={admin.counts.active_clients} accent="bg-emerald-50 text-emerald-700" />
            <StatCard icon={<FolderKanban size={22} />} label="Active Projects" value={admin.counts.active_projects} accent="bg-amber-50 text-amber-700" />
            <StatCard icon={<AlertTriangle size={22} />} label="Pending Submissions" value={admin.counts.pending_submissions} accent="bg-red-50 text-red-700" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-4">
              <h2 className="font-semibold mb-3">Activity Distribution (this month)</h2>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={admin.activity_distribution || []}
                    dataKey="total_hours"
                    nameKey="activity_name"
                    outerRadius={90}
                    label
                  >
                    {(admin.activity_distribution || []).map((_: any, i: number) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="card p-4">
              <h2 className="font-semibold mb-3">Top Projects (this month)</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={admin.top_projects || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="project_name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="total_hours" fill="#6366f1" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {myToday && (
        <div className="card p-4">
          <div className="flex items-center gap-3 mb-3">
            <Clock className="text-brand-600" />
            <h2 className="font-semibold">My Hours Today</h2>
            <span className="ml-auto text-2xl font-bold text-brand-700">
              {Number(myToday.total_hours || 0).toFixed(2)} h
            </span>
          </div>
          {myToday.tasks.length === 0 ? (
            <p className="text-sm text-slate-500">No tasks submitted yet today. Head to <a href="/tasks" className="text-brand-600 underline">My Tasks</a> to add one.</p>
          ) : (
            <table className="w-full text-sm">
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
                    <td className="table-td">{t.project_name}</td>
                    <td className="table-td">{t.activity_name}</td>
                    <td className="table-td">{t.task_title}</td>
                    <td className="table-td text-right">{Number(t.hours_spent).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
