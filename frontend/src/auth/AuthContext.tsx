import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, clearStoredUser, getStoredUser, setStoredUser } from '../lib/api';
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

  const loginWithGoogleCredential = async (credential: string) => {
    const { data } = await api.post('/auth/google', { credential });
    setStoredUser(JSON.stringify(data.user));
    setUser(data.user);
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* noop */ }
    clearStoredUser();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogleCredential, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
