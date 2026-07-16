import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

// Text colour presets the admin can choose (Notices page). Only the scrolling
// message text is coloured — the "Notice" badge keeps its brand style.
// Full class strings so Tailwind's JIT keeps them (no dynamic concatenation).
const TEXT_COLORS: Record<string, string> = {
  red: 'text-red-700 dark:text-red-300',
  amber: 'text-amber-700 dark:text-amber-300',
  blue: 'text-blue-700 dark:text-blue-300',
  green: 'text-emerald-700 dark:text-emerald-300',
  slate: 'text-slate-700 dark:text-slate-200',
};

type Notice = { id: number; message: string; color: string };

// Govt-website style scrolling notice bar shown at the top of the Dashboard.
// Shows every active notice (newest first), each in its admin-chosen colour;
// the whole run is duplicated inside the marquee so the scroll loops seamlessly.
// No active notices renders nothing.
export default function NoticeTicker() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    if (isAdmin) return; // notices are for employees only — admins set them, don't see them
    api.get('/notices/active')
      .then((r) => setNotices(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, [isAdmin]);

  if (isAdmin || notices.length === 0) return null;

  // One run of all notices, separated by a dot; duplicated for the seamless loop.
  const run = (aria: boolean) =>
    notices.map((n, i) => {
      const textClass = TEXT_COLORS[n.color] || TEXT_COLORS.red;
      return (
        <span key={`${aria ? 'b' : 'a'}-${n.id}`} className="inline-flex items-center">
          <span className={`px-8 ${textClass}`}>{n.message}</span>
          {i < notices.length - 1 && <span className="text-slate-300 dark:text-white/20">•</span>}
        </span>
      );
    });

  return (
    <div className="card overflow-hidden flex items-stretch p-0">
      <div className="flex items-center gap-2 px-4 bg-brand-600 text-white font-semibold text-sm shrink-0">
        <Megaphone size={16} />
        <span className="hidden sm:inline">Notice</span>
      </div>
      <div className="notice-marquee flex-1 overflow-hidden relative py-2.5">
        <div className="notice-marquee-track whitespace-nowrap text-sm font-semibold">
          {run(false)}
          <span aria-hidden="true">{run(true)}</span>
        </div>
      </div>
    </div>
  );
}
