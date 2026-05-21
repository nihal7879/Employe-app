import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import type { Department, Employee } from '../../types';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import ConfirmDialog from '../../components/ConfirmDialog';
import DatePicker from '../../components/ui/DatePicker';

interface Role { id: number; role_name: string; }

const emptyForm = {
  employee_code: '', name: '', email: '', role_id: '', department_id: '',
  designation: '', joining_date: '', phone: '',
};

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const load = async () => {
    const [e, d, r] = await Promise.all([
      api.get('/employees', { params: { search: search || undefined } }),
      api.get('/departments'),
      api.get('/roles'),
    ]);
    setEmployees(e.data);
    setDepartments(d.data);
    setRoles(r.data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [search]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (e: Employee) => {
    setEditing(e);
    setForm({
      employee_code: e.employee_code, name: e.name, email: e.email,
      role_id: String(e.role_id), department_id: String(e.department_id),
      designation: e.designation || '', joining_date: e.joining_date || '', phone: e.phone || '',
    });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        role_id: Number(form.role_id),
        department_id: Number(form.department_id),
        joining_date: form.joining_date || undefined,
      };
      if (editing) await api.put(`/employees/${editing.id}`, payload);
      else await api.post('/employees', payload);
      toast.success('Saved');
      setOpen(false); load();
    } catch (e: any) {
      toast.error(e.response?.data?.message?.[0] || e.response?.data?.message || 'Failed');
    }
  };

  const remove = async () => {
    if (confirmId == null) return;
    try {
      await api.delete(`/employees/${confirmId}`);
      toast.success('Deleted'); load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  const roleOptions = roles.map((r) => ({ label: r.role_name, value: String(r.id) }));
  const deptOptions = departments.map((d) => ({ label: d.department_name, value: String(d.id) }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Employees</h1>
        <button onClick={openCreate} className="btn-primary"><Plus size={16} /> Add Employee</button>
      </div>

      <div className="card p-4">
        <div className="relative max-w-sm mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input className="pl-9" placeholder="Search by name, email, code…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr>
              <th className="table-th">Code</th>
              <th className="table-th">Name</th>
              <th className="table-th">Email</th>
              <th className="table-th">Role</th>
              <th className="table-th">Department</th>
              <th className="table-th">Designation</th>
              <th className="table-th"></th>
            </tr></thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td className="table-td">{e.employee_code}</td>
                  <td className="table-td font-medium text-slate-900 dark:text-white">{e.name}</td>
                  <td className="table-td">{e.email}</td>
                  <td className="table-td"><span className="pill-soft">{e.role_name}</span></td>
                  <td className="table-td">{e.department_name}</td>
                  <td className="table-td">{e.designation}</td>
                  <td className="table-td text-right space-x-1">
                    <button
                      onClick={() => openEdit(e)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-500/15"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => setConfirmId(e.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-500/15"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {employees.length === 0 && <tr><td colSpan={7} className="table-td text-center text-slate-400 py-6">No employees.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} title={editing ? 'Edit Employee' : 'Add Employee'} onClose={() => setOpen(false)} size="lg">
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="label">Employee Code</label>
            <input required placeholder="e.g. EMP-001"
              value={form.employee_code}
              onChange={(e) => setForm({ ...form, employee_code: e.target.value })} />
          </div>
          <div>
            <label className="label">Full Name</label>
            <input required placeholder="e.g. Nirav Mehta"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" required placeholder="user@millicent.in"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input placeholder="+91…"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="label">Role</label>
            <Select
              value={form.role_id}
              options={roleOptions}
              onChange={(v) => setForm({ ...form, role_id: v })}
              placeholder="Select role"
            />
          </div>
          <div>
            <label className="label">Department</label>
            <Select
              value={form.department_id}
              options={deptOptions}
              onChange={(v) => setForm({ ...form, department_id: v })}
              placeholder="Select department"
            />
          </div>
          <div>
            <label className="label">Designation</label>
            <input placeholder="e.g. Developer"
              value={form.designation}
              onChange={(e) => setForm({ ...form, designation: e.target.value })} />
          </div>
          <div>
            <label className="label">Joining Date</label>
            <DatePicker
              value={form.joining_date}
              onChange={(v) => setForm({ ...form, joining_date: v })}
            />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2 -mx-5 -mb-5 px-5 py-4 border-t border-slate-100 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02]">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary">{editing ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete this employee?"
        message="The employee will be marked as deleted and removed from the active roster. Their past task logs remain in reports."
        confirmLabel="Delete"
        danger
        onConfirm={remove}
        onClose={() => setConfirmId(null)}
      />
    </div>
  );
}
