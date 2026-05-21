import { Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import ProtectedRoute from './auth/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import Reports from './pages/Reports';
import Employees from './pages/admin/Employees';
import Clients from './pages/admin/Clients';
import Projects from './pages/admin/Projects';
import Activities from './pages/admin/Activities';
import EmailLogs from './pages/admin/EmailLogs';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route element={<ProtectedRoute employeeOnly />}>
            <Route path="/tasks" element={<Tasks />} />
          </Route>
          <Route element={<ProtectedRoute adminOnly />}>
            <Route path="/reports" element={<Reports />} />
            <Route path="/admin/employees" element={<Employees />} />
            <Route path="/admin/clients" element={<Clients />} />
            <Route path="/admin/projects" element={<Projects />} />
            <Route path="/admin/activities" element={<Activities />} />
            <Route path="/admin/email-logs" element={<EmailLogs />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
