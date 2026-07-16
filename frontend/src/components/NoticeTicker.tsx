import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { api } from '../lib/api';

// Govt-website style scrolling notice bar shown at the top of the Dashboard.
// The text is admin-editable (Permissions page → runtime-config `dashboardNotice`);
// an empty notice renders nothing. The text is duplicated inside the marquee so
// the scroll loops seamlessly with no visible gap.
export default function NoticeTicker() {
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api.get('/config')
      .then((r) => setNotice(String(r.data?.dashboardNotice ?? '').trim()))
      .catch(() => {});
  }, []);

  if (!notice) return null;

  return (
    <div className="card overflow-hidden flex items-stretch p-0">
      <div className="flex items-center gap-2 px-4 bg-brand-600 text-white font-semibold text-sm shrink-0">
        <Megaphone size={16} />
        <span className="hidden sm:inline">Notice</span>
      </div>
      <div className="notice-marquee flex-1 overflow-hidden relative py-2.5">
        <div className="notice-marquee-track whitespace-nowrap text-sm text-slate-700 dark:text-slate-200">
          <span className="px-8">{notice}</span>
          <span className="px-8" aria-hidden="true">{notice}</span>
        </div>
      </div>
    </div>
  );
}
