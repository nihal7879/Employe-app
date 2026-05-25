import { motion } from 'framer-motion';

/** Branded full-screen loader shown while the session is being verified. */
export default function SplashScreen() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 bg-[#F7F8FB] dark:bg-[#0B1020]">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center gap-4"
      >
        {/* MT logo — gently floats */}
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="h-16 w-16 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 flex items-center justify-center text-white font-extrabold text-2xl shadow-[0_12px_30px_-8px_rgba(124,58,237,0.6)]"
        >
          MT
        </motion.div>

        <div className="text-center">
          <div className="text-base font-bold text-slate-900 dark:text-white">Millicent</div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400 font-medium">
            Technologies
          </div>
        </div>
      </motion.div>

      {/* indeterminate progress bar */}
      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
        <motion.div
          className="h-full w-1/3 rounded-full bg-gradient-to-r from-brand-500 to-brand-400"
          animate={{ x: ['-120%', '320%'] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </div>
  );
}
