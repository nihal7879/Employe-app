import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, MapPinOff, Loader2 } from 'lucide-react';
import {
  type GpsState,
  getGpsState,
  requestGps,
  subscribeGpsState,
} from '../lib/geolocation';

// Live indicator in the Navbar showing what the location stack is doing.
// Subscribes to the geolocation module's state machine — flips from
// "Locating" to "Located" the moment coords land, so the user can see that
// fraud-detection telemetry is actually being captured (not silently failing).
export default function GpsStatusBadge() {
  const [{ state, coords }, setSnapshot] = useState<{ state: GpsState; coords: string | null }>(() => getGpsState());

  useEffect(() => {
    return subscribeGpsState((s, c) => setSnapshot({ state: s, coords: c }));
  }, []);

  // Hide the badge once we've been in "ready" for a few seconds — it's just
  // visual noise after that. Re-shows automatically if state regresses.
  const [hideReady, setHideReady] = useState(false);
  useEffect(() => {
    if (state !== 'ready') { setHideReady(false); return; }
    const t = setTimeout(() => setHideReady(true), 5000);
    return () => clearTimeout(t);
  }, [state, coords]);

  if (state === 'ready' && hideReady) return null;
  if (state === 'idle') return null;

  const onRetry = () => { void requestGps(); };

  let icon: React.ReactNode;
  let label: string;
  let tone: string;
  let title: string;
  let clickable = false;

  switch (state) {
    case 'locating':
      icon = <Loader2 size={14} className="animate-spin" />;
      label = 'Locating…';
      tone = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30';
      title = 'Fetching your GPS coordinates';
      break;
    case 'ready':
      icon = <MapPin size={14} />;
      label = 'Located';
      tone = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30';
      title = coords ? `Location: ${coords}` : 'Location ready';
      break;
    case 'denied':
      icon = <MapPinOff size={14} />;
      label = 'Location blocked';
      tone = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-500/30';
      title = 'Location is blocked for this site. Enable it in your browser settings.';
      break;
    case 'error':
      icon = <MapPinOff size={14} />;
      label = 'No GPS · retry';
      tone = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-500/30';
      title = 'Could not get GPS. Click to try again.';
      clickable = true;
      break;
    case 'unsupported':
      icon = <MapPinOff size={14} />;
      label = 'No GPS';
      tone = 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/[0.06] dark:text-slate-300 dark:border-white/10';
      title = 'This browser does not support geolocation.';
      break;
    default:
      return null;
  }

  return (
    <AnimatePresence>
      <motion.button
        type="button"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.18 }}
        onClick={clickable ? onRetry : undefined}
        title={title}
        disabled={!clickable}
        className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium ${tone} ${clickable ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`}
      >
        {icon}
        <span className="leading-none">{label}</span>
      </motion.button>
    </AnimatePresence>
  );
}
