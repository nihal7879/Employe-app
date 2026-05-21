import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function ProtectedRoute({
  adminOnly = false,
  employeeOnly = false,
}: { adminOnly?: boolean; employeeOnly?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'Admin') return <Navigate to="/" replace />;
  if (employeeOnly && user.role === 'Admin') return <Navigate to="/" replace />;
  return <Outlet />;
}
