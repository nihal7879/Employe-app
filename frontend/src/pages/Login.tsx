import { GoogleLogin } from '@react-oauth/google';
import { Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const { user, loginWithGoogleCredential } = useAuth();
  const nav = useNavigate();

  if (user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 p-4">
      <div className="card w-full max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Employee App</h1>
        <p className="text-slate-500 mb-8">Sign in with your Google account to continue</p>
        <div className="flex justify-center">
          <GoogleLogin
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
        <p className="text-xs text-slate-400 mt-6">Use the email registered by your admin.</p>
      </div>
    </div>
  );
}
