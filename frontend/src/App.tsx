import { Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import ProtectedRoute from './auth/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import MyActivity from './pages/MyActivity';
import MyNotifications from './pages/MyNotifications';
import Reports from './pages/Reports';
import Employees from './pages/admin/Employees';
import Clients from './pages/admin/Clients';
import Projects from './pages/admin/Projects';
import Activities from './pages/admin/Activities';
import Permissions from './pages/admin/Permissions';
import EmailLogs from './pages/admin/EmailLogs';
import TodayPresent from './pages/admin/TodayPresent';
import TodayClients from './pages/admin/TodayClients';
import TodayProjects from './pages/admin/TodayProjects';
import YesterdayPending from './pages/admin/YesterdayPending';
import LoginMismatches from './pages/admin/LoginMismatches';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route element={<ProtectedRoute employeeOnly />}>
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/my-activity" element={<MyActivity />} />
            <Route path="/notifications" element={<MyNotifications />} />
          </Route>
          <Route element={<ProtectedRoute adminOnly />}>
            <Route path="/reports" element={<Reports />} />
            <Route path="/admin/employees" element={<Employees />} />
            <Route path="/admin/clients" element={<Clients />} />
            <Route path="/admin/projects" element={<Projects />} />
            <Route path="/admin/activities" element={<Activities />} />
            <Route path="/admin/permissions" element={<Permissions />} />
            <Route path="/admin/email-logs" element={<EmailLogs />} />
            <Route path="/admin/today-present" element={<TodayPresent />} />
            <Route path="/admin/today-clients" element={<TodayClients />} />
            <Route path="/admin/today-projects" element={<TodayProjects />} />
            <Route path="/admin/yesterday-pending" element={<YesterdayPending />} />
            <Route path="/admin/login-mismatches" element={<LoginMismatches />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
