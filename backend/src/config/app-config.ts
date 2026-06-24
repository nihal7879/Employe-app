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
//
// LIVE-EDITABLE: every setting below is read from `backend/runtime-config.json`
// on each use. Editing that JSON file takes effect immediately — no rebuild and
// no restart. It's plain JSON (not TS), so nothing recompiles; the change is
// picked up the next time the value is read (the file is re-read only when its
// modified-time changes). Env vars act only as the fallback when a key is
// missing from the file; the hard-coded defaults are the final fallback.
// (Caveat: jwtExpiresIn is consumed at startup, so it's effectively
// restart-only in practice — see its note below.)
// ---------------------------------------------------------------------------

import { readFileSync, statSync, writeFileSync } from 'fs';
import { resolve } from 'path';

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

// Resolved against the process working directory — the backend folder, the
// same place .env is loaded from when you run the server.
const RUNTIME_CONFIG_PATH = resolve(process.cwd(), 'runtime-config.json');

// Parsed contents of runtime-config.json, re-read only when the file's mtime
// changes. This makes edits live (no restart) without a disk read per call.
let _rcCache: { mtimeMs: number; data: Record<string, unknown> } | null = null;
function readRuntimeConfig(): Record<string, unknown> {
  try {
    const { mtimeMs } = statSync(RUNTIME_CONFIG_PATH);
    if (!_rcCache || _rcCache.mtimeMs !== mtimeMs) {
      _rcCache = { mtimeMs, data: JSON.parse(readFileSync(RUNTIME_CONFIG_PATH, 'utf8')) };
    }
    return _rcCache.data;
  } catch {
    return {}; // file missing or malformed → fall back to env/default
  }
}

// Merge a patch into runtime-config.json and write it back. Used by the admin
// config endpoint so business rules can be tuned from the UI (no rebuild, no
// restart). The cache is invalidated so the next read picks up the new value.
export function writeRuntimeConfig(patch: Record<string, unknown>): void {
  const current = (() => {
    try { return JSON.parse(readFileSync(RUNTIME_CONFIG_PATH, 'utf8')); } catch { return {}; }
  })();
  const next = { ...current, ...patch };
  writeFileSync(RUNTIME_CONFIG_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8');
  _rcCache = null; // force a re-read on next access
}

// Precedence (both helpers): runtime-config.json value → env var → fallback.
function runtimeNum(key: string, envName: string, fallback: number): number {
  const raw = readRuntimeConfig()[key];
  const n = Number(raw);
  if (raw !== undefined && raw !== null && raw !== '' && Number.isFinite(n)) return n;
  return envNum(envName, fallback);
}
function runtimeStr(key: string, envName: string, fallback: string): string {
  const raw = readRuntimeConfig()[key];
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return envStr(envName, fallback);
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
  // wasn't logged in yet) — minus the loginGraceMinutes window below.
  // LIVE-EDITABLE via dayStartEarliest / dayStartLatest in runtime-config.json.
  dayStart: {
    get earliest(): string { return runtimeStr('dayStartEarliest', 'DAY_START_EARLIEST', '08:00:00'); }, // HH:MM:SS, 24h
    get latest(): string { return runtimeStr('dayStartLatest', 'DAY_START_LATEST', '23:59:59'); },       // HH:MM:SS, 24h
  },

  // -----------------------------------------------------------------------
  // Login grace window
  // -----------------------------------------------------------------------
  // How many minutes BEFORE their first login an employee may still log a
  // task for. The floor enforced by the start-time guard is
  // (first-login − this). Example: someone who logs in at 11:00 with a 120-min
  // grace can log tasks back to 09:00. Set to 0 to require start_time >= login.
  //
  // LIVE-EDITABLE: change `loginGraceMinutes` in backend/runtime-config.json
  // and save — it takes effect on the next task entry with NO rebuild and NO
  // restart. The day-start API returns the already-adjusted floor, so the
  // frontend needs no rebuild either. (LOGIN_GRACE_MINUTES env / this number
  // are only the fallback used when the JSON file is absent.)
  get loginGraceMinutes(): number {
    return runtimeNum('loginGraceMinutes', 'LOGIN_GRACE_MINUTES', 120);
  },

  // -----------------------------------------------------------------------
  // Backdated task entry
  // -----------------------------------------------------------------------
  // Employees normally log tasks for *today* only. An admin can grant the
  // `allow_backdated_tasks` permission per employee; when granted, they may
  // log for past dates up to this many days back (never the future).
  // LIVE-EDITABLE via backdateMaxDays in runtime-config.json. NOTE: the
  // frontend date-picker mirrors this from VITE_BACKDATE_MAX_DAYS (baked at
  // build time), so the backend rule updates live but the picker's min date
  // only changes after a frontend rebuild.
  get backdateMaxDays(): number { return runtimeNum('backdateMaxDays', 'BACKDATE_MAX_DAYS', 7); },

  // -----------------------------------------------------------------------
  // Max task duration
  // -----------------------------------------------------------------------
  // The longest a single task may be, in hours. Users are expected to split
  // longer work into multiple entries (keeps the timeline granular). Enforced
  // server-side in create/update; the frontend mirrors it for instant feedback.
  // LIVE-EDITABLE via maxTaskHours in runtime-config.json.
  get maxTaskHours(): number { return runtimeNum('maxTaskHours', 'MAX_TASK_HOURS', 1.5); },

  // -----------------------------------------------------------------------
  // GPS audit
  // -----------------------------------------------------------------------
  // After a Login row is inserted, the frontend keeps trying to capture
  // coordinates and PATCHes them back. The SQL guard only allows a backfill
  // within this many minutes of the original INSERT — anything older is
  // considered abandoned.
  // LIVE-EDITABLE via gpsBackfillWindowMinutes in runtime-config.json.
  get gpsBackfillWindowMinutes(): number { return runtimeNum('gpsBackfillWindowMinutes', 'GPS_BACKFILL_WINDOW_MINUTES', 10); },

  // -----------------------------------------------------------------------
  // Auth / JWT
  // -----------------------------------------------------------------------
  // Long expiry is fine — the cookie is a *session* cookie (no maxAge) and
  // the frontend has a 20-min idle logout, so the token is dropped well
  // before this server-side expiry matters in practice.
  // LIVE-EDITABLE via jwtExpiresIn in runtime-config.json — but note it's read
  // when the JWT module is set up at startup, so a change only affects tokens
  // signed after the next restart, not already-issued ones.
  get jwtExpiresIn(): string { return runtimeStr('jwtExpiresIn', 'JWT_EXPIRES_IN', '7d'); },

  // -----------------------------------------------------------------------
  // Shared Google logins → multiple employee identities
  // -----------------------------------------------------------------------
  // Some people share ONE Google sign-in account (e.g. a single
  // frontend.developer@ mailbox used by two developers whose own aliases
  // can't be turned into separate Google accounts). Map that login email to
  // the employee IDs that share it; when someone signs in with that email the
  // app forces a "who are you?" identity picker and issues the session for the
  // chosen employee, so each person's tasks/attendance stay separate. No DB
  // change needed — the members are existing employee rows.
  // LIVE-EDITABLE via `sharedLogins` in runtime-config.json, e.g.:
  //   "sharedLogins": { "frontend.developer@millicent.in": [9, 10] }
  get sharedLogins(): Record<string, number[]> {
    const raw = readRuntimeConfig()['sharedLogins'];
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, number[]>;
    }
    return {};
  },
};

export type AppConfig = typeof APP_CONFIG;
