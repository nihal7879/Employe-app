import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Plus, Clock } from 'lucide-react';
import { api } from '../lib/api';
import type { Activity, Client, Project } from '../types';
import Select from '../components/Select';
import DatePicker from '../components/ui/DatePicker';
import TimePicker from '../components/ui/TimePicker';
import { useAuth } from '../auth/AuthContext';
import { APP_CONFIG } from '../config/app-config';

const todayStr = () => new Date().toISOString().slice(0, 10);
// Minutes-since-midnight → "HH:MM" (24h), clamped to within the day.
const minsToHM = (mins: number) => {
  const t = Math.max(0, Math.min(23 * 60 + 59, mins));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
// "HH:MM" + N minutes, clamped to the end of the day.
const addMinHM = (hm: string, mins: number) => {
  const [h, m] = hm.split(':').map(Number);
  return minsToHM(h * 60 + m + mins);
};
// A fresh start/end pair anchored to right now. Start is rounded UP to the next
// 5-minute mark (e.g. 2:34 → 2:35, 2:29 → 2:30), and end = start + 15 min.
const autoTimes = () => {
  const d = new Date();
  const rounded = Math.min(23 * 60 + 55, Math.ceil((d.getHours() * 60 + d.getMinutes()) / 5) * 5);
  const start = minsToHM(rounded);
  return { start_time: start, end_time: addMinHM(start, 15) };
};
// Format a decimal-hours string ("1.50") as "1h 30m" for display.
const fmtHM = (hours: string) => {
  const total = Math.round(parseFloat(hours) * 60);
  if (!total || total < 0) return '';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ');
};
// today - N days as YYYY-MM-DD (earliest date a backdater may pick).
const daysAgoStr = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export default function Tasks() {
  const { user } = useAuth();
  const canBackdate = !!user?.allow_backdated_tasks;
  const canLogAnytime = !!user?.allow_log_anytime;
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  // Everyone who can be picked in "Assigned By" — all employees + admins. The
  // field still accepts free text for anyone not on the list.
  const [people, setPeople] = useState<{ id: number; name: string }[]>([]);
  // How many days back a backdater may log. Admin-tunable at runtime, so we read
  // it from the server (the build-time const is only the initial fallback).
  const [backdateMaxDays, setBackdateMaxDays] = useState(APP_CONFIG.backdateMaxDays);
  // Longest a single task may be. Read live from the server (runtime-config.json)
  // so editing the JSON updates the limit without a frontend rebuild; the
  // build-time const is just the initial fallback.
  const [maxTaskHours, setMaxTaskHours] = useState(APP_CONFIG.maxTaskHours);

  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState({
    client_id: '', project_id: '', activity_id: '',
    hours_spent: '', task_title: params.get('title') || '', description: params.get('desc') || '',
    assigned_by: '', reference: '',
    // Auto start = now, end = +15 min (the user can still adjust). Progress
    // defaults to Pending.
    task_date: todayStr(), ...autoTimes(),
    progress_status: 'Pending',
  });

  // Pre-fill from the "Add to DWR" deep link (client inbox). Clear the params so
  // a refresh doesn't re-apply them after the user edits the form.
  useEffect(() => {
    if (params.get('title') || params.get('desc')) {
      params.delete('title'); params.delete('desc');
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [submitting, setSubmitting] = useState(false);
  // First Login of today (8 AM – 11:59 PM). Used as a floor for start/end
  // time pickers so users can't log work before they were actually at their
  // desk.
  const [dayStart, setDayStart] = useState<string | null>(null);

  const progressStatusOptions = [
    { label: 'Completed', value: 'Completed' },
    { label: 'In Progress', value: 'In Progress' },
    { label: 'Pending', value: 'Pending' },
  ];

  const filteredProjects = useMemo(
    () => (form.client_id ? projects.filter((p) => p.client_id === Number(form.client_id)) : projects),
    [projects, form.client_id],
  );

  // Only a *General Meeting* is detached from a client/project — its client and
  // project are optional. A plain "Meeting" still requires both.
  const selectedActivity = activities.find((a) => String(a.id) === form.activity_id);
  const clientOptional = /general\s*meeting/i.test(selectedActivity?.activity_name || '');

  const clientOptions = clients.map((c) => ({ label: c.client_name, value: String(c.id) }));
  const projectOptions = filteredProjects.map((p) => ({ label: p.project_name, value: String(p.id) }));
  const activityOptions = activities.map((a) => ({ label: a.activity_name, value: String(a.id) }));
  // Assigned-by uses the name as both label and value, so a picked person and a
  // typed-in name are stored the same way.
  const assigneeOptions = people.map((p) => ({ label: p.name, value: p.name }));

  const load = async () => {
    const [c, a] = await Promise.all([
      api.get('/clients'),
      api.get('/activities'),
    ]);
    setActivities(a.data);
    // Managers may only log against the projects the admin assigned to them, so
    // their client/project pickers are scoped to those assignments. But if the
    // admin hasn't assigned ANY project to the manager, fall back to the full
    // list (an unassigned manager shouldn't be locked out of logging). Everyone
    // else (employees, admins) always sees the full project list.
    if (user?.role === 'Manager') {
      const { data } = await api.get('/managers/me/assignments');
      const projs: Project[] = (data.projects || []).map((p: any) => ({
        id: p.id, client_id: p.client_id, client_name: p.client_name,
        project_code: p.project_code, project_name: p.project_name,
        project_status: 'Active', is_active: true,
      }));
      if (projs.length) {
        setProjects(projs);
        const assignedClientIds = new Set(projs.map((p) => p.client_id));
        setClients((c.data as Client[]).filter((cl) => assignedClientIds.has(cl.id)));
      } else {
        const p = await api.get('/projects');
        setClients(c.data); setProjects(p.data);
      }
    } else {
      const p = await api.get('/projects');
      setClients(c.data); setProjects(p.data);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.role]);

  useEffect(() => {
    api.get('/audit/day-start', { params: { date: todayStr() } })
      // earliest_task_time = login − grace window; the floor the picker enforces.
      .then((r) => setDayStart(r.data?.earliest_task_time || null))
      .catch(() => setDayStart(null));
    api.get('/config')
      .then((r) => {
        if (r.data?.backdateMaxDays != null) setBackdateMaxDays(Number(r.data.backdateMaxDays));
        if (r.data?.maxTaskHours != null) setMaxTaskHours(Number(r.data.maxTaskHours));
      })
      .catch(() => {});
    // All employees + admins, for the "Assigned By" suggestions.
    api.get('/employees', { params: { include_admin: 'true' } })
      .then((r) => setPeople((r.data as { id: number; name: string }[]) || []))
      .catch(() => setPeople([]));
  }, []);

  // The login-time floor only applies to today's entries logged normally.
  // It's lifted for employees with the log-anytime permission, and for any
  // backdated date (that day's floor is enforced server-side instead).
  const timeFloor = canLogAnytime || form.task_date !== todayStr() ? null : dayStart;

  // Auto-calculate hours from start/end time. End must be after start — a
  // non-positive span is an input error (NOT an overnight task; daily tasks
  // live within one work day), so we blank the hours and let submit() block it.
  useEffect(() => {
    if (form.start_time && form.end_time) {
      const [sh, sm] = form.start_time.split(':').map(Number);
      const [eh, em] = form.end_time.split(':').map(Number);
      const mins = (eh * 60 + em) - (sh * 60 + sm);
      setForm((f) => ({ ...f, hours_spent: mins > 0 ? (mins / 60).toFixed(2) : '' }));
    }
    // eslint-disable-next-line
  }, [form.start_time, form.end_time]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return; // prevent double-submit while in-flight
    if (!form.activity_id) {
      toast.error('Select an activity'); return;
    }
    if (!clientOptional && (!form.client_id || !form.project_id)) {
      toast.error('Select client and project'); return;
    }
    if (!form.start_time || !form.end_time) {
      toast.error('Enter start and end time'); return;
    }
    if (form.end_time <= form.start_time) {
      toast.error('End time must be after start time'); return;
    }
    if (parseFloat(form.hours_spent) > maxTaskHours) {
      toast.error(`A task can be at most ${maxTaskHours} hours. Split it into multiple tasks.`); return;
    }
    if (!form.task_title.trim()) {
      toast.error('Enter a task title'); return;
    }
    if (!form.progress_status) {
      toast.error('Select a progress status'); return;
    }
    if (!form.assigned_by.trim()) {
      toast.error('Enter who assigned this'); return;
    }
    if (!form.description.trim()) {
      toast.error('Enter a description'); return;
    }
    setSubmitting(true);
    try {
      await api.post('/daily-tasks', {
        client_id: form.client_id ? Number(form.client_id) : undefined,
        project_id: form.project_id ? Number(form.project_id) : undefined,
        activity_id: Number(form.activity_id),
        hours_spent: Number(form.hours_spent),
        task_title: form.task_title,
        description: form.description,
        assigned_by: form.assigned_by || undefined,
        reference: form.reference || undefined,
        task_date: form.task_date,
        start_time: form.start_time || undefined,
        end_time: form.end_time || undefined,
        progress_status: form.progress_status,
      });
      toast.success('Task logged');
      setForm({ ...form, task_title: '', description: '', hours_spent: '', ...autoTimes(), assigned_by: '', reference: '', progress_status: 'Pending' });
    } catch (e: any) {
      if (e?.reason || e?.isNetworkError) { setSubmitting(false); return; }
      const msg = e.response?.data?.message;
      toast.error((Array.isArray(msg) ? msg[0] : msg) || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">My Tasks</h1>
        <p className="text-ink-mute text-sm">Log your day, build your streak.</p>
      </div>

      {/* Entry form */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="card p-6"
      >
        <div className="flex items-center gap-2 mb-5">
          <div className="h-9 w-9 rounded-xl bg-brand-500/15 text-brand-400 flex items-center justify-center">
            <Plus size={18} />
          </div>
          <h2 className="font-semibold">New task</h2>
        </div>

        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-5">
          <div>
            <label className="label">Date</label>
            <DatePicker
              value={form.task_date}
              clearable={false}
              disabled={!canBackdate}
              maxDate={todayStr()}
              minDate={canBackdate ? daysAgoStr(backdateMaxDays) : undefined}
              onChange={(v) => setForm({ ...form, task_date: v || todayStr() })}
            />
            <p className="mt-1 text-[11px] text-ink-mute">
              {canBackdate
                ? `You can log up to ${backdateMaxDays} days back`
                : 'You can only log today’s tasks'}
            </p>
          </div>
          <div>
            <label className="label">Client{clientOptional && <span className="text-ink-mute font-normal"> (optional)</span>}</label>
            <Select value={form.client_id} options={clientOptions} placeholder="Select client"
              searchable searchPlaceholder="Search client…"
              onChange={(v) => {
                const keepProject = projects.some(
                  (p) => String(p.id) === form.project_id && p.client_id === Number(v),
                );
                setForm({ ...form, client_id: v, project_id: keepProject ? form.project_id : '' });
              }} />
          </div>
          <div>
            <label className="label">Project{clientOptional && <span className="text-ink-mute font-normal"> (optional)</span>}</label>
            <Select value={form.project_id} options={projectOptions} placeholder="Select project"
              searchable searchPlaceholder="Search project…"
              onChange={(v) => {
                // A project belongs to exactly one client — selecting it auto-fills
                // (and pins) that client so the two fields can't disagree.
                const proj = projects.find((p) => String(p.id) === v);
                setForm({
                  ...form,
                  project_id: v,
                  client_id: proj ? String(proj.client_id) : form.client_id,
                });
              }} />
          </div>
          <div>
            <label className="label">Activity</label>
            <Select value={form.activity_id} options={activityOptions} placeholder="Select activity"
              searchable searchPlaceholder="Search activity…"
              onChange={(v) => setForm({ ...form, activity_id: v })} />
          </div>
          <div>
            <label className="label">Start Time</label>
            <TimePicker value={form.start_time} placeholder="Start" minTime={timeFloor}
              onChange={(v) => setForm({ ...form, start_time: v })} />
          </div>
          <div>
            <label className="label">End Time</label>
            <TimePicker value={form.end_time} placeholder="End" minTime={timeFloor}
              onChange={(v) => setForm({ ...form, end_time: v })} />
          </div>
          <div>
            <label className="label">Hours Spent</label>
            <div className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-sm">
              <Clock size={15} className="text-slate-400 shrink-0" />
              <span className={`flex-1 tabular-nums font-semibold ${form.hours_spent ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                {form.hours_spent ? fmtHM(form.hours_spent) : 'Auto'}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-ink-mute">Auto from start &amp; end · max {maxTaskHours}h per task</p>
          </div>
          <div>
            <label className="label">Assigned By</label>
            <Select value={form.assigned_by} options={assigneeOptions} placeholder="Select or type a name"
              searchable searchPlaceholder="Search or type a name…" allowCustom
              onChange={(v) => setForm({ ...form, assigned_by: v })} />
          </div>
          <div>
            <label className="label">Progress Status</label>
            <Select value={form.progress_status} options={progressStatusOptions} placeholder="Select status"
              onChange={(v) => setForm({ ...form, progress_status: v })} />
          </div>
          <div className="md:col-span-2 lg:col-span-2">
            <label className="label">Reference</label>
            <input maxLength={255} placeholder="e.g. email from client, ticket #, doc link"
              value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </div>
          <div className="md:col-span-3 lg:col-span-4">
            <label className="label">Task Title</label>
            <input required maxLength={255} placeholder="Task title"
              value={form.task_title} onChange={(e) => setForm({ ...form, task_title: e.target.value })} />
          </div>
          <div className="md:col-span-3 lg:col-span-4">
            <label className="label">Description</label>
            <textarea rows={3} placeholder="Describe your task"
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="md:col-span-3 lg:col-span-4 flex justify-end gap-2">
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Logging…' : 'Log Task'}</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
