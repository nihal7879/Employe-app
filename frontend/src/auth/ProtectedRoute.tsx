import { Navigate, Outlet } from 'react-router-dom';
import SplashScreen from '../components/SplashScreen';
import { useAuth } from './AuthContext';

export default function ProtectedRoute({
  adminOnly = false,
  employeeOnly = false,
  managerOnly = false,
  staffOnly = false,
}: { adminOnly?: boolean; employeeOnly?: boolean; managerOnly?: boolean; staffOnly?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <SplashScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'Admin') return <Navigate to="/" replace />;
  if (managerOnly && user.role !== 'Manager') return <Navigate to="/" replace />;
  // staffOnly screens (assign & track tasks) are for Admins and Managers.
  if (staffOnly && user.role !== 'Admin' && user.role !== 'Manager') return <Navigate to="/" replace />;
  // employeeOnly screens (task logging, my activity) are also open to Managers,
  // who log their own tasks — only Admins are kept out.
  if (employeeOnly && user.role === 'Admin') return <Navigate to="/" replace />;
  return <Outlet />;
}
