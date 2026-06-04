import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Mail, Plus, RefreshCw, Link2, Inbox as InboxIcon, Search, Star, MailOpen, AlertCircle, X, ChevronDown } from 'lucide-react';
import { api } from '../lib/api';
import type { Activity, Client, Project } from '../types';
import Select from '../components/Select';
import DatePicker from '../components/ui/DatePicker';
import TimePicker from '../components/ui/TimePicker';

const PROGRESS_OPTIONS = [
  { label: 'Completed', value: 'Completed' },
  { label: 'In Progress', value: 'In Progress' },
  { label: 'Pending', value: 'Pending' },
];
const todayStr = () => new Date().toISOString().slice(0, 10);

interface InboxMessage {
  id: string; from: string; fromEmail: string; subject: string; snippet: string; date: string;
}

// Each filter maps to a Gmail search query. Empty q = all mail (no date limit).
const FILTERS = [
  { key: 'inbox', label: 'Inbox', icon: InboxIcon, q: 'in:inbox' },
  { key: 'unread', label: 'Unread', icon: MailOpen, q: 'is:unread' },
  { key: 'starred', label: 'Starred', icon: Star, q: 'is:starred' },
  { key: 'important', label: 'Important', icon: AlertCircle, q: 'is:important' },
  { key: 'all', label: 'All mail', icon: Mail, q: '' },
];

export default function Inbox() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState('inbox');
  const [q, setQ] = useState('');
  const [activeQuery, setActiveQuery] = useState('in:inbox');
  const [active, setActive] = useState<InboxMessage | null>(null);
  const [params, setParams] = useSearchParams();

  // Single source of truth for fetching — only ever called on a user action
  // (filter click, search, "Load emails", "Load more"). Nothing auto-loads.
  const load = (query: string, append = false) => {
    if (append) setLoadingMore(true); else setLoading(true);
    api.get('/inbox/messages', {
      params: { q: query, ...(append && nextToken ? { pageToken: nextToken } : {}) },
    })
      .then((r) => {
        const list: InboxMessage[] = r.data?.messages || [];
        setMessages((prev) => (append ? [...prev, ...list] : list));
        setNextToken(r.data?.nextPageToken || null);
        setLoadedOnce(true);
      })
      .catch(() => { if (!append) setMessages([]); })
      .finally(() => { setLoading(false); setLoadingMore(false); });
  };

  const refreshStatus = () => {
    api.get('/inbox/status').then((r) => {
      setConnected(!!r.data.connected);
      setEmail(r.data.email || '');
      // Auto-load the first page of the inbox so the user sees emails immediately
      // (no "Load emails" click needed). "Load more" still pages on demand.
      if (r.data.connected) load('in:inbox', false);
    }).catch(() => setConnected(false));
  };

  useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const g = params.get('gmail');
    if (!g) return;
    if (g === 'connected') toast.success('Gmail connected.');
    if (g === 'error') toast.error('Could not connect Gmail.');
    params.delete('gmail'); setParams(params, { replace: true });
  }, [params, setParams]);

  const connect = async () => {
    try {
      const { data } = await api.get('/inbox/connect');
      if (!data.url) return;

      // ---- Popup size (centered on the current screen) ----
      const width = 500;   // 👈 popup width
      const height = 650;  // 👈 popup height
      const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
      // IMPORTANT: the features string must be ONE line, comma-separated, with
      // no spaces/newlines/comments — otherwise the browser ignores the sizes.
      const features = `popup=yes,width=${width},height=${height},left=${left},top=${top}`;

      const popup = window.open(data.url, 'gmailSignIn', features);
      if (!popup) { window.location.assign(data.url); return; } // popup blocked → fall back

      const onMsg = (e: MessageEvent) => {
        if (e.origin !== window.location.origin || e.data?.type !== 'gmail-auth') return;
        cleanup();
        try { popup.close(); } catch { /* ignore */ }
        if (e.data.status === 'connected') { toast.success('Gmail connected.'); refreshStatus(); }
        else toast.error('Could not connect Gmail.');
      };
      const timer = window.setInterval(() => {
        if (popup.closed) { cleanup(); refreshStatus(); } // manual close → re-check
      }, 600);
      const cleanup = () => { window.removeEventListener('message', onMsg); window.clearInterval(timer); };
      window.addEventListener('message', onMsg);
    } catch { toast.error('Unable to start Gmail connection.'); }
  };
  const disconnect = async () => {
    await api.delete('/inbox/disconnect').catch(() => null);
    setConnected(false); setMessages([]); setLoadedOnce(false); setNextToken(null);
  };
  const pickFilter = (f: typeof FILTERS[number]) => { setFilter(f.key); setQ(''); setActiveQuery(f.q); load(f.q, false); };
  const runSearch = () => { setActiveQuery(q); load(q, false); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-brand-50 dark:bg-brand-500/15 text-brand-600 dark:text-brand-300 flex items-center justify-center">
          <Mail size={20} />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight">Inbox</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
            {connected ? `Linked: ${email}` : 'Link your Gmail to turn client emails into tasks'}
          </p>
        </div>
        {connected && <button onClick={disconnect} className="ml-auto text-xs text-slate-400 hover:text-rose-500">Unlink</button>}
      </div>

      {connected === null ? null : !connected ? (
        <div className="card p-10 text-center">
          <div className="inline-flex h-16 w-16 rounded-2xl bg-slate-50 dark:bg-white/[0.06] items-center justify-center mb-4">
            <Link2 size={28} className="text-slate-400" />
          </div>
          <p className="text-sm text-slate-500 mb-4 max-w-sm mx-auto">Connect your Gmail to see client emails here and log them straight into your daily work report.</p>
          <button onClick={connect} className="btn-primary inline-flex"><Mail size={14} /> Connect Gmail</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-4">
          {/* Sidebar */}
          <div className="card p-3 h-max">
            <div className="space-y-1">
              {FILTERS.map((f) => {
                const Icon = f.icon;
                const on = filter === f.key;
                return (
                  <button key={f.key} onClick={() => pickFilter(f)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                      ${on ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05]'}`}>
                    <Icon size={16} /> {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* List */}
          <div className="card p-4 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <form onSubmit={(e) => { e.preventDefault(); runSearch(); }} className="relative flex-1 min-w-0">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input className="!pl-9 !pr-16 w-full" placeholder="Search all mail…" value={q} onChange={(e) => setQ(e.target.value)} />
                {q && <button type="button" onClick={() => { setQ(''); const fq = FILTERS.find((f) => f.key === filter)?.q ?? ''; setActiveQuery(fq); load(fq, false); }} className="absolute right-12 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600">clear</button>}
                <button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 btn-primary !py-1 !px-2.5 text-xs">Go</button>
              </form>
              <button onClick={() => load(activeQuery, false)} className="btn-ghost shrink-0" title="Refresh"><RefreshCw size={14} /></button>
            </div>

            {loading ? (
              <div className="text-sm text-slate-400 py-10 text-center">Loading emails…</div>
            ) : !loadedOnce ? (
              <div className="text-center py-12">
                <InboxIcon size={26} className="mx-auto mb-3 text-slate-300" />
                <button onClick={() => load(activeQuery, false)} className="btn-primary inline-flex">Load emails</button>
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12 text-sm text-slate-400">
                <InboxIcon size={24} className="mx-auto mb-2 text-slate-300" /> No emails found.
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                  {messages.map((m) => (
                    <button key={m.id} onClick={() => setActive(m)}
                      className="w-full text-left flex items-start gap-3 py-3 px-1 hover:bg-slate-50 dark:hover:bg-white/[0.03] rounded-lg transition-colors">
                      <div className="h-8 w-8 rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 flex items-center justify-center text-xs font-bold shrink-0">
                        {(m.from || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 dark:text-white text-sm truncate">{m.from}</span>
                          <span className="text-[11px] text-slate-400 shrink-0 ml-auto">{relTime(m.date)}</span>
                        </div>
                        <div className="text-sm text-slate-700 dark:text-slate-300 truncate">{m.subject}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{m.snippet}</div>
                      </div>
                    </button>
                  ))}
                </div>
                {nextToken && (
                  <div className="pt-4 text-center">
                    <button onClick={() => load(activeQuery, true)} disabled={loadingMore} className="btn-ghost inline-flex">
                      <ChevronDown size={14} /> {loadingMore ? 'Loading…' : 'Load more'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {active && <AddToDwrModal message={active} onClose={() => setActive(null)} />}
    </div>
  );
}

// Modal: fetches the full email body, shows it, and an auto-filled task form.
function AddToDwrModal({ message, onClose }: { message: InboxMessage; onClose: () => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [body, setBody] = useState<string>('');
  const [bodyLoading, setBodyLoading] = useState(true);
  const [form, setForm] = useState({
    client_id: '', project_id: '', activity_id: '',
    task_title: message.subject.slice(0, 200),
    description: `From ${message.from} <${message.fromEmail}>\n\n${message.snippet}`,
    assigned_by: message.from || '',
    reference: message.fromEmail || '',
    task_date: todayStr(),
    start_time: '', end_time: '', hours_spent: '',
    progress_status: '',
  });
  const [saving, setSaving] = useState(false);

  // Auto-calc hours from start/end (same as the normal task form).
  useEffect(() => {
    if (form.start_time && form.end_time) {
      const [sh, sm] = form.start_time.split(':').map(Number);
      const [eh, em] = form.end_time.split(':').map(Number);
      const mins = (eh * 60 + em) - (sh * 60 + sm);
      setForm((f) => ({ ...f, hours_spent: mins > 0 ? (mins / 60).toFixed(2) : '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.start_time, form.end_time]);

  useEffect(() => {
    Promise.all([api.get('/clients'), api.get('/projects'), api.get('/activities')])
      .then(([c, p, a]) => { setClients(c.data || []); setProjects(p.data || []); setActivities(a.data || []); })
      .catch(() => null);
  }, []);

  // Pull the full body so the employee can read the whole email and log it properly.
  useEffect(() => {
    setBodyLoading(true);
    api.get(`/inbox/messages/${message.id}`).then((r) => setBody(r.data?.body || message.snippet))
      .catch(() => setBody(message.snippet))
      .finally(() => setBodyLoading(false));
  }, [message.id, message.snippet]);

  const clientOptions = useMemo(() => clients.map((c) => ({ label: c.client_name, value: String(c.id) })), [clients]);
  const projectOptions = useMemo(
    () => projects.filter((p) => !form.client_id || String(p.client_id) === form.client_id).map((p) => ({ label: p.project_name, value: String(p.id) })),
    [projects, form.client_id],
  );
  const activityOptions = useMemo(() => activities.map((a) => ({ label: a.activity_name, value: String(a.id) })), [activities]);

  const insertBody = () => setForm((f) => ({ ...f, description: `From ${message.from} <${message.fromEmail}>\n\n${body}` }));

  const submit = async () => {
    if (!form.client_id || !form.project_id || !form.activity_id) { toast.error('Select client, project and activity'); return; }
    if (!form.task_title.trim()) { toast.error('Enter a title'); return; }
    setSaving(true);
    try {
      await api.post('/daily-tasks', {
        client_id: Number(form.client_id), project_id: Number(form.project_id), activity_id: Number(form.activity_id),
        task_title: form.task_title, description: form.description,
        assigned_by: form.assigned_by || undefined, reference: form.reference || undefined,
        hours_spent: form.hours_spent ? Number(form.hours_spent) : 0,
        task_date: form.task_date || todayStr(),
        start_time: form.start_time || undefined, end_time: form.end_time || undefined,
        progress_status: form.progress_status || 'In Progress',
      });
      toast.success('Added to your DWR.');
      onClose();
    } catch (e: any) {
      if (!e?.isNetworkError) toast.error(e?.response?.data?.message || 'Could not add task.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto thin-scrollbar rounded-2xl bg-white dark:bg-bg-deep border border-slate-200 dark:border-white/10 shadow-2xl">
        <div className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-white/[0.06]">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-900 dark:text-white break-words">{message.subject}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-words">{message.from} &lt;{message.fromEmail}&gt;</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Email</div>
            {!bodyLoading && body && <button onClick={insertBody} className="text-xs text-brand-600 hover:underline">Use full email as description</button>}
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] p-3 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words max-h-56 overflow-y-auto thin-scrollbar">
            {bodyLoading ? 'Loading email…' : (body || message.snippet)}
          </div>

          <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold pt-1">Log this as a task</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Client</label>
              <Select value={form.client_id} options={clientOptions} placeholder="Select client" searchable searchPlaceholder="Search client…"
                onChange={(v) => setForm({ ...form, client_id: v, project_id: '' })} />
            </div>
            <div>
              <label className="label">Project</label>
              <Select value={form.project_id} options={projectOptions} placeholder="Select project" searchable searchPlaceholder="Search project…"
                onChange={(v) => setForm({ ...form, project_id: v })} />
            </div>
            <div>
              <label className="label">Activity</label>
              <Select value={form.activity_id} options={activityOptions} placeholder="Select activity" searchable searchPlaceholder="Search activity…"
                onChange={(v) => setForm({ ...form, activity_id: v })} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Date</label>
              <DatePicker value={form.task_date} onChange={(v) => setForm({ ...form, task_date: v || todayStr() })} clearable={false} />
            </div>
            <div>
              <label className="label">Start Time</label>
              <TimePicker value={form.start_time} placeholder="Start" onChange={(v) => setForm({ ...form, start_time: v })} />
            </div>
            <div>
              <label className="label">End Time</label>
              <TimePicker value={form.end_time} placeholder="End" onChange={(v) => setForm({ ...form, end_time: v })} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Hours</label>
              <input className="w-full" type="number" step="0.25" min="0" value={form.hours_spent} onChange={(e) => setForm({ ...form, hours_spent: e.target.value })} placeholder="Auto" />
            </div>
            <div>
              <label className="label">Assigned By</label>
              <input className="w-full" maxLength={255} value={form.assigned_by} onChange={(e) => setForm({ ...form, assigned_by: e.target.value })} placeholder="Who assigned this?" />
            </div>
            <div>
              <label className="label">Progress</label>
              <Select value={form.progress_status} options={PROGRESS_OPTIONS} placeholder="Select status" onChange={(v) => setForm({ ...form, progress_status: v })} />
            </div>
          </div>
          <div>
            <label className="label">Reference</label>
            <input className="w-full" maxLength={255} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="email / ticket #" />
          </div>
          <div>
            <label className="label">Title</label>
            <input className="w-full" value={form.task_title} onChange={(e) => setForm({ ...form, task_title: e.target.value })} />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="w-full" rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-100 dark:border-white/[0.06]">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary"><Plus size={14} /> {saving ? 'Adding…' : 'Add to DWR'}</button>
        </div>
      </motion.div>
    </div>
  );
}

function relTime(d: string): string {
  if (!d) return '';
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}
