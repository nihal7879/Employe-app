import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bell, ChevronDown, LogOut, Search } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const titles: Record<string, { title: string; sub: string }> = {
  '/':                 { title: 'Dashboard',     sub: "Welcome back — here's what's happening across your team" },
  '/tasks':            { title: 'My Tasks',      sub: 'Log your day, build your streak' },
  '/reports':          { title: 'Reports',       sub: 'Daily, weekly, and monthly insights' },
  '/admin/employees':  { title: 'Employees',     sub: 'Manage your team' },
  '/admin/clients':    { title: 'Clients',       sub: 'All clients you serve' },
  '/admin/projects':   { title: 'Projects',      sub: 'Active engagements across clients' },
  '/admin/activities': { title: 'Activities',    sub: 'Master list of task types' },
  '/admin/email-logs': { title: 'Notifications', sub: 'Outgoing emails — sent, failed, pending' },
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  const meta = titles[loc.pathname] || { title: 'Workspace', sub: '' };
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const timeLabel = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-xl border-b border-slate-200/70">
      <div className="h-16 flex items-center gap-4 px-6">
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight truncate">{meta.title}</h1>
          <p className="text-xs text-slate-500 truncate">{meta.sub}</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative hidden lg:block">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input placeholder="Search clients, projects…"
              className="pl-9 pr-3 py-2 w-64 rounded-full bg-slate-100 border-slate-100 text-sm focus:bg-white" />
          </div>

          <div className="hidden md:flex flex-col items-end leading-tight pr-2">
            <span className="text-[11px] text-slate-500">{dateLabel}</span>
            <span className="text-sm font-semibold tabular-nums text-slate-700">{timeLabel}</span>
          </div>

          <button className="relative h-10 w-10 rounded-xl flex items-center justify-center bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50">
            <Bell size={18} />
            <motion.span
              animate={{ scale: [1, 1.4, 1] }}
              transition={{ duration: 1.6, repeat: Infinity }}
              className="absolute top-2 right-2 h-2 w-2 rounded-full bg-brand-500"
            />
          </button>

          <div className="relative group">
            <button className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50">
              <div className="text-right hidden md:block leading-tight">
                <div className="text-sm font-semibold">{user?.name?.split(' ')[0]}</div>
                <div className="text-[10px] text-slate-500">{user?.role}</div>
              </div>
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center text-xs font-bold text-white">
                {user?.name?.charAt(0).toUpperCase()}{user?.name?.split(' ')[1]?.charAt(0).toUpperCase() || ''}
              </div>
              <ChevronDown size={14} className="hidden md:block text-slate-400" />
            </button>
            <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-white shadow-xl border border-slate-200/70 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all p-2 z-40">
              <div className="px-3 py-2 border-b border-slate-200/70">
                <div className="text-sm font-medium truncate">{user?.name}</div>
                <div className="text-xs text-slate-500 truncate">{user?.email}</div>
              </div>
              <button
                onClick={() => { logout(); nav('/login', { replace: true }); }}
                className="mt-1 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut size={16} /> Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
