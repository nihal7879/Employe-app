import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import type { Department, Employee } from '../../types';

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

  const remove = async (id: number) => {
    if (!confirm('Delete this employee?')) return;
    await api.delete(`/employees/${id}`);
    toast.success('Deleted'); load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Employees</h1>
        <button onClick={openCreate} className="btn-primary"><Plus size={16} className="mr-2" /> Add Employee</button>
      </div>

      <div className="card p-4">
        <input className="input mb-3 max-w-sm" placeholder="Search by name, email, code…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
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
                  <td className="table-td font-medium">{e.name}</td>
                  <td className="table-td">{e.email}</td>
                  <td className="table-td">{e.role_name}</td>
                  <td className="table-td">{e.department_name}</td>
                  <td className="table-td">{e.designation}</td>
                  <td className="table-td text-right space-x-2">
                    <button onClick={() => openEdit(e)} className="text-brand-600"><Pencil size={16} /></button>
                    <button onClick={() => remove(e.id)} className="text-red-600"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
              {employees.length === 0 && <tr><td colSpan={7} className="table-td text-center text-slate-400">No employees.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <Modal title={editing ? 'Edit Employee' : 'Add Employee'} onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Employee Code" value={form.employee_code} onChange={(v) => setForm({ ...form, employee_code: v })} required />
            <FormField label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
            <FormField label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
            <FormField label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <div>
              <label className="label">Role</label>
              <select className="input" required value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
                <option value="">Select role</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.role_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Department</label>
              <select className="input" required value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                <option value="">Select department</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.department_name}</option>)}
              </select>
            </div>
            <FormField label="Designation" value={form.designation} onChange={(v) => setForm({ ...form, designation: v })} />
            <FormField label="Joining Date" type="date" value={form.joining_date} onChange={(v) => setForm({ ...form, joining_date: v })} />
            <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="btn-primary">{editing ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function FormField({ label, value, onChange, type = 'text', required = false }:
  { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type={type} className="input" required={required}
        value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
