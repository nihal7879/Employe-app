import axios from 'axios';
import toast from 'react-hot-toast';
import { ensureGpsForMutate, getCachedGps, GpsError } from './geolocation';
import { discoverPublicIp, getCachedPublicIp } from './publicIp';

// Kick off public IP discovery in the background as soon as the module loads.
// Subsequent requests pick the value out of the cache and attach it as a
// header — used by the backend only when the proxy chain didn't yield a
// usable address (local dev / NAT-without-proxy).
void discoverPublicIp();

// Wipe any legacy tokens that may have been stored in client-side storage
// before the HttpOnly-cookie migration. We never want a token in JS anymore.
try {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('em_token');
  localStorage.removeItem('em_user');
  sessionStorage.removeItem('em_token');
} catch { /* SSR / sandbox */ }

export const USER_KEY = 'em_user';
export const getStoredUser = () => sessionStorage.getItem(USER_KEY);
export const setStoredUser = (u: string) => sessionStorage.setItem(USER_KEY, u);
export const clearStoredUser = () => sessionStorage.removeItem(USER_KEY);

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
  withCredentials: true,
});

const MUTATE_METHODS = new Set(['post', 'put', 'patch', 'delete']);

// In-flight mutation counter. The pagehide beacon checks this and skips the
// auto-logout if any write is currently mid-request — that's almost certainly
// the user just clicking a button (e.g. "Log Task"), NOT actually leaving the
// app. Prevents the tab-close beacon from racing a form submit and killing
// the cookie before the response lands.
let inFlightMutations = 0;
export function hasInFlightMutations(): boolean { return inFlightMutations > 0; }
// Endpoints whose writes MUST carry a fresh GPS fix. Other writes (e.g. /auth/logout)
// are intentionally excluded so a denied user can still sign out cleanly.
const GPS_REQUIRED_PREFIXES = ['/daily-tasks'];

// Attach the cached GPS coords (if the user granted permission) to every request
// so the backend can fill the created_gps / updated_gps audit columns.
// For mutating calls to GPS-required endpoints, also re-validate that location
// permission is still active — otherwise the request is blocked client-side.
api.interceptors.request.use(async (config) => {
  const method = String(config.method || 'get').toLowerCase();
  const url = config.url || '';
  const needsGpsGate = MUTATE_METHODS.has(method) && GPS_REQUIRED_PREFIXES.some((p) => url.startsWith(p));

  if (needsGpsGate) {
    try {
      const gps = await ensureGpsForMutate();
      config.headers = config.headers || {};
      (config.headers as Record<string, string>)['X-GPS-Location'] = gps;
    } catch (e) {
      if (e instanceof GpsError) {
        // Stable toast id dedupes when multiple mutates fire back-to-back.
        toast.error(e.message, { id: 'gps-blocked', duration: 8000 });
      }
      throw e;
    }
  } else {
    const gps = getCachedGps();
    if (gps) {
      config.headers = config.headers || {};
      (config.headers as Record<string, string>)['X-GPS-Location'] = gps;
    }
  }

  const publicIp = getCachedPublicIp();
  if (publicIp) {
    config.headers = config.headers || {};
    (config.headers as Record<string, string>)['X-Client-Public-IP'] = publicIp;
  }

  if (MUTATE_METHODS.has(method)) inFlightMutations += 1;
  return config;
});

api.interceptors.response.use(
  (res) => {
    const method = String(res.config.method || 'get').toLowerCase();
    if (MUTATE_METHODS.has(method) && inFlightMutations > 0) inFlightMutations -= 1;
    return res;
  },
  (err) => {
    const method = String(err.config?.method || 'get').toLowerCase();
    if (MUTATE_METHODS.has(method) && inFlightMutations > 0) inFlightMutations -= 1;
    // Network failures (backend down, DNS, offline) have no `response`. Surface
    // a clear single toast so a stale GPS/permission toast can't be mistaken
    // for a server outage. Callers can still see `err.isNetworkError` to
    // skip their own fallback.
    if (!err.response && err.code !== 'ERR_CANCELED') {
      err.isNetworkError = true;
      toast.error('Server is unreachable. Please check your connection or try again later.', {
        id: 'server-unreachable',
        duration: 6000,
      });
    }
    if (err.response?.status === 401) {
      clearStoredUser();
      if (location.pathname !== '/login') location.href = '/login';
    }
    return Promise.reject(err);
  },
);





