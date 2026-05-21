import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6">
      <div>
        <div className="text-sm font-semibold">{user?.name}</div>
        <div className="text-xs text-slate-500">{user?.email} · {user?.role}</div>
      </div>
      <button
        onClick={() => { logout(); nav('/login', { replace: true }); }}
        className="btn-secondary"
      >
        <LogOut size={16} className="mr-2" /> Logout
      </button>
    </header>
  );
}
