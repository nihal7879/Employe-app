import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { UserCog, Users, FolderKanban, Save } from 'lucide-react';
import { api } from '../../lib/api';
import type { Employee, Project } from '../../types';
import MultiSelect from '../../components/ui/MultiSelect';
import { TableSkeleton } from '../../components/Skeleton';

type Manager = {
  id: number;
  name: string;
  email: string;
  employee_code: string;
  employee_count: number;
  project_count: number;
};

export default function Managers() {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<Manager | null>(null);
  const [empIds, setEmpIds] = useState<string[]>([]);
  const [projIds, setProjIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingAssign, setLoadingAssign] = useState(false);

  const loadManagers = async () => {
    const m = await api.get('/managers');
    setManagers(m.data);
    return m.data as Manager[];
  };

  const load = async () => {
    setLoading(true);
    try {
      const [, e, p] = await Promise.all([
        loadManagers(),
        api.get('/employees'),
        api.get('/projects'),
      ]);
      setEmployees(e.data);
      setProjects(p.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const selectManager = async (m: Manager) => {
    setSelected(m);
    setLoadingAssign(true);
    try {
      const r = await api.get(`/managers/${m.id}/assignments`);
      setEmpIds(r.data.employees.map((x: { id: number }) => String(x.id)));
      setProjIds(r.data.projects.map((x: { id: number }) => String(x.id)));
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load assignments');
    } finally {
      setLoadingAssign(false);
    }
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.put(`/managers/${selected.id}/assignments`, {
        employee_ids: empIds.map(Number),
        project_ids: projIds.map(Number),
      });
      toast.success('Assignments saved');
      await loadManagers();
    } catch (err: any) {
      const msg = err.response?.data?.message;
      toast.error((Array.isArray(msg) ? msg[0] : msg) || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // A manager shouldn't appear on their own team.
  const empOptions = employees
    .filter((e) => e.id !== selected?.id)
    .map((e) => ({ label: `${e.name} (${e.employee_code})`, value: String(e.id) }));
  const projOptions = projects.map((p) => ({
    label: p.client_name ? `${p.project_name} · ${p.client_name}` : p.project_name,
    value: String(p.id),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Managers</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Assign employees and projects to each manager. Set a person's role to
          <span className="font-medium"> Manager</span> on the Employees page first.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* Managers list */}
        <div className="card p-4 overflow-x-auto">
          <table className="w-full">
            <thead><tr>
              <th className="table-th">Manager</th>
              <th className="table-th text-right">Team</th>
            </tr></thead>
            <tbody>
              {loading && <TableSkeleton rows={5} cols={2} />}
              {!loading && managers.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => selectManager(m)}
                  className={`cursor-pointer ${selected?.id === m.id ? 'bg-brand-50 dark:bg-white/[0.06]' : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'}`}
                >
                  <td className="table-td">
                    <div className="font-medium text-slate-900 dark:text-white">{m.name}</div>
                    <div className="text-xs text-slate-400">{m.email}</div>
                  </td>
                  <td className="table-td text-right text-sm text-slate-500">
                    {m.employee_count} {m.employee_count === 1 ? 'employee' : 'employees'} · {m.project_count} {m.project_count === 1 ? 'project' : 'projects'}
                  </td>
                </tr>
              ))}
              {!loading && managers.length === 0 && (
                <tr><td colSpan={2} className="table-td text-center text-slate-400 py-6">
                  No managers yet. Set an employee's role to Manager first.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Assignment editor */}
        <div className="card p-5">
          {!selected && (
            <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center text-slate-400">
              <UserCog size={32} className="mb-2 opacity-60" />
              <p className="text-sm">Select a manager to edit their team and projects.</p>
            </div>
          )}
          {selected && (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{selected.name}</div>
                  <div className="text-xs text-slate-400">{selected.employee_code}</div>
                </div>
                <button className="btn-primary" onClick={save} disabled={saving || loadingAssign}>
                  <Save size={16} /> {saving ? 'Saving…' : 'Save'}
                </button>
              </div>

              <div>
                <label className="label flex items-center gap-1.5"><Users size={14} /> Assigned employees</label>
                <MultiSelect
                  value={empIds}
                  options={empOptions}
                  onChange={setEmpIds}
                  placeholder="Select employees…"
                />
                <p className="mt-1 text-xs text-slate-400">
                  The manager sees these employees' daily tasks (all projects).
                </p>
              </div>

              <div>
                <label className="label flex items-center gap-1.5"><FolderKanban size={14} /> Assigned projects</label>
                <MultiSelect
                  value={projIds}
                  options={projOptions}
                  onChange={setProjIds}
                  placeholder="Select projects…"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Shown on the manager's dashboard for context.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
