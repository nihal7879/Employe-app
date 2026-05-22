import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, RefreshCw, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import { api } from '../../lib/api';
import Select from '../../components/Select';

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

const STATUS_OPTIONS = [
  { label: 'All statuses', value: '' },
  { label: 'Sent', value: 'Sent', color: '#10B981' },
  { label: 'Failed', value: 'Failed', color: '#EF4444' },
  { label: 'Pending', value: 'Pending', color: '#F59E0B' },
];
const TYPE_OPTIONS = [
  { label: 'All types', value: '' },
  ...['Reminder', 'Daily Summary', 'Weekly Summary', 'Monthly Summary', 'Client Summary']
    .map((t) => ({ label: t, value: t })),
];

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

export default function EmailLogs() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/email-logs', { params: { status: status || undefined, email_type: type || undefined } })
      .then((r) => setLogs(r.data || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, [status, type]);

  const counts = useMemo(() => {
    const c = { Sent: 0, Failed: 0, Pending: 0 };
    for (const l of logs) if (l.status in c) (c as any)[l.status] += 1;
    return c;
  }, [logs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Email Notifications</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Track which emails were sent, failed, or are pending.</p>
        </div>
        <button onClick={load} className="btn-secondary" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile icon={<CheckCircle2 size={16} />} label="Sent" value={counts.Sent} cls="text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-300" />
        <SummaryTile icon={<XCircle size={16} />} label="Failed" value={counts.Failed} cls="text-rose-600 bg-rose-50 dark:bg-rose-500/15 dark:text-rose-300" />
        <SummaryTile icon={<Clock size={16} />} label="Pending" value={counts.Pending} cls="text-amber-600 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-300" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <label className="label">Status</label>
          <Select value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        </div>
        <div className="w-56">
          <label className="label">Type</label>
          <Select value={type} options={TYPE_OPTIONS} onChange={setType} />
        </div>
        <span className="ml-auto text-sm text-slate-500 dark:text-slate-400 self-center">{logs.length} email{logs.length === 1 ? '' : 's'}</span>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-4 overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            <th className="table-th">When</th>
            <th className="table-th">To</th>
            <th className="table-th">Subject</th>
            <th className="table-th">Type</th>
            <th className="table-th">Status</th>
          </tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="table-td whitespace-nowrap text-slate-500 dark:text-slate-400">{fmt(l.sent_at || l.created_at)}</td>
                <td className="table-td font-medium text-slate-900 dark:text-white">{l.email_to}</td>
                <td className="table-td max-w-[280px] truncate" title={l.subject}>{l.subject}</td>
                <td className="table-td"><span className="pill-soft">{l.email_type}</span></td>
                <td className="table-td">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_BADGE[l.status] || 'bg-slate-100 text-slate-600'}`}>
                    {l.status}
                  </span>
                  {l.status === 'Failed' && l.error_message && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-rose-500" title={l.error_message}>
                      <AlertCircle size={12} /> <span className="max-w-[200px] truncate align-bottom">{l.error_message}</span>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={5} className="table-td text-center text-slate-400 py-10">
                {loading ? 'Loading…' : 'No emails match these filters.'}
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
