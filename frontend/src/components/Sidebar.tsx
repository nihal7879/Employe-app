import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, ClipboardList, BarChart3, Users, Building2,
  FolderKanban, ListChecks, Mail, ChevronLeft,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const items = [
  { to: '/',                 icon: LayoutDashboard, label: 'Dashboard',     admin: false, hideForAdmin: false },
  { to: '/tasks',            icon: ClipboardList,   label: 'Tasks',         admin: false, hideForAdmin: true  },
  { to: '/admin/clients',    icon: Building2,       label: 'Clients',       admin: true,  hideForAdmin: false },
  { to: '/admin/projects',   icon: FolderKanban,    label: 'Projects',      admin: true,  hideForAdmin: false },
  { to: '/admin/employees',  icon: Users,           label: 'Employees',     admin: true,  hideForAdmin: false },
  { to: '/reports',          icon: BarChart3,       label: 'Reports',       admin: true,  hideForAdmin: false },
  { to: '/admin/activities', icon: ListChecks,      label: 'Activities',    admin: true,  hideForAdmin: false },
  { to: '/admin/email-logs', icon: Mail,            label: 'Notifications', admin: true,  hideForAdmin: false },
];

export default function Sidebar() {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const isAdmin = user?.role === 'Admin';
  const visible = items.filter((i) => (!i.admin || isAdmin) && !(isAdmin && i.hideForAdmin));

  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 240 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      className="hidden md:flex flex-col app-sidebar border-r border-slate-200/70 dark:border-white/10 relative"
    >
      <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-200/70 dark:border-white/10">
        <button
          type="button"
          onClick={() => collapsed && setCollapsed(false)}
          title={collapsed ? 'Expand sidebar' : 'Millicent Technology'}
          className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-600 to-cyan-500 flex items-center justify-center text-white font-extrabold text-[13px] tracking-tight shadow-[0_4px_14px_-4px_rgba(124,58,237,0.5)] shrink-0 cursor-pointer hover:scale-105 transition-transform"
        >
          MT
        </button>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
              className="flex-1 min-w-0"
            >
              <div className="text-sm font-bold leading-tight text-slate-900 dark:text-white">Millicent</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 font-medium">Technology</div>
            </motion.div>
          )}
        </AnimatePresence>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            title="Collapse sidebar"
            className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <ChevronLeft size={16} strokeWidth={2.5} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visible.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'text-brand-700 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.04]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="active-pill"
                    className="absolute inset-0 rounded-xl bg-brand-50 dark:bg-white/[0.08] -z-10"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <item.icon size={18} className="shrink-0" />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} className="truncate">
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </>
            )}
          </NavLink>
        ))}
      </nav>

    </motion.aside>
  );
}
