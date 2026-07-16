import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { api } from '../lib/api';

// Text colour presets the admin can choose (Permissions page). Only the
// scrolling message text is coloured — the "Notice" badge keeps its brand style.
// Full class strings so Tailwind's JIT keeps them (no dynamic concatenation).
const TEXT_COLORS: Record<string, string> = {
  red: 'text-red-700 dark:text-red-300',
  amber: 'text-amber-700 dark:text-amber-300',
  blue: 'text-blue-700 dark:text-blue-300',
  green: 'text-emerald-700 dark:text-emerald-300',
  slate: 'text-slate-700 dark:text-slate-200',
};

// Govt-website style scrolling notice bar shown at the top of the Dashboard.
// Text and its colour are admin-editable (Permissions page → runtime-config);
// an empty notice renders nothing. The text is duplicated inside the marquee so
// the scroll loops seamlessly with no visible gap.
export default function NoticeTicker() {
  const [notice, setNotice] = useState('');
  const [color, setColor] = useState('red');

  useEffect(() => {
    api.get('/config')
      .then((r) => {
        setNotice(String(r.data?.dashboardNotice ?? '').trim());
        if (r.data?.dashboardNoticeColor) setColor(String(r.data.dashboardNoticeColor));
      })
      .catch(() => {});
  }, []);

  if (!notice) return null;

  const textClass = TEXT_COLORS[color] || TEXT_COLORS.red;

  return (
    <div className="card overflow-hidden flex items-stretch p-0">
      <div className="flex items-center gap-2 px-4 bg-brand-600 text-white font-semibold text-sm shrink-0">
        <Megaphone size={16} />
        <span className="hidden sm:inline">Notice</span>
      </div>
      <div className="notice-marquee flex-1 overflow-hidden relative py-2.5">
        <div className={`notice-marquee-track whitespace-nowrap text-sm font-semibold ${textClass}`}>
          <span className="px-8">{notice}</span>
          <span className="px-8" aria-hidden="true">{notice}</span>
        </div>
      </div>
    </div>
  );
}
