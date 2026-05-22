import { GoogleLogin } from '@react-oauth/google';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { BarChart3, Clock, Sparkles, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const { user, loginWithGoogleCredential } = useAuth();
  const nav = useNavigate();

  if (user) return <Navigate to="/" replace />;

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center p-6">
      <motion.div
        className="absolute -top-40 -left-40 h-[40rem] w-[40rem] rounded-full bg-brand-500/15 blur-3xl"
        animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-40 -right-40 h-[40rem] w-[40rem] rounded-full bg-cyan-500/15 blur-3xl"
        animate={{ x: [0, -30, 0], y: [0, -20, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative grid md:grid-cols-2 max-w-5xl w-full gap-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}
          className="hidden md:flex flex-col justify-between card p-10 overflow-hidden"
        >
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-100 text-xs mb-6">
              <Sparkles size={12} /> Employee App · Millicent Technologies
            </div>
            <h1 className="text-4xl font-bold leading-tight">
              Track your day.<br />
              <span className="text-grad">Ship your week.</span>
            </h1>
            <p className="mt-3 text-slate-500">
              Premium daily task tracking, automated 12 PM reports, and analytics that make every hour count.
            </p>
          </div>
          <div className="mt-10 space-y-3">
            {[
              { icon: <Clock size={16} />,       text: 'Auto-emailed daily report at 12:00 PM' },
              { icon: <BarChart3 size={16} />,   text: 'Live productivity & client analytics' },
              { icon: <ShieldCheck size={16} />, text: 'Google SSO · zero passwords' },
            ].map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="flex items-center gap-3 text-sm text-slate-700"
              >
                <span className="h-8 w-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">{f.icon}</span>
                {f.text}
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
          className="card p-10 flex flex-col justify-center"
        >
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 flex items-center justify-center shadow-[0_4px_12px_-2px_rgba(124,58,237,0.45)] mb-6">
            <Sparkles size={22} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold mb-1">Welcome back</h2>
          <p className="text-slate-500 text-sm mb-8">Sign in with the Google account registered by your admin.</p>

          <div className="flex justify-center">
            <GoogleLogin
              theme="outline"
              shape="pill"
              size="large"
              onSuccess={async (resp) => {
                try {
                  await loginWithGoogleCredential(resp.credential || '');
                  toast.success('Signed in');
                  nav('/', { replace: true });
                } catch (e: any) {
                  toast.error(e.response?.data?.message || 'Sign-in failed');
                }
              }}
              onError={() => toast.error('Google sign-in failed')}
            />
          </div>

          <div className="mt-10 pt-6 border-t border-slate-200 text-xs text-slate-500 text-center">
            By signing in you agree to your workspace policies.
          </div>
        </motion.div>
      </div>
    </div>
  );
}
