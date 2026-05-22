import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, ClipboardList, BarChart3, Users, Building2,
  FolderKanban, ListChecks, Mail, X, LogOut, Timer,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const items = [
  { to: '/',                 icon: LayoutDashboard, label: 'Dashboard',     admin: false, hideForAdmin: false },
  { to: '/tasks',            icon: ClipboardList,   label: 'Tasks',         admin: false, hideForAdmin: true  },
  { to: '/my-activity',      icon: Timer,           label: 'My Activity',   admin: false, hideForAdmin: true  },
  { to: '/admin/clients',    icon: Building2,       label: 'Clients',       admin: true,  hideForAdmin: false },
  { to: '/admin/projects',   icon: FolderKanban,    label: 'Projects',      admin: true,  hideForAdmin: false },
  { to: '/admin/employees',  icon: Users,           label: 'Employees',     admin: true,  hideForAdmin: false },
  { to: '/reports',          icon: BarChart3,       label: 'Reports',       admin: true,  hideForAdmin: false },
  { to: '/admin/activities', icon: ListChecks,      label: 'Activities',    admin: true,  hideForAdmin: false },
  { to: '/admin/email-logs', icon: Mail,            label: 'Notifications', admin: true,  hideForAdmin: false },
];

export default function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const visible = items.filter((i) => (!i.admin || isAdmin) && !(isAdmin && i.hideForAdmin));
  const loc = useLocation();

  // close drawer on route change
  useEffect(() => { if (open) onClose(); /* eslint-disable-next-line */ }, [loc.pathname]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-slate-900/40 md:hidden"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed top-0 left-0 bottom-0 z-50 w-72 max-w-[85vw] bg-white dark:bg-bg-deep border-r border-slate-200 dark:border-white/10 flex flex-col md:hidden"
          >
            <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-200/70 dark:border-white/10">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-600 to-cyan-500 flex items-center justify-center text-white font-extrabold text-[13px] tracking-tight shadow-[0_4px_14px_-4px_rgba(124,58,237,0.5)] shrink-0">
                MT
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold leading-tight text-slate-900 dark:text-white">Millicent</div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 font-medium">Technologies</div>
              </div>
              <button onClick={onClose} className="h-8 w-8 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] flex items-center justify-center">
                <X size={18} />
              </button>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
              {visible.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-brand-50 text-brand-700 dark:bg-white/[0.08] dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.04]'
                    }`
                  }
                >
                  <item.icon size={18} className="shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="p-3 border-t border-slate-200/70 dark:border-white/10">
              <div className="flex items-center gap-3 px-2 py-2 rounded-xl">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center text-sm font-bold text-white shrink-0">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{user?.name}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{user?.email}</div>
                </div>
              </div>
              <button
                onClick={() => { logout(); }}
                className="mt-1 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                <LogOut size={16} /> Sign out
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
