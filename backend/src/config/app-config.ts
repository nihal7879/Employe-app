// ---------------------------------------------------------------------------
// APP CONFIG — single place to tune business rules for the backend.
//
// Every setting has an env-var override so the values can be changed in
// production without a rebuild. Edit this file's defaults for development,
// or set the matching VAR in the deployment env (see .env / .env.example).
//
// IMPORTANT: a few of these have parallel settings in frontend/src/config/
// app-config.ts (e.g. the day-start window). Keep them in sync OR drive both
// from the same env file at deploy time.
// ---------------------------------------------------------------------------

function envStr(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}
function envNum(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const APP_CONFIG = {
  // -----------------------------------------------------------------------
  // Day-start window
  // -----------------------------------------------------------------------
  // The FIRST Login audit event whose time falls in this window counts as
  // "start of the work day" for that employee. Logins outside the window
  // (midnight auto-refresh, pre-dawn testing) are ignored.
  //
  // Tasks cannot have a start_time earlier than this anchor (the employee
  // wasn't logged in yet).
  dayStart: {
    earliest: envStr('DAY_START_EARLIEST', '08:00:00'), // HH:MM:SS, 24h
    latest:   envStr('DAY_START_LATEST',   '23:59:59'), // HH:MM:SS, 24h
  },

  // -----------------------------------------------------------------------
  // GPS audit
  // -----------------------------------------------------------------------
  // After a Login row is inserted, the frontend keeps trying to capture
  // coordinates and PATCHes them back. The SQL guard only allows a backfill
  // within this many minutes of the original INSERT — anything older is
  // considered abandoned.
  gpsBackfillWindowMinutes: envNum('GPS_BACKFILL_WINDOW_MINUTES', 10),

  // -----------------------------------------------------------------------
  // Auth / JWT
  // -----------------------------------------------------------------------
  // Long expiry is fine — the cookie is a *session* cookie (no maxAge) and
  // the frontend has a 20-min idle logout, so the token is dropped well
  // before this server-side expiry matters in practice.
  jwtExpiresIn: envStr('JWT_EXPIRES_IN', '7d'),
};

export type AppConfig = typeof APP_CONFIG;
