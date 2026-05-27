import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark';
interface Ctx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
  // Mount-scoped light-mode override (used by Login). Returns a release fn —
  // call it from a useEffect cleanup. Ref-counted so multiple consumers can
  // request the lock simultaneously without stomping each other.
  lockLight: () => () => void;
}
const ThemeCtx = createContext<Ctx>({} as Ctx);
export const useTheme = () => useContext(ThemeCtx);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = localStorage.getItem('em_theme') as Theme | null;
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [lightLocks, setLightLocks] = useState(0);

  // Single source of truth for the html.dark class. Re-runs when either the
  // theme changes OR a light-lock is acquired/released — that's what makes
  // the Login page reliably override dark mode even though React runs child
  // effects before parent effects (the previous DOM-snapshot approach lost
  // that race).
  useEffect(() => {
    const root = document.documentElement;
    if (lightLocks > 0 || theme === 'light') {
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
    }
    // Persist only the user's actual preference, not the override.
    localStorage.setItem('em_theme', theme);
  }, [theme, lightLocks]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  const lockLight = useCallback(() => {
    setLightLocks((c) => c + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setLightLocks((c) => Math.max(0, c - 1));
    };
  }, []);

  return <ThemeCtx.Provider value={{ theme, toggle, setTheme, lockLight }}>{children}</ThemeCtx.Provider>;
}
