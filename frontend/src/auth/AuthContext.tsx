import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, clearStoredUser, getStoredUser, setStoredUser } from '../lib/api';
import { requestGps, requireLocationGrant } from '../lib/geolocation';
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
    // Show the location prompt FIRST. requireLocationGrant resolves as soon as
    // the user clicks Allow (does NOT wait for the actual coordinates — those
    // keep loading in the background). Rejects on Never allow.
    await requireLocationGrant();
    const { data } = await api.post('/auth/google', { credential });
    setStoredUser(JSON.stringify(data.user));
    setUser(data.user);

    // Background: as soon as coords land in cache, send them to the backend
    // so the just-created Login audit row is updated. Never blocks the UI —
    // login is already done by this point.
    requestGps()
      .then((gps) => { if (gps) return api.patch('/audit/login/backfill-gps', { gps }); })
      .catch(() => null);
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* noop */ }
    clearStoredUser();
    // Note: GPS cache is intentionally preserved. Permission state is re-checked
    // on every login, so stale coords can't bypass a revoke; keeping the cache
    // avoids the 2–10s reacquisition delay on logout → log back in.
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogleCredential, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
