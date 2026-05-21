import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCheck, Clock, Inbox, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

interface EmailLog {
  id: number;
  email_to: string;
  subject: string;
  email_type: string;
  status: string;
  sent_at?: string;
  created_at: string;
}

export default function Notifications() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [unread, setUnread] = useState(0);
  const ctrl = 'relative h-10 w-10 rounded-xl flex items-center justify-center bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:bg-white/[0.04] dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.10] dark:hover:text-white transition-colors';

  const load = async () => {
    if (!isAdmin) {
      // Employees: only show emails sent to them
      try {
        const r = await api.get('/email-logs', { params: { limit: 20 } });
        const mine = (r.data || []).filter((l: EmailLog) => l.email_to === user?.email).slice(0, 10);
        setLogs(mine);
      } catch { setLogs([]); }
    } else {
      try {
        const r = await api.get('/email-logs', { params: { limit: 10 } });
        setLogs(r.data || []);
      } catch { setLogs([]); }
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000); // refresh every minute
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [isAdmin, user?.email]);

  // Mark as "read" when panel opens — local only (no backend field yet)
  useEffect(() => {
    if (open) {
      setUnread(0);
      const ids = logs.map((l) => l.id).join(',');
      localStorage.setItem('em_notifs_seen', ids);
    } else {
      const seen = (localStorage.getItem('em_notifs_seen') || '').split(',').filter(Boolean);
      const unseen = logs.filter((l) => !seen.includes(String(l.id))).length;
      setUnread(unseen);
    }
  }, [logs, open]);

  // Close on outside click / Esc
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

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

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className={ctrl} title="Notifications">
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
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
            className="absolute right-0 mt-2 w-96 z-50 rounded-2xl bg-white dark:bg-bg-deep border border-slate-200 dark:border-white/10 shadow-xl overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">Notifications</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Recent email activity</div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => { setOpen(false); nav('/admin/email-logs'); }}
                  className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700"
                >View all</button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {logs.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <div className="inline-flex h-10 w-10 rounded-xl bg-slate-100 dark:bg-white/[0.06] items-center justify-center mb-2">
                    <Inbox size={18} className="text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">No notifications yet.</p>
                </div>
              ) : (
                logs.map((l) => (
                  <div key={l.id}
                    className="px-4 py-3 border-b border-slate-100 dark:border-white/10 last:border-0 hover:bg-slate-50 dark:hover:bg-white/[0.04]">
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
