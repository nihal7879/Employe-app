import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCheck, Clock, Inbox, XCircle, ClipboardList, MessageSquare, AtSign, Activity, CalendarDays } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import DatePicker from './ui/DatePicker';
import type { AppNotification } from '../types';

function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

interface EmailLog {
  id: number;
  email_to: string;
  subject: string;
  email_type: string;
  status: string;
  sent_at?: string;
  created_at: string;
}

const typeIcon: Record<string, JSX.Element> = {
  Assignment: <ClipboardList size={14} className="text-brand-500" />,
  Comment: <MessageSquare size={14} className="text-blue-500" />,
  Mention: <AtSign size={14} className="text-violet-500" />,
  StatusChange: <Activity size={14} className="text-emerald-500" />,
  Reminder: <Clock size={14} className="text-amber-500" />,
  Holiday: <CalendarDays size={14} className="text-rose-500" />,
};

export default function Notifications() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'activity' | 'holiday' | 'email'>('activity');

  // Task activity feed
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [taskUnread, setTaskUnread] = useState(0);

  // Email log feed
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [emailUnread, setEmailUnread] = useState(0);
  // Admin-only: filter the email feed to a single day. Empty = recent activity.
  const [date, setDate] = useState('');

  const ctrl = 'relative h-10 w-10 rounded-xl flex items-center justify-center bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:bg-white/[0.04] dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.10] dark:hover:text-white transition-colors';

  const loadTasks = async () => {
    try {
      const [list, count] = await Promise.all([
        api.get('/notifications/mine'),
        api.get('/notifications/mine/unread-count'),
      ]);
      setNotifs(list.data || []);
      setTaskUnread(count.data?.count || 0);
    } catch { /* ignore */ }
  };

  const loadEmails = async () => {
    try {
      // Employees get their own notifications; admins get the full feed,
      // optionally filtered to a single day via the calendar.
      const r = isAdmin
        ? await api.get('/email-logs', { params: { date: date || undefined, limit: date ? 100 : 10 } })
        : await api.get('/email-logs/mine');
      setLogs(r.data || []);
    } catch { setLogs([]); }
    try {
      const c = await api.get('/email-logs/mine/unread-count');
      setEmailUnread(Number(c.data?.count || 0));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadTasks();
    loadEmails();
    const t = setInterval(() => { loadTasks(); loadEmails(); }, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [isAdmin, user?.email, date]);

  // Opening the Emails tab acknowledges everything in it. The watermark lives on
  // the user's row, so these stay read after a logout or on another device.
  useEffect(() => {
    if (!open || tab !== 'email') return;
    setEmailUnread(0);
    api.patch('/email-logs/mine/seen').catch(() => undefined);
  }, [open, tab]);

  // Close on outside click / Esc
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      // The date calendar opens in a portal on <body>, outside this panel.
      // Don't treat clicks inside it as "outside" — that would close the panel
      // and take the calendar with it.
      if (t.closest?.('[data-datepicker-popover]')) return;
      if (ref.current && !ref.current.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const openNotif = async (n: AppNotification) => {
    setOpen(false);
    if (!n.is_read) {
      try { await api.patch(`/notifications/${n.id}/read`); } catch { /* ignore */ }
      setTaskUnread((u) => Math.max(0, u - 1));
      setNotifs((xs) => xs.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    }
    if (n.link) nav(n.link);
  };

  const markAll = async () => {
    try { await api.patch('/notifications/read-all'); } catch { /* ignore */ }
    setTaskUnread(0);
    setNotifs((xs) => xs.map((x) => ({ ...x, is_read: true })));
  };

  // Where an email notification routes when clicked, based on its type.
  const targetFor = (type: string) => {
    if (type === 'Reminder') return '/tasks';
    if (type.includes('Summary')) return isAdmin ? '/reports' : '/my-activity';
    return isAdmin ? '/admin/email-logs' : '/my-activity';
  };
  const openLog = (l: EmailLog) => { setOpen(false); nav(targetFor(l.email_type)); };

  const statusIcon = (s: string) =>
    s === 'Sent'   ? <CheckCheck size={14} className="text-emerald-500" />
    : s === 'Failed' ? <XCircle size={14}   className="text-rose-500" />
    :                  <Clock size={14}     className="text-amber-500" />;

  const timeAgo = (iso?: string) => {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso.replace(' ', 'T') + 'Z').getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const total = taskUnread + emailUnread;

  // Holidays get their own tab — keep them out of the Task activity feed.
  const holidayNotifs = notifs.filter((n) => n.type === 'Holiday');
  const activityNotifs = notifs.filter((n) => n.type !== 'Holiday');
  const holidayUnread = holidayNotifs.filter((n) => !n.is_read).length;

  const tabCls = (active: boolean) =>
    `flex-1 px-3 py-2 text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 ${
      active
        ? 'bg-white text-slate-900 shadow-sm dark:bg-white/[0.10] dark:text-white'
        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
    }`;

  const pill = (n: number) => n > 0 && (
    <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
      {n > 9 ? '9+' : n}
    </span>
  );

  const empty = (msg: string) => (
    <div className="px-4 py-10 text-center">
      <div className="inline-flex h-10 w-10 rounded-xl bg-slate-100 dark:bg-white/[0.06] items-center justify-center mb-2">
        <Inbox size={18} className="text-slate-400" />
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">{msg}</p>
    </div>
  );

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className={ctrl} title="Notifications">
        <Bell size={18} />
        {total > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 w-auto sm:w-96 max-h-[80vh] z-50 rounded-2xl bg-white dark:bg-bg-deep border border-slate-200 dark:border-white/10 shadow-xl overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
              <div className="font-semibold text-slate-900 dark:text-white">Notifications</div>
              {tab === 'activity' ? (
                taskUnread > 0 && (
                  <button onClick={markAll} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 inline-flex items-center gap-1">
                    <CheckCheck size={13} /> Mark all read
                  </button>
                )
              ) : (
                <button
                  onClick={() => { setOpen(false); nav(isAdmin ? '/admin/email-logs' : '/notifications'); }}
                  className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700"
                >View all</button>
              )}
            </div>

            <div className="px-3 pt-3">
              <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.04]">
                <button onClick={() => setTab('activity')} className={tabCls(tab === 'activity')}>
                  Activity {pill(activityNotifs.filter((n) => !n.is_read).length)}
                </button>
                <button onClick={() => setTab('holiday')} className={tabCls(tab === 'holiday')}>
                  Holidays {pill(holidayUnread)}
                </button>
                <button onClick={() => setTab('email')} className={tabCls(tab === 'email')}>
                  Emails {pill(emailUnread)}
                </button>
              </div>
            </div>

            {/* Admin: pick a day to see that day's email activity (clear = recent). */}
            {tab === 'email' && isAdmin && (
              <div className="px-4 py-2.5">
                <DatePicker
                  value={date}
                  onChange={(v) => setDate(v)}
                  placeholder="Filter by date"
                  maxDate={todayStr()}
                />
              </div>
            )}

            <div className="mt-2 max-h-96 overflow-y-auto border-t border-slate-100 dark:border-white/10">
              {tab === 'activity' || tab === 'holiday' ? (
                (() => {
                  const list = tab === 'holiday' ? holidayNotifs : activityNotifs;
                  return list.length === 0
                    ? empty(tab === 'holiday' ? 'No holiday notifications yet.' : 'No task notifications yet.')
                    : list.map((n) => (
                      <div key={n.id} onClick={() => openNotif(n)}
                        className={`px-4 py-3 border-b border-slate-100 dark:border-white/10 last:border-0 hover:bg-slate-50 dark:hover:bg-white/[0.04] cursor-pointer ${n.is_read ? '' : 'bg-brand-50/40 dark:bg-brand-500/[0.06]'}`}>
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5">{typeIcon[n.type] || <Bell size={14} className="text-slate-400" />}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-900 dark:text-white">{n.title}</div>
                            {n.body && <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{n.body}</div>}
                            <div className="text-[10px] text-slate-400 mt-0.5">{timeAgo(n.created_at)}</div>
                          </div>
                          {!n.is_read && <span className="mt-1.5 h-2 w-2 rounded-full bg-brand-500 shrink-0" />}
                        </div>
                      </div>
                    ));
                })()
              ) : (
                logs.length === 0 ? empty('No notifications yet.') : logs.map((l) => (
                  <div key={l.id} onClick={() => openLog(l)}
                    className="px-4 py-3 border-b border-slate-100 dark:border-white/10 last:border-0 hover:bg-slate-50 dark:hover:bg-white/[0.04] cursor-pointer">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5">{statusIcon(l.status)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">{l.email_type}</span>
                          <span className="text-[10px] text-slate-400">·</span>
                          <span className="text-[10px] text-slate-400">{timeAgo(l.sent_at || l.created_at)}</span>
                        </div>
                        <div className="text-sm font-medium text-slate-900 dark:text-white truncate mt-0.5">{l.subject}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">to {l.email_to}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
