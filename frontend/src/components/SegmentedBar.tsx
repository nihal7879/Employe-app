import { motion } from 'framer-motion';

export interface Segment {
  label: string;
  value: number;
  color: string; // tailwind class fragment or hex
}

export default function SegmentedBar({
  segments, height = 14, rounded = true, animate = true,
}: { segments: Segment[]; height?: number; rounded?: boolean; animate?: boolean }) {
  const total = segments.reduce((s, x) => s + (x.value || 0), 0) || 1;
  return (
    <div
      className={`w-full overflow-hidden flex bg-slate-100 dark:bg-white/[0.06] ${rounded ? 'rounded-full' : ''}`}
      style={{ height }}
    >
      {segments.map((s, i) => {
        const w = (s.value / total) * 100;
        if (!w) return null;
        return (
          <motion.div
            key={i}
            initial={animate ? { width: 0 } : undefined}
            animate={{ width: `${w}%` }}
            transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 * i }}
            style={{ background: s.color, width: `${w}%` }}
            title={`${s.label}: ${s.value}`}
          />
        );
      })}
    </div>
  );
}

export function SegmentLegend({ segments }: { segments: Segment[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {segments.map((s, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
          {s.label}
        </div>
      ))}
    </div>
  );
}
