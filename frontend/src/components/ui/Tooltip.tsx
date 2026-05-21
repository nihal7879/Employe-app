import { cloneElement, ReactElement, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Tooltip({
  content, children, side = 'top', delay = 200,
}: {
  content: React.ReactNode;
  children: ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}) {
  const [open, setOpen] = useState(false);
  let timer: any;

  const show = () => { clearTimeout(timer); timer = setTimeout(() => setOpen(true), delay); };
  const hide = () => { clearTimeout(timer); setOpen(false); };

  const pos: Record<typeof side, string> = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left:   'right-full top-1/2 -translate-y-1/2 mr-2',
    right:  'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <span className="relative inline-flex"
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      <AnimatePresence>
        {open && (
          <motion.span
            initial={{ opacity: 0, y: side === 'top' ? 2 : -2, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: side === 'top' ? 2 : -2, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className={`absolute z-50 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs whitespace-nowrap shadow-lg pointer-events-none ${pos[side]}`}
          >
            {content}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
