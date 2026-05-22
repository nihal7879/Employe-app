import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, CheckCircle2, XCircle, Clock, Inbox } from 'lucide-react';
import { api } from '../lib/api';

interface EmailLog {
  id: number;
  email_to: string;
  subject: string;
  email_type: string;
  status: 'Sent' | 'Failed' | 'Pending' | string;
  error_message?: string;
  sent_at?: string;
  created_at: string;
}

const STATUS_BADGE: Record<string, string> = {
  Sent: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Failed: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  Pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
};

function fmt(d?: string) {
  if (!d) return '—';
  return new Date(d.replace(' ', 'T')).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function MyNotifications() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/email-logs/mine')
      .then((r) => setLogs(r.data || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const counts = useMemo(() => {
    const c = { Sent: 0, Failed: 0, Pending: 0 };
    for (const l of logs) if (l.status in c) (c as any)[l.status] += 1;
    return c;
  }, [logs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Reminders and summaries sent to you.</p>
        </div>
        <button onClick={load} className="btn-secondary" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <SummaryTile icon={<CheckCircle2 size={16} />} label="Sent" value={counts.Sent} cls="text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-300" />
        <SummaryTile icon={<XCircle size={16} />} label="Failed" value={counts.Failed} cls="text-rose-600 bg-rose-50 dark:bg-rose-500/15 dark:text-rose-300" />
        <SummaryTile icon={<Clock size={16} />} label="Pending" value={counts.Pending} cls="text-amber-600 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-300" />
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-4 overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            <th className="table-th">When</th>
            <th className="table-th">Subject</th>
            <th className="table-th">Type</th>
            <th className="table-th">Status</th>
          </tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="table-td whitespace-nowrap text-slate-500 dark:text-slate-400">{fmt(l.sent_at || l.created_at)}</td>
                <td className="table-td max-w-[360px] truncate font-medium text-slate-900 dark:text-white" title={l.subject}>{l.subject}</td>
                <td className="table-td"><span className="pill-soft">{l.email_type}</span></td>
                <td className="table-td">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_BADGE[l.status] || 'bg-slate-100 text-slate-600'}`}>
                    {l.status}
                  </span>
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={4} className="table-td text-center text-slate-400 py-12">
                {loading ? 'Loading…' : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="inline-flex h-10 w-10 rounded-xl bg-slate-100 dark:bg-white/[0.06] items-center justify-center">
                      <Inbox size={18} className="text-slate-400" />
                    </div>
                    No notifications yet.
                  </div>
                )}
              </td></tr>
            )}
          </tbody>
        </table>
      </motion.div>
    </div>
  );
}

function SummaryTile({ icon, label, value, cls }: { icon: React.ReactNode; label: string; value: number; cls: string }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${cls}`}>{icon}</div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium">{label}</div>
        <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</div>
      </div>
    </div>
  );
}
