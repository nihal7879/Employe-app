import { GoogleLogin } from '@react-oauth/google';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { ShieldCheck, Check, Rocket, Sparkles, Clock, UserCircle2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth, type IdentitySelection } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import illustration from '../assets/login-illustration.svg';

export default function Login() {
  const { user, loginWithGoogleCredential, selectIdentity } = useAuth();
  const { lockLight } = useTheme();
  const nav = useNavigate();
  // Set when a shared Google account signs in — drives the compulsory picker.
  const [pending, setPending] = useState<IdentitySelection | null>(null);
  const [selecting, setSelecting] = useState<number | null>(null);

  // Login is always light. lockLight() ref-counts a light-mode override on
  // ThemeProvider so the dark class can't get re-applied after we strip it
  // (which is what was happening when the user's OS / saved pref was dark).
  useEffect(() => lockLight(), [lockLight]);

  if (user) return <Navigate to="/" replace />;

  const pickIdentity = async (id: number) => {
    if (!pending || selecting != null) return;
    setSelecting(id);
    try {
      await selectIdentity(pending.selectionToken, id);
      toast.success('Signed in');
      nav('/', { replace: true });
    } catch (e: any) {
      setSelecting(null);
      if (e?.isNetworkError) return;
      // Selection token expired or rejected → make them sign in again.
      if (e?.response?.status === 401) {
        setPending(null);
        toast.error('Selection expired — please sign in again.');
        return;
      }
      toast.error(e.response?.data?.message || 'Could not continue');
    }
  };

  return (
    <div className="relative h-screen w-full overflow-hidden lg:grid lg:grid-cols-[1.1fr_1fr] bg-[#F7F8FB] dark:bg-[#0B1020]">
      {/* ============ LEFT — brand panel with image ============ */}
      <motion.div
        animate={{ backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
        className="relative hidden lg:flex flex-col justify-between overflow-hidden px-12 xl:px-14 py-9 text-white bg-gradient-to-br from-brand-600 via-brand-700 to-brand-800 bg-[length:180%_180%]"
      >
        {/* soft decorative purple blobs (single colour) */}
        <motion.div
          animate={{ x: [0, 24, 0], y: [0, 18, 0] }} transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
          className="pointer-events-none absolute -top-24 -left-20 h-[28rem] w-[28rem] rounded-full bg-white/10 blur-3xl"
        />
        <motion.div
          animate={{ x: [0, -20, 0], y: [0, -16, 0] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="pointer-events-none absolute -bottom-28 -right-16 h-[26rem] w-[26rem] rounded-full bg-brand-900/40 blur-3xl"
        />

        {/* brand */}
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="relative flex items-center gap-3"
        >
          <div className="h-11 w-11 rounded-2xl bg-white/15 ring-1 ring-white/25 flex items-center justify-center font-extrabold tracking-tight">
            MT
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">Millicent</div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/70 font-medium">Technologies</div>
          </div>
        </motion.div>

        {/* ===== hero collage (contained, responsive stage) ===== */}
        <div className="relative flex-1 min-h-0 flex items-center justify-center my-1">
          <div className="relative w-full max-w-[26rem] max-h-full aspect-square mx-auto flex items-center justify-center">
            {/* decorative organic blobs behind */}
            <div className="absolute left-[10%] top-[8%] h-[72%] w-[72%] rounded-[60%_40%_55%_45%/55%_45%_60%_40%] bg-brand-400/45 blur-2xl" />
            <div className="absolute right-[6%] bottom-[10%] h-[58%] w-[58%] rounded-[45%_55%_45%_55%/50%_45%_55%_50%] bg-brand-300/35 blur-2xl" />

            {/* central illustration on a soft white blob */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1, y: [0, -8, 0] }}
              transition={{ opacity: { duration: 0.6 }, scale: { duration: 0.6 }, y: { duration: 8, repeat: Infinity, ease: 'easeInOut' } }}
              className="relative z-10 rounded-[42%_58%_55%_45%/52%_46%_54%_48%] bg-white/95 p-4 shadow-[0_30px_70px_-25px_rgba(0,0,0,0.5)]"
            >
              <img
                src={illustration}
                alt="Track and report your work"
                className="w-[58%] min-w-[11rem] max-w-[16rem] h-auto object-contain select-none pointer-events-none"
                draggable={false}
              />
            </motion.div>

            {/* floating UI cards — percentage positions so they scale with the stage */}
            <Float className="left-[-20%] top-[27%] z-20" delay={0.30} dur={6} dy={10}>
              <div className="rounded-2xl bg-white shadow-xl px-3.5 py-2.5 flex items-center gap-2.5">
                <Clock size={15} className="text-brand-600" />
                <div>
                  <div className="text-[11px] font-semibold text-slate-900 tabular-nums">9:00 am – 4:10 pm</div>
                  <div className="text-[10px] text-slate-400">Today's tracked</div>
                </div>
                <span className="ml-1 text-[10px] font-bold text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded-md">92%</span>
              </div>
            </Float>

            <Float className="right-[-8%] top-[3%] z-20" delay={0.45} dur={7} dy={12}>
              <div className="w-44 rounded-2xl bg-white shadow-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-900">Design Review</span>
                  <span className="text-[10px] font-mono text-brand-600 tabular-nums">01:57:59</span>
                </div>
                <div className="mt-2.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-brand-500 to-brand-400" />
                </div>
                <div className="text-[10px] text-slate-400 mt-1.5">Today · <span className="font-semibold text-slate-700">8:57</span></div>
              </div>
            </Float>

            <Float className="left-[-4%] bottom-[10%] z-20" delay={0.60} dur={6.5} dy={9}>
              <div className="rounded-2xl bg-white shadow-xl p-3">
                <div className="flex items-end gap-1 h-10">
                  {[40, 65, 52, 80, 95].map((h, i) => (
                    <span key={i} style={{ height: `${h}%` }} className="w-2 rounded-full bg-gradient-to-t from-brand-500 to-brand-300" />
                  ))}
                </div>
                <div className="text-[10px] text-slate-400 mt-1.5">Weekly hours ↑</div>
              </div>
            </Float>

            {/* check badge */}
            <Float className="left-[46%] bottom-[1%] z-20" delay={0.70} dur={5} dy={8}>
              <div className="h-9 w-9 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg ring-4 ring-white/40">
                <Check size={16} strokeWidth={3} />
              </div>
            </Float>

            {/* rocket */}
            <Float className="left-[34%] top-[-3%] z-20" delay={0.25} dur={5.5} dy={12}>
              <div className="h-10 w-10 rounded-2xl bg-white shadow-lg flex items-center justify-center -rotate-12">
                <Rocket size={18} className="text-brand-600" />
              </div>
            </Float>

            {/* sparkles */}
            <Float className="right-[4%] bottom-[18%] z-20" delay={0.50} dur={4.5} dy={7}>
              <Sparkles size={20} className="text-white/80" />
            </Float>
            <Float className="right-[30%] top-[2%] z-20" delay={0.85} dur={5} dy={6}>
              <Sparkles size={14} className="text-white/60" />
            </Float>
          </div>
        </div>

        {/* compact tagline */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
          className="relative"
        >
          <h2 className="text-3xl xl:text-4xl font-bold leading-tight max-w-md">
            Track your day.<br />Ship your week.
          </h2>
          <p className="mt-3 text-white/80 max-w-sm text-sm">
            Time tracking, automated reports, and live analytics — for the whole team.
          </p>
        </motion.div>
      </motion.div>

      {/* ============ RIGHT — sign in ============ */}
      <div className="relative flex items-center justify-center p-5 sm:p-10 h-full">
        {/* mobile-only soft brand accents */}
        <div className="lg:hidden pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-brand-400/25 dark:bg-brand-500/20 blur-3xl" />
          <div className="absolute -bottom-24 -right-10 h-64 w-64 rounded-full bg-brand-300/20 dark:bg-brand-600/15 blur-3xl" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-sm bg-white dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 rounded-3xl shadow-[0_24px_60px_-28px_rgba(15,23,42,0.30)] p-6 sm:p-9 lg:bg-transparent lg:border-0 lg:shadow-none lg:p-0"
        >
          {/* logo (prominent on mobile) */}
          <div className="flex justify-center lg:hidden mb-6">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 flex items-center justify-center text-white font-extrabold text-lg shadow-[0_8px_22px_-6px_rgba(124,58,237,0.5)]">
              MT
            </div>
          </div>

          <div className="text-center lg:text-left">
            <div className="text-[11px] uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300 font-semibold">
              Welcome back
            </div>
            <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              Sign in to your workspace
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Use the Google account registered by your admin.
            </p>
          </div>

          <div className="mt-8 flex justify-center lg:justify-start">
            <GoogleLogin
              theme="outline"
              shape="rectangular"
              size="large"
              text="continue_with"
              logo_alignment="center"
              onSuccess={async (resp) => {
                try {
                  const result = await loginWithGoogleCredential(resp.credential || '');
                  // Shared Google account → must pick an identity before entering.
                  if (result?.needsSelection) {
                    setPending(result);
                    return;
                  }
                  toast.success('Signed in');
                  nav('/', { replace: true });
                } catch (e: any) {
                  if (e?.isNetworkError) return;       // server unreachable — interceptor toast
                  if (e?.reason) {                      // GpsError — user picked Never allow
                    toast.error(e.message, { duration: 8000 });
                    return;
                  }
                  toast.error(e.response?.data?.message || 'Sign-in failed');
                }
              }}
              onError={() => toast.error('Google sign-in failed')}
            />
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/10 flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
            <ShieldCheck size={13} /> Secured by Google · single sign-on
          </div>

          <p className="mt-6 text-xs text-slate-400 dark:text-slate-500 text-center lg:text-left">
            Need access? Ask your admin to register your email.
          </p>
        </motion.div>
      </div>

      {/* Compulsory identity picker — shown only when a shared Google account
          signs in. No close button and a non-dismissible backdrop: the user
          MUST pick who they are before entering, so their data stays separate. */}
      <AnimatePresence>
        {pending && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-sm rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200 p-6"
            >
              <div className="flex flex-col items-center text-center">
                <div className="h-12 w-12 rounded-2xl bg-brand-500/15 text-brand-600 flex items-center justify-center">
                  <UserCircle2 size={24} />
                </div>
                <h2 className="mt-4 text-lg font-bold text-slate-900">Who's signing in?</h2>
                <p className="mt-1.5 text-sm text-slate-500">
                  This account is shared. Pick your name so your tasks and time are logged to you.
                </p>
              </div>

              <div className="mt-6 space-y-2.5">
                {pending.options.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => pickIdentity(o.id)}
                    disabled={selecting != null}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-slate-200 hover:border-brand-400 hover:bg-brand-50/60 text-left transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <span className="h-10 w-10 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center shrink-0">
                      {o.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-900 truncate">{o.name}</span>
                      <span className="block text-xs text-slate-400 truncate">{o.email}</span>
                    </span>
                    {selecting === o.id && (
                      <span className="ml-auto h-4 w-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Float({ children, className = '', delay = 0, dur = 6, dy = 10 }: {
  children: ReactNode; className?: string; delay?: number; dur?: number; dy?: number;
}) {
  return (
    <motion.div
      className={`absolute ${className}`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1, y: [0, -dy, 0] }}
      transition={{
        opacity: { duration: 0.5, delay }, scale: { duration: 0.5, delay },
        y: { duration: dur, repeat: Infinity, ease: 'easeInOut', delay },
      }}
    >
      {children}
    </motion.div>
  );
}
