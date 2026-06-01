// ---------------------------------------------------------------------------
// APP CONFIG — single place to tune business rules for the frontend.
//
// All settings can be overridden at build time via Vite env vars (VITE_*) so
// the same build artifact works across dev/staging/prod by swapping .env.
// Edit the defaults in this file for the canonical dev values.
//
// A few of these mirror backend settings (see backend/src/config/
// app-config.ts) — keep them in sync OR drive both from the same env file.
// ---------------------------------------------------------------------------

function envNum(name: string, fallback: number): number {
  const v = (import.meta.env as Record<string, string | undefined>)[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const APP_CONFIG = {
  // -----------------------------------------------------------------------
  // Activity calendar buckets
  // -----------------------------------------------------------------------
  // Hours at or above this count as a "full day" (green in the heatmap).
  fullDayHours: envNum('VITE_FULL_DAY_HOURS', 8),
  // Hours at or above this (but below fullDayHours) count as "partial day"
  // (amber). Below this is "low" (rose).
  halfDayHours: envNum('VITE_HALF_DAY_HOURS', 4),

  // -----------------------------------------------------------------------
  // Idle logout
  // -----------------------------------------------------------------------
  // After this much inactivity (no mousemove / keystroke / scroll / touch),
  // the user is signed out and bounced to /login. Ensures the next visit
  // produces a fresh Login audit event so day-start tracking stays accurate.
  idleLogoutMs: envNum('VITE_IDLE_LOGOUT_MS', 20 * 60 * 1000),

  // -----------------------------------------------------------------------
  // GPS — login + audit
  // -----------------------------------------------------------------------
  // Hard wait after the user clicks Allow on the location prompt. The login
  // POST blocks for up to this long so the audit row's INSERT carries GPS in
  // one shot. Longer = more reliable, but feels slow; shorter = more reliance
  // on the post-login backfill.
  gpsSyncWaitMs: envNum('VITE_GPS_SYNC_WAIT_MS', 12_000),
  // Background safety net: if the sync wait above timed out, keep polling
  // for coordinates for this long and PATCH the login audit row when they
  // arrive. Should be <= backend's gpsBackfillWindowMinutes converted to ms.
  gpsBackfillMaxWaitMs: envNum('VITE_GPS_BACKFILL_MAX_WAIT_MS', 60_000),
  // How long a captured GPS fix stays usable before we re-acquire.
  gpsCacheMaxAgeMs: envNum('VITE_GPS_CACHE_MAX_AGE_MS', 30 * 60 * 1000),

  // -----------------------------------------------------------------------
  // Self-reported public IP (X-Client-Public-IP fallback)
  // -----------------------------------------------------------------------
  publicIpCacheMaxAgeMs: envNum('VITE_PUBLIC_IP_CACHE_MAX_AGE_MS', 60 * 60 * 1000),

  // -----------------------------------------------------------------------
  // Backdated task entry
  // -----------------------------------------------------------------------
  // How many days back an employee with the `allow_backdated_tasks` permission
  // may log. Mirrors the backend's BACKDATE_MAX_DAYS — keep them in sync.
  backdateMaxDays: envNum('VITE_BACKDATE_MAX_DAYS', 7),
};

export type AppConfig = typeof APP_CONFIG;
