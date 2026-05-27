import { useEffect, useRef } from 'react';

// Pointer/keyboard/touch events count as "user activity" — any of them resets
// the idle timer. mousemove is throttled via timestamp comparison so we're not
// doing work on every pixel.
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'wheel'] as const;

// Idle-logout: when the page sees no user activity for `timeoutMs`, fire
// `onIdle` once. Returning from a background tab also triggers the check —
// browsers throttle setTimeout in hidden tabs, so we recompute elapsed time
// from a stored timestamp instead of trusting the timer alone.
export function useIdleLogout({
  enabled,
  timeoutMs,
  onIdle,
}: {
  enabled: boolean;
  timeoutMs: number;
  onIdle: () => void;
}) {
  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const onIdleRef = useRef(onIdle);
  // Keep latest onIdle without re-binding listeners on every render.
  useEffect(() => { onIdleRef.current = onIdle; }, [onIdle]);

  useEffect(() => {
    if (!enabled) return;
    firedRef.current = false;
    lastActivityRef.current = Date.now();

    const fireOnce = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      try { onIdleRef.current(); } catch { /* swallow */ }
    };

    const arm = () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(fireOnce, timeoutMs);
    };

    const onActivity = () => {
      if (firedRef.current) return;
      lastActivityRef.current = Date.now();
      arm();
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= timeoutMs) {
        fireOnce();
        return;
      }
      arm();
    };

    arm();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, timeoutMs]);
}
