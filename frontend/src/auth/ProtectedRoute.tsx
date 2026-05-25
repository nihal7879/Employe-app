import { Navigate, Outlet } from 'react-router-dom';
import SplashScreen from '../components/SplashScreen';
import { useAuth } from './AuthContext';

export default function ProtectedRoute({
  adminOnly = false,
  employeeOnly = false,
}: { adminOnly?: boolean; employeeOnly?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <SplashScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'Admin') return <Navigate to="/" replace />;
  if (employeeOnly && user.role === 'Admin') return <Navigate to="/" replace />;
  return <Outlet />;
}
