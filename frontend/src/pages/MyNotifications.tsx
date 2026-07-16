import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Inbox, MessageSquare, AtSign, ClipboardCheck, Bell, CheckCheck, Mail, CheckCircle2, XCircle, Clock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

interface AppNotification {
  id: number;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  task_id?: number | null;
  is_read: boolean | number;
  created_at: string;
}

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

const TYPE_ICON: Record<string, LucideIcon> = {
  Comment: MessageSquare,
  Mention: AtSign,
  Assignment: ClipboardCheck,
  StatusChange: ClipboardCheck,
};

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

type Tab = 'activity' | 'email';

export default function MyNotifications() {
  const nav = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [tab, setTab] = useState<Tab>('activity');
  const [items, setItems] = useState<AppNotification[]>([]);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    const p = tab === 'activity'
      ? api.get('/notifications/mine', { params: { limit: 50 } }).then((r) => setItems(r.data || [])).catch(() => setItems([]))
      // Admin sees all sent mail; an employee only their own.
      : api.get(isAdmin ? '/email-logs' : '/email-logs/mine', { params: { limit: 100 } }).then((r) => setLogs(r.data || [])).catch(() => setLogs([]));
    p.finally(() => setLoading(false));
  };
  useEffect(load, [tab]);

  // Open an activity notification: mark read, then follow its deep link (e.g.
  // straight to the commented task).
  const open = async (n: AppNotification) => {
    try { if (!n.is_read) await api.patch(`/notifications/${n.id}/read`); } catch { /* ignore */ }
    if (n.link) nav(n.link);
    else load();
  };

  const markAll = async () => {
    try { await api.patch('/notifications/read-all'); } catch { /* ignore */ }
    load();
  };

  const unread = items.filter((n) => !n.is_read).length;

  const emailCounts = useMemo(() => {
    const c = { Sent: 0, Failed: 0, Pending: 0 };
    for (const l of logs) if (l.status in c) (c as any)[l.status] += 1;
    return c;
  }, [logs]);

  const tabCls = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${active
      ? 'bg-brand-50 text-brand-700 dark:bg-white/[0.08] dark:text-white'
      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Comments, mentions and email updates for you.</p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'activity' && unread > 0 && (
            <button onClick={markAll} className="btn-secondary"><CheckCheck size={14} /> Mark all read</button>
          )}
          <button onClick={load} className="btn-secondary" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5">
        <button onClick={() => setTab('activity')} className={tabCls(tab === 'activity')}>
          <Bell size={13} className="inline -mt-0.5 mr-1" /> Activity
          {unread > 0 && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500 text-white">{unread}</span>}
        </button>
        <button onClick={() => setTab('email')} className={tabCls(tab === 'email')}>
          <Mail size={13} className="inline -mt-0.5 mr-1" /> Email
        </button>
      </div>

      {tab === 'activity' ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-2">
          {items.length === 0 ? (
            <EmptyState loading={loading} />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {items.map((n) => {
                const Icon = TYPE_ICON[n.type] || Bell;
                const unreadRow = !n.is_read;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => open(n)}
                      className={`w-full text-left flex items-start gap-3 px-3 py-3 rounded-lg transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.04] ${unreadRow ? 'bg-brand-50/40 dark:bg-brand-500/[0.06]' : ''}`}
                    >
                      <span className={`mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${unreadRow ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300' : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400'}`}>
                        <Icon size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{n.title}</span>
                          {unreadRow && <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />}
                        </div>
                        {n.body && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-words [overflow-wrap:anywhere]">{n.body}</p>}
                        <div className="text-[11px] text-slate-400 mt-1">{fmt(n.created_at)}</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </motion.div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <SummaryTile icon={<CheckCircle2 size={16} />} label="Sent" value={emailCounts.Sent} cls="text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-300" />
            <SummaryTile icon={<XCircle size={16} />} label="Failed" value={emailCounts.Failed} cls="text-rose-600 bg-rose-50 dark:bg-rose-500/15 dark:text-rose-300" />
            <SummaryTile icon={<Clock size={16} />} label="Pending" value={emailCounts.Pending} cls="text-amber-600 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-300" />
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
                    {loading ? 'Loading…' : 'No emails yet.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </motion.div>
        </>
      )}
    </div>
  );
}

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 text-slate-400 py-14">
      {loading ? 'Loading…' : (<>
        <div className="inline-flex h-10 w-10 rounded-xl bg-slate-100 dark:bg-white/[0.06] items-center justify-center">
          <Inbox size={18} className="text-slate-400" />
        </div>
        No notifications yet.
      </>)}
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
