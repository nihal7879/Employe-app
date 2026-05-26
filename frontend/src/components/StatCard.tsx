import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, TrendingDown, TrendingUp } from 'lucide-react';
import AnimatedNumber from './AnimatedNumber';

const accents = {
  brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
  cyan:  'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300',
  ok:    'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  warn:  'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  bad:   'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
  pink:  'bg-pink-50 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300',
} as const;

// Subtle colored left accent per card.
const accentBorder = {
  brand: 'border-l-[3px] border-l-brand-500',
  cyan:  'border-l-[3px] border-l-cyan-500',
  ok:    'border-l-[3px] border-l-emerald-500',
  warn:  'border-l-[3px] border-l-amber-500',
  bad:   'border-l-[3px] border-l-rose-500',
  pink:  'border-l-[3px] border-l-pink-500',
} as const;

// Soft flat color tint per card — not white, no gradient.
const cardBg = {
  brand: 'bg-brand-50/70 dark:bg-brand-500/[0.08]',
  cyan:  'bg-cyan-50/70 dark:bg-cyan-500/[0.08]',
  ok:    'bg-emerald-50/70 dark:bg-emerald-500/[0.08]',
  warn:  'bg-amber-50/70 dark:bg-amber-500/[0.08]',
  bad:   'bg-rose-50/70 dark:bg-rose-500/[0.08]',
  pink:  'bg-pink-50/70 dark:bg-pink-500/[0.08]',
} as const;

// Colored number text per card.
const accentText = {
  brand: 'text-brand-700 dark:text-brand-300',
  cyan:  'text-cyan-700 dark:text-cyan-300',
  ok:    'text-emerald-700 dark:text-emerald-300',
  warn:  'text-amber-700 dark:text-amber-300',
  bad:   'text-rose-700 dark:text-rose-300',
  pink:  'text-pink-700 dark:text-pink-300',
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
      className={`card card-hover relative overflow-hidden group ${cardBg[accent]} ${accentBorder[accent]} ${clickable ? 'cursor-pointer focus:outline-none focus:ring-4 focus:ring-brand-500/20' : ''}`}
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
          <div className={`text-[28px] leading-none font-bold tracking-tight ${accentText[accent]}`}>
            <AnimatedNumber value={value} format={format} />
          </div>
          <div className="mt-2 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">{label}</div>
          {sub && <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{sub}</div>}
        </div>

        {clickable && (
          <div className="absolute top-4 right-4 h-7 w-7 rounded-lg bg-slate-50 dark:bg-white/[0.06] group-hover:bg-brand-500 flex items-center justify-center text-slate-400 dark:text-slate-400 group-hover:text-white transition-all">
            <ArrowUpRight size={14} />
          </div>
        )}
      </div>
    </motion.div>
  );
}
