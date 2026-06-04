import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import toast from 'react-hot-toast';
import { api, clearStoredUser, getStoredUser, setStoredUser, hasInFlightMutations } from '../lib/api';
import { pollForGpsCoords, requestGps, requireLocationGrant } from '../lib/geolocation';
import { useIdleLogout } from './useIdleLogout';
import { APP_CONFIG } from '../config/app-config';
import type { User } from '../types';

// Cross-tab "is anyone alive" marker. Every open tab writes the current
// timestamp to localStorage every SESSION_ALIVE_INTERVAL_MS; on AuthProvider
// mount we check the last write. If it's older than SESSION_ALIVE_STALE_MS
// (i.e. no tab has been alive for that long), the user has fully closed the
// app → force logout + redirect to /login.
//
// Why this beats pagehide-based detection:
//   • Refresh: the tab unloads briefly then re-mounts. Last marker is still
//     well within the stale window → no logout.
//   • Tab close (sole tab): marker stops being refreshed; once the user opens
//     the app again, the saved timestamp is past the stale window → logout.
//   • Multiple tabs: any alive tab keeps the marker fresh, so closing one tab
//     doesn't sign the user out of the others. When the LAST tab is closed,
//     the marker goes stale and the next visit logs out.
//
// SESSION_ALIVE_STALE_MS is set comfortably larger than the worst-case reload
// duration to avoid false positives on slow refreshes.
const SESSION_ALIVE_KEY = 'em_tab_alive';
const SESSION_ALIVE_INTERVAL_MS = 5_000;
const SESSION_ALIVE_STALE_MS    = 30_000;

interface AuthState {
  user: User | null;
  loading: boolean;
  loginWithGoogleCredential: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({} as AuthState);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getStoredUser();
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch { /* noop */ }
    }
    // Verify the cookie is still valid (silently)
    api.get('/auth/me').then((r) => {
      const u = {
        id: r.data.id, name: r.data.name, email: r.data.email, role: r.data.role,
        allow_backdated_tasks: !!r.data.allow_backdated_tasks,
        allow_log_anytime: !!r.data.allow_log_anytime,
      };
      setUser(u);
      setStoredUser(JSON.stringify(u));
    }).catch(() => {
      clearStoredUser();
      setUser(null);
    }).finally(() => setLoading(false));
  }, []);

  // Fire the location prompt only AFTER a user is authenticated. Covers both
  // first-time sign-in (setUser from loginWithGoogleCredential) and returning
  // sessions (setUser from /auth/me). Runs in the background — never blocks
  // the UI. The user sees the dashboard first; the permission dialog appears
  // alongside it.
  useEffect(() => {
    if (user) requestGps().catch(() => null);
  }, [user]);

  // Record a server-side Logout the instant the browser/tab is actually closed
  // (or the user navigates away). `pagehide` fires reliably on real close —
  // unlike an async axios call, which the browser cancels mid-unload — so we
  // use navigator.sendBeacon to a dedicated /auth/logout-beacon endpoint that
  // logs the Logout audit row WITHOUT clearing the auth cookie.
  //
  //   • Refresh also fires pagehide → an extra Logout row, but the audit
  //     day-bounds query takes MAX(Logout) per day, so the real close always
  //     supersedes it. Skipped when a write is in flight (the user just clicked
  //     a button — not leaving) and when the page is frozen into the bfcache
  //     (event.persisted) rather than truly destroyed.
  //   • Armed only while signed in.
  useEffect(() => {
    if (!user) return;
    const onPageHide = (e: PageTransitionEvent) => {
      if (e.persisted) return;            // frozen into bfcache, not closed
      if (hasInFlightMutations()) return; // mid-write → not actually leaving
      try {
        const base = import.meta.env.VITE_API_URL || 'http://localhost:4000';
        navigator.sendBeacon(`${base}/auth/logout-beacon`, new Blob([], { type: 'text/plain' }));
      } catch { /* sendBeacon unsupported / blocked — nothing else to do here */ }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [user]);

  const loginWithGoogleCredential = async (credential: string) => {
    // Permission prompt only — resolves on Allow click without waiting for
    // actual coordinates. Login is NOT blocked on GPS acquisition; the
    // Navbar badge surfaces "Locating…" while the fix is being captured.
    await requireLocationGrant();

    const { data } = await api.post('/auth/google', { credential });
    setStoredUser(JSON.stringify(data.user));
    // Refresh the cross-tab alive marker BEFORE setUser so the stale-check
    // effect (below) doesn't see a leftover marker from a previous session
    // (e.g. yesterday's, after an overnight browser close) and immediately
    // force-logout this brand-new sign-in. Without this, the first login of
    // the day bounces straight back to /login and only the second succeeds.
    try { localStorage.setItem(SESSION_ALIVE_KEY, String(Date.now())); } catch { /* noop */ }
    setUser(data.user);

    // Background: poll for coords up to the configured window and PATCH the
    // just-created Login audit row when they land. Server's backfill SQL
    // guard (created_at within N minutes, gps IS NULL) makes late writes
    // safe. UI is never blocked by this.
    void (async () => {
      const gps = await pollForGpsCoords(APP_CONFIG.gpsBackfillMaxWaitMs);
      if (!gps) return;
      try { await api.patch('/audit/login/backfill-gps', { gps }); } catch { /* ignore */ }
    })();
  };

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* noop */ }
    clearStoredUser();
    // Drop the cross-tab alive marker so the next mount doesn't see a stale
    // value and immediately fire the "session ended" toast again.
    try { localStorage.removeItem(SESSION_ALIVE_KEY); } catch { /* noop */ }
    // Note: GPS cache is intentionally preserved. Permission state is re-checked
    // on every login, so stale coords can't bypass a revoke; keeping the cache
    // avoids the 2–10s reacquisition delay on logout → log back in.
    setUser(null);
  }, []);

  // Idle logout: 20 min of no activity → toast + logout + redirect to /login.
  // Only armed while a user is signed in.
  const onIdle = useCallback(() => {
    toast('You were signed out after 20 min of inactivity. Please sign in again.', { icon: '⏱️', duration: 6000 });
    void logout().finally(() => {
      // Hard redirect so any in-flight requests fail cleanly and the splash
      // screen / ProtectedRoute logic runs against a fresh load.
      if (typeof window !== 'undefined') window.location.assign('/login');
    });
  }, [logout]);
  useIdleLogout({ enabled: !!user, timeoutMs: APP_CONFIG.idleLogoutMs, onIdle });

  // Tab-alive marker check on mount. If the saved timestamp is older than
  // SESSION_ALIVE_STALE_MS, all tabs were closed since the last write → force
  // logout. Otherwise this tab takes over and keeps the marker fresh on a
  // 5-second interval. Refresh re-runs this effect quickly enough that the
  // marker is never stale; closing the last tab stops the interval and the
  // next visit sees a stale value.
  const [didStaleCheck, setDidStaleCheck] = useState(false);
  useEffect(() => {
    if (!user) return;

    if (!didStaleCheck) {
      setDidStaleCheck(true);
      try {
        const last = Number(localStorage.getItem(SESSION_ALIVE_KEY) || 0);
        if (last > 0 && Date.now() - last > SESSION_ALIVE_STALE_MS) {
          // No tab kept the marker fresh recently → user closed every tab.
          toast('Session ended (tab was closed). Please sign in again.', { icon: '🔒', duration: 5000 });
          void logout().finally(() => {
            if (typeof window !== 'undefined') window.location.assign('/login');
          });
          return;
        }
      } catch { /* localStorage unavailable — skip the gate */ }
    }

    const beat = () => {
      try { localStorage.setItem(SESSION_ALIVE_KEY, String(Date.now())); } catch { /* noop */ }
    };
    beat();
    const id = window.setInterval(beat, SESSION_ALIVE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [user, didStaleCheck, logout]);

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogleCredential, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
