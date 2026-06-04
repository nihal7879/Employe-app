import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

// Landing page for the Google OAuth popup. The backend passport callback set
// the auth cookie and redirected here with ?status=success|error. Inside the
// popup we relay the result to the opener and close. If somehow opened in a
// normal tab (no opener), fall back to navigating into the app.
export default function AuthCallback() {
  const [params] = useSearchParams();
  const nav = useNavigate();

  useEffect(() => {
    const status = params.get('status') === 'success' ? 'success' : 'error';
    if (window.opener && window.opener !== window) {
      try { window.opener.postMessage({ type: 'app-auth', status }, window.location.origin); } catch { /* ignore */ }
      window.close();
    } else {
      nav(status === 'success' ? '/' : '/login', { replace: true });
    }
  }, [params, nav]);

  return (
    <div className="h-screen w-full flex items-center justify-center text-sm text-slate-500">
      Completing sign-in…
    </div>
  );
}
