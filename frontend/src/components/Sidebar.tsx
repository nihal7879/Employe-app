import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, BarChart3, Users, Building2,
  FolderKanban, ListChecks, Mail,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-4 py-2 rounded-md text-sm font-medium ${
    isActive
      ? 'bg-brand-50 text-brand-700'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

export default function Sidebar() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  return (
    <aside className="w-60 bg-white border-r border-slate-200 hidden md:flex flex-col">
      <div className="h-16 flex items-center px-6 border-b border-slate-200">
        <span className="text-lg font-bold text-brand-700">Employee App</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        <NavLink to="/" end className={linkClass}>
          <LayoutDashboard size={18} /> Dashboard
        </NavLink>
        <NavLink to="/tasks" className={linkClass}>
          <ClipboardList size={18} /> My Tasks
        </NavLink>
        {isAdmin && (
          <>
            <div className="mt-4 mb-1 px-4 text-xs uppercase tracking-wide text-slate-400">Admin</div>
            <NavLink to="/reports" className={linkClass}>
              <BarChart3 size={18} /> Reports
            </NavLink>
            <NavLink to="/admin/employees" className={linkClass}>
              <Users size={18} /> Employees
            </NavLink>
            <NavLink to="/admin/clients" className={linkClass}>
              <Building2 size={18} /> Clients
            </NavLink>
            <NavLink to="/admin/projects" className={linkClass}>
              <FolderKanban size={18} /> Projects
            </NavLink>
            <NavLink to="/admin/activities" className={linkClass}>
              <ListChecks size={18} /> Activities
            </NavLink>
            <NavLink to="/admin/email-logs" className={linkClass}>
              <Mail size={18} /> Email Logs
            </NavLink>
          </>
        )}
      </nav>
    </aside>
  );
}
