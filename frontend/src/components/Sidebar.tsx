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
      className="hidden md:flex flex-col bg-white border-r border-slate-200/70 relative"
    >
      <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-200/70 overflow-visible bg-white relative">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-600 to-cyan-500 flex items-center justify-center text-white font-extrabold text-[13px] tracking-tight shadow-[0_4px_14px_-4px_rgba(124,58,237,0.5)] shrink-0">
          MT
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
              className="flex-1 min-w-0"
            >
              <div className="text-sm font-bold leading-tight">Millicent</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-medium">Technology</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating collapse toggle — top right corner of the sidebar */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -top-1 -right-3.5 z-20 h-7 w-7 rounded-full bg-white border border-slate-200 shadow-[0_4px_10px_-2px_rgba(15,23,42,0.18)]
                   flex items-center justify-center text-slate-600
                   hover:bg-brand-600 hover:text-white hover:border-brand-600 hover:shadow-[0_4px_14px_-2px_rgba(124,58,237,0.5)] transition-all"
      >
        <motion.span animate={{ rotate: collapsed ? 180 : 0 }} transition={{ duration: 0.25 }} className="flex">
          <ChevronLeft size={16} strokeWidth={2.5} />
        </motion.span>
      </button>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visible.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'text-brand-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="active-pill"
                    className="absolute inset-0 rounded-xl bg-brand-50 -z-10"
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
