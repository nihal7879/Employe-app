// Browser GPS — asks the user for permission once, caches the result for the session.
// The cached value is attached to every API request as the X-GPS-Location header.

const STORAGE_KEY = 'em_gps';
const STORAGE_TS_KEY = 'em_gps_ts';
const MAX_AGE_MS = 30 * 60 * 1000; // refresh every 30 min

let inFlight: Promise<string | null> | null = null;

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
}

export function clearGpsCache() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_TS_KEY);
  } catch {
    /* sandboxed */
  }
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

// Trigger the browser's location prompt and resolve as soon as the user picks
// Allow (resolves) or Never allow (rejects). Does NOT wait for the actual
// coordinates — those continue acquiring in the background and are written to
// the GPS cache when ready. This keeps login fast while still gating on the
// user's choice.
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
      // Already allowed — fire background fetch and resolve instantly.
      requestGps().catch(() => null);
      return resolve();
    }
    if (status?.state === 'denied') {
      clearGpsCache();
      return reject(new GpsError('denied', DENIED_MESSAGE));
    }

    // state === 'prompt' (or Permissions API unavailable) — show the dialog.
    // Resolve/reject as soon as the user picks; coords keep loading in the
    // background and land in the cache via the getCurrentPosition callback.
    let settled = false;
    const settle = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

    if (status) {
      status.onchange = () => {
        if (settled) return;
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
          // Don't block login on a transient unavailable/timeout when the
          // Permissions API can't tell us the user clicked Allow. Resolve so
          // login proceeds; the audit row's gps stays NULL for this request.
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
  if (cached) return Promise.resolve(cached);
  if (inFlight) return inFlight;
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);

  inFlight = new Promise<string | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const v = `${lat},${lng}`;
        writeCache(v);
        resolve(v);
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: MAX_AGE_MS },
    );
  }).finally(() => { inFlight = null; });

  return inFlight;
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
