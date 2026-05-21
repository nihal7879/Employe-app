import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, TrendingDown, TrendingUp } from 'lucide-react';
import AnimatedNumber from './AnimatedNumber';

const accents = {
  brand: 'bg-brand-50 text-brand-600',
  cyan:  'bg-cyan-50 text-cyan-600',
  ok:    'bg-emerald-50 text-emerald-600',
  warn:  'bg-amber-50 text-amber-600',
  bad:   'bg-rose-50 text-rose-600',
  pink:  'bg-pink-50 text-pink-600',
} as const;

const bars = {
  brand: 'from-brand-500/0 via-brand-500/70 to-brand-500/0',
  cyan:  'from-cyan-500/0 via-cyan-500/70 to-cyan-500/0',
  ok:    'from-emerald-500/0 via-emerald-500/70 to-emerald-500/0',
  warn:  'from-amber-500/0 via-amber-500/70 to-amber-500/0',
  bad:   'from-rose-500/0 via-rose-500/70 to-rose-500/0',
  pink:  'from-pink-500/0 via-pink-500/70 to-pink-500/0',
} as const;

type Accent = keyof typeof accents;

export default function StatCard({
  icon, label, value, accent = 'brand', delta, format, to, sub,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  accent?: Accent;
  delta?: number;
  format?: (n: number) => string;
  to?: string;
  sub?: string;
}) {
  const nav = useNavigate();
  const clickable = !!to;
  const positive = (delta ?? 0) >= 0;

  return (
    <motion.div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => nav(to!) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter') nav(to!); } : undefined}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className={`card card-hover relative overflow-hidden group ${clickable ? 'cursor-pointer focus:outline-none focus:ring-4 focus:ring-brand-500/20' : ''}`}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${accents[accent]}`}>
            {icon}
          </div>
          {delta !== undefined && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${positive ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'}`}>
              {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
        </div>

        <div className="mt-5">
          <div className="text-[28px] leading-none font-bold tracking-tight text-slate-900">
            <AnimatedNumber value={value} format={format} />
          </div>
          <div className="mt-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
          {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
        </div>

        {clickable && (
          <div className="absolute top-4 right-4 h-7 w-7 rounded-lg bg-slate-50 group-hover:bg-brand-500 flex items-center justify-center text-slate-400 group-hover:text-white transition-all">
            <ArrowUpRight size={14} />
          </div>
        )}
      </div>

      {/* thin gradient accent bar at the bottom */}
      <div className={`h-[3px] bg-gradient-to-r ${bars[accent]}`} />
    </motion.div>
  );
}
