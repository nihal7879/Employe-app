// Browser GPS — asks the user for permission once, caches the result for the session.
// The cached value is attached to every API request as the X-GPS-Location header.

import { APP_CONFIG } from '../config/app-config';

const STORAGE_KEY = 'em_gps';
const STORAGE_TS_KEY = 'em_gps_ts';
const MAX_AGE_MS = APP_CONFIG.gpsCacheMaxAgeMs;

let inFlight: Promise<string | null> | null = null;

// ---------------------------------------------------------------------------
// Observable GPS state — the Navbar badge subscribes to this so users see
// exactly what the location stack is doing (locating / ready / denied / error)
// instead of having to guess from silent failures.
// ---------------------------------------------------------------------------
export type GpsState = 'idle' | 'locating' | 'ready' | 'denied' | 'error' | 'unsupported';

let currentState: GpsState = 'idle';
const stateSubscribers = new Set<(s: GpsState, coords: string | null) => void>();

function emit() {
  const coords = readCache();
  for (const cb of stateSubscribers) {
    try { cb(currentState, coords); } catch { /* swallow */ }
  }
}
function setState(s: GpsState) {
  if (currentState === s) return;
  currentState = s;
  emit();
}
export function getGpsState(): { state: GpsState; coords: string | null } {
  return { state: currentState, coords: readCache() };
}
export function subscribeGpsState(cb: (s: GpsState, coords: string | null) => void): () => void {
  stateSubscribers.add(cb);
  cb(currentState, readCache());
  return () => stateSubscribers.delete(cb);
}

function readCache(): string | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    const t = Number(sessionStorage.getItem(STORAGE_TS_KEY) || 0);
    if (!v) return null;
    if (Date.now() - t > MAX_AGE_MS) return null;
    return v;
  } catch {
    return null;
  }
}

function writeCache(v: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, v);
    sessionStorage.setItem(STORAGE_TS_KEY, String(Date.now()));
  } catch {
    /* sandboxed */
  }
  setState('ready');
}

export function clearGpsCache() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_TS_KEY);
  } catch {
    /* sandboxed */
  }
  if (currentState === 'ready') setState('idle');
}

export function getCachedGps(): string | null {
  return readCache();
}

// Fast permission state check (no getCurrentPosition call). Used to gate login —
// blocks only when the user has explicitly denied location for this site.
// 'granted' and 'prompt' both pass; the prompt resolves in parallel with login.
export async function assertGpsNotDenied(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return;
  if (!('permissions' in navigator)) return;
  try {
    const status = await Promise.race([
      (navigator.permissions as Permissions).query({ name: 'geolocation' as PermissionName }),
      new Promise<PermissionStatus>((_, rej) => setTimeout(() => rej(new Error('perm-timeout')), 500)),
    ]);
    if (status.state === 'denied') {
      clearGpsCache();
      throw new GpsError('denied', DENIED_MESSAGE);
    }
  } catch (e) {
    if (e instanceof GpsError) throw e;
    // Permissions API unsupported / timeout — fall through (allow login).
  }
}

// Trigger the browser's location prompt. Resolves the instant the user picks
// Allow — does NOT wait for the actual coordinates. Coords keep loading in the
// background and land in the cache when ready; subsequent API requests pick
// them up via the X-GPS-Location header. Rejects only if the user picks
// Never allow.
//
// Trade-off accepted: the very first audit row after a fresh "Allow" may have
// gps = NULL if coords haven't landed yet. Every subsequent row gets GPS. The
// alternative (waiting for coords) adds a perceptible delay to login that the
// user has explicitly asked us to avoid.
export function requireLocationGrant(): Promise<void> {
  return new Promise<void>(async (resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return reject(new GpsError('unsupported', 'Your browser does not support location services.'));
    }

    let status: PermissionStatus | null = null;
    if ('permissions' in navigator) {
      try {
        status = await (navigator.permissions as Permissions).query({ name: 'geolocation' as PermissionName });
      } catch { /* fall through */ }
    }

    if (status?.state === 'granted') {
      requestGps().catch(() => null);
      return resolve();
    }
    if (status?.state === 'denied') {
      clearGpsCache();
      return reject(new GpsError('denied', DENIED_MESSAGE));
    }

    // state === 'prompt' (or Permissions API unavailable) — fire the prompt
    // and resolve as soon as the user picks Allow / reject on Never allow.
    let settled = false;
    const settle = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

    if (status) {
      status.onchange = () => {
        if (status!.state === 'granted') settle(() => resolve());
        else if (status!.state === 'denied') {
          clearGpsCache();
          settle(() => reject(new GpsError('denied', DENIED_MESSAGE)));
        }
      };
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const v = `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
        writeCache(v);
        settle(() => resolve());
      },
      (err) => {
        if (err.code === 1) {
          clearGpsCache();
          settle(() => reject(new GpsError('denied', DENIED_MESSAGE)));
        } else {
          settle(() => resolve());
        }
      },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: MAX_AGE_MS },
    );
  });
}

// Quick permission check used to gate mutating API calls (create/update/delete).
// Fails fast if the user has revoked location after signing in. Uses cached
// coords when available so we don't re-prompt on every action; falls back to a
// short getCurrentPosition probe when there's no cache.
export async function ensureGpsForMutate(): Promise<string> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new GpsError('unsupported', 'Your browser does not support location services.');
  }
  if ('permissions' in navigator) {
    try {
      const status = await (navigator.permissions as Permissions).query({ name: 'geolocation' as PermissionName });
      if (status.state === 'denied') {
        clearGpsCache();
        throw new GpsError('denied', DENIED_MESSAGE);
      }
    } catch (e) {
      if (e instanceof GpsError) throw e;
      // Permissions API unavailable — fall through to the position probe.
    }
  }
  const cached = readCache();
  if (cached) return cached;
  return new Promise<string>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const v = `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
        writeCache(v);
        resolve(v);
      },
      (err) => {
        const map: Record<number, GpsErrorReason> = { 1: 'denied', 2: 'unavailable', 3: 'timeout' };
        const reason = map[err.code] || 'unavailable';
        const msg = reason === 'denied' ? DENIED_MESSAGE
          : 'Could not get your location. Please make sure location is turned on and try again.';
        reject(new GpsError(reason, msg));
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: MAX_AGE_MS },
    );
  });
}

// Reason a GPS request can fail. Used by requireGps() so callers can show the right message.
export type GpsErrorReason = 'unsupported' | 'denied' | 'unavailable' | 'timeout';
export class GpsError extends Error {
  reason: GpsErrorReason;
  constructor(reason: GpsErrorReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

// Best-effort. Resolves to "lat,lng" or null. Never throws.
// Used by the axios request interceptor + background refresh — silent failure is OK there.
export function requestGps(): Promise<string | null> {
  const cached = readCache();
  if (cached) { setState('ready'); return Promise.resolve(cached); }
  if (inFlight) return inFlight;
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    setState('unsupported');
    return Promise.resolve(null);
  }

  setState('locating');
  inFlight = new Promise<string | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const v = `${lat},${lng}`;
        writeCache(v); // emits 'ready'
        resolve(v);
      },
      (err) => {
        if (err.code === 1) setState('denied');
        else setState('error');
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: MAX_AGE_MS },
    );
  }).finally(() => { inFlight = null; });

  return inFlight;
}

// Background helper for AuthContext: keep trying to read GPS for up to 60s
// (the server's backfill window is 10 minutes, but in practice coords either
// land within seconds or the device can't get a fix at all). Each attempt
// drives the state machine — so the Navbar badge shows "Locating..." the
// whole time and flips to "Located" the moment we succeed.
export async function pollForGpsCoords(maxWaitMs: number = 60_000): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const coords = await requestGps();
    if (coords) return coords;
    // requestGps already burns ~8s on a failed attempt; wait a bit before
    // retrying so we don't hammer the geolocation provider.
    if (Date.now() - start + 4000 >= maxWaitMs) return null;
    await new Promise((r) => setTimeout(r, 4000));
  }
  return null;
}

export const DENIED_MESSAGE =
  'Location is blocked for this site. Click the 🔒 lock icon next to the URL → Site settings → Location → set to Allow, then reload this page.';

// Strict. Throws a typed GpsError if the browser can't or won't give us coords.
// Used to gate login — refuse to sign the user in without coordinates.
//
// Permission state is always re-validated (the user can revoke between sessions),
// but the actual coordinate read is allowed to use a recent cache: either our
// own sessionStorage value or the browser's internal cache (via maximumAge).
// This keeps login fast for the common case of "logout → log back in".
export async function requireGps(): Promise<string> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new GpsError('unsupported', 'Your browser does not support location services.');
  }

  // Detect prior denial fast. The Permissions API is usually instant, but we
  // race it against a 500ms timeout so a misbehaving browser can never block
  // login. If we time out we just fall through to getCurrentPosition (which
  // itself rejects with PERMISSION_DENIED for blocked users).
  if ('permissions' in navigator) {
    try {
      const status = await Promise.race([
        (navigator.permissions as Permissions).query({ name: 'geolocation' as PermissionName }),
        new Promise<PermissionStatus>((_, rej) => setTimeout(() => rej(new Error('perm-timeout')), 500)),
      ]);
      if (status.state === 'denied') {
        clearGpsCache();
        throw new GpsError('denied', DENIED_MESSAGE);
      }
      if (status.state === 'granted') {
        const cached = readCache();
        if (cached) return cached;
      }
    } catch (e) {
      if (e instanceof GpsError) throw e;
      // Permissions API unsupported or timed out — fall through.
    }
  }

  return new Promise<string>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const v = `${lat},${lng}`;
        writeCache(v);
        resolve(v);
      },
      (err) => {
        const map: Record<number, GpsErrorReason> = { 1: 'denied', 2: 'unavailable', 3: 'timeout' };
        const reason = map[err.code] || 'unavailable';
        const msg =
          reason === 'denied'      ? DENIED_MESSAGE
          : reason === 'timeout'   ? 'Could not get your location in time. Please reload and try again.'
          :                          'Your location is not available right now. Please reload and try again.';
        reject(new GpsError(reason, msg));
      },
      // Accept the browser's own cached fix (up to MAX_AGE_MS old) — avoids the
      // 2–10s satellite/WiFi acquisition delay on every login. The permission
      // re-check above guarantees we still respect a fresh deny.
      { enableHighAccuracy: false, timeout: 8000, maximumAge: MAX_AGE_MS },
    );
  });
}
