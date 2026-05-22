import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronDown, LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import GlobalSearch from './GlobalSearch';
import Notifications from './Notifications';

const titles: Record<string, { title: string; sub: string }> = {
  '/':                 { title: 'Dashboard',     sub: "Welcome back — here's your work at a glance" },
  '/tasks':            { title: 'My Tasks',      sub: 'Log your day, build your streak' },
  '/my-activity':      { title: 'My Activity',   sub: 'Your time tracked across projects' },
  '/reports':          { title: 'Reports',       sub: 'Daily, weekly, and monthly insights' },
  '/admin/employees':  { title: 'Employees',     sub: 'Manage your team' },
  '/admin/clients':    { title: 'Clients',       sub: 'All clients you serve' },
  '/admin/projects':   { title: 'Projects',      sub: 'Active engagements across clients' },
  '/admin/activities': { title: 'Activities',    sub: 'Master list of task types' },
  '/admin/email-logs': { title: 'Notifications', sub: 'Outgoing emails — sent, failed, pending' },
};

export default function Navbar({ onOpenMobileMenu }: { onOpenMobileMenu?: () => void }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
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

  const ctrl = 'h-10 w-10 rounded-xl flex items-center justify-center bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:bg-white/[0.04] dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.10] dark:hover:text-white transition-colors';

  return (
    <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-xl border-b border-slate-200/70 dark:bg-bg/60 dark:border-white/10">
      <div className="h-16 flex items-center gap-3 px-4 sm:px-6">
        {/* Hamburger — mobile only */}
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden h-10 w-10 rounded-xl flex items-center justify-center bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:bg-white/[0.04] dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.10] shrink-0"
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight truncate">{meta.title}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{meta.sub}</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <GlobalSearch />

          <div className="hidden md:flex flex-col items-end leading-tight pr-2">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">{dateLabel}</span>
            <span className="text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">{timeLabel}</span>
          </div>

          <button onClick={toggle} title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'} className={ctrl}>
            <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: 0.25 }}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </motion.span>
          </button>

          <Notifications />

          <div className="relative group">
            <button className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 dark:bg-white/[0.04] dark:border-white/10 dark:hover:bg-white/[0.10]">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center text-xs font-bold text-white">
                {user?.name?.charAt(0).toUpperCase()}{user?.name?.split(' ')[1]?.charAt(0).toUpperCase() || ''}
              </div>
              <ChevronDown size={14} className="hidden md:block text-slate-400" />
            </button>
            <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-white shadow-xl border border-slate-200/70 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all p-2 z-40
                            dark:bg-bg-deep dark:border-white/10">
              <div className="px-3 py-2 border-b border-slate-200/70 dark:border-white/10">
                <div className="text-sm font-medium truncate">{user?.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{user?.email}</div>
              </div>
              <button
                onClick={() => { logout(); nav('/login', { replace: true }); }}
                className="mt-1 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
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
