import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import toast from 'react-hot-toast';
import { api, clearStoredUser, getStoredUser, hasInFlightMutations, setStoredUser } from '../lib/api';
import { pollForGpsCoords, requestGps, requireLocationGrant } from '../lib/geolocation';
import { useIdleLogout } from './useIdleLogout';
import { APP_CONFIG } from '../config/app-config';
import type { User } from '../types';

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
      const u = { id: r.data.id, name: r.data.name, email: r.data.email, role: r.data.role };
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

  const loginWithGoogleCredential = async (credential: string) => {
    // Permission prompt only — resolves on Allow click without waiting for
    // actual coordinates. Login is NOT blocked on GPS acquisition; the
    // Navbar badge surfaces "Locating…" while the fix is being captured.
    await requireLocationGrant();

    const { data } = await api.post('/auth/google', { credential });
    setStoredUser(JSON.stringify(data.user));
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

  // Tab close / browser quit → server-side Logout via sendBeacon, which becomes
  // `last_logout` in the calendar.
  //
  // Refresh-vs-close detection — browsers don't tell us directly, so we layer
  // signals. The beacon ONLY fires when ALL of these say "actually closing":
  //
  //   1. event.persisted is false (not going to BFCache)
  //   2. no API mutations are in flight (a click is still being processed)
  //   3. no keyboard refresh combo (F5 / Ctrl+R / Cmd+R / Ctrl+Shift+R) was
  //      pressed in the last 1.5s
  //   4. document.visibilityState was already 'hidden' when pagehide fired.
  //      Refresh fires pagehide while the page is still 'visible'; actual
  //      tab close transitions to 'hidden' first (via visibilitychange).
  //      Tracking the last observed state covers refreshes triggered by the
  //      browser button or right-click → Reload, which don't fire keydown.
  useEffect(() => {
    if (!user) return;
    let refreshIntentAt = 0;
    let lastVisibility: DocumentVisibilityState = document.visibilityState;
    const REFRESH_GRACE_MS = 1500;

    const onKey = (e: KeyboardEvent) => {
      const isF5 = e.key === 'F5';
      const isCtrlR = (e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R');
      if (isF5 || isCtrlR) refreshIntentAt = Date.now();
    };
    const onVisibility = () => {
      lastVisibility = document.visibilityState;
    };
    const onPageHide = (e: PageTransitionEvent) => {
      if (e.persisted) return;
      if (hasInFlightMutations()) return;
      if (Date.now() - refreshIntentAt < REFRESH_GRACE_MS) return;
      // Pull a fresh reading — visibilitychange may have fired in the same
      // event-loop turn as pagehide.
      const visAtHide = document.visibilityState;
      if (visAtHide === 'visible' && lastVisibility === 'visible') return; // refresh / nav, not close
      const url = `${api.defaults.baseURL || ''}/auth/logout`;
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          const blob = new Blob([], { type: 'application/x-www-form-urlencoded' });
          navigator.sendBeacon(url, blob);
          return;
        }
      } catch { /* fall through */ }
      try { fetch(url, { method: 'POST', credentials: 'include', keepalive: true }); } catch { /* swallow */ }
    };

    window.addEventListener('keydown', onKey, { capture: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogleCredential, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
