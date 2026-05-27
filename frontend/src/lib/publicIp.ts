// Best-effort public IP discovery from the browser. Used as a server-side
// fallback when nothing in the proxy chain yielded a public address (local
// dev, NAT without a forwarding proxy). The backend treats this as low-trust
// — anyone can spoof — but it's still better than logging "127.0.0.1" for
// every fraud-detection row.

import { APP_CONFIG } from '../config/app-config';

const KEY = 'em_public_ip';
const TS_KEY = 'em_public_ip_ts';
const MAX_AGE_MS = APP_CONFIG.publicIpCacheMaxAgeMs;

// Ordered list of providers. We hit them in sequence with a short timeout
// each; the first to answer wins. Picked services that return plain text so
// we don't need to parse JSON and there's nothing to misinterpret.
const PROVIDERS = [
  'https://api.ipify.org',
  'https://ipv4.icanhazip.com',
  'https://api64.ipify.org',
];

let inFlight: Promise<string | null> | null = null;

function readCache(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    const t = Number(sessionStorage.getItem(TS_KEY) || 0);
    if (!v || Date.now() - t > MAX_AGE_MS) return null;
    return v;
  } catch { return null; }
}
function writeCache(v: string) {
  try {
    sessionStorage.setItem(KEY, v);
    sessionStorage.setItem(TS_KEY, String(Date.now()));
  } catch { /* sandboxed */ }
}

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-fA-F:]+$/;
function looksLikeIp(s: string): boolean {
  if (!s) return false;
  return IPV4.test(s) || (IPV6.test(s) && s.includes(':'));
}

async function fetchOne(url: string, timeoutMs: number): Promise<string | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: ctl.signal, credentials: 'omit' });
    if (!resp.ok) return null;
    const txt = (await resp.text()).trim();
    return looksLikeIp(txt) ? txt : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function getCachedPublicIp(): string | null {
  return readCache();
}

// Fire-and-forget. Resolves to the IP or null. Never throws. Subsequent calls
// within the cache window are instant; concurrent calls share the same promise.
export function discoverPublicIp(): Promise<string | null> {
  const cached = readCache();
  if (cached) return Promise.resolve(cached);
  if (inFlight) return inFlight;

  inFlight = (async () => {
    for (const url of PROVIDERS) {
      const ip = await fetchOne(url, 3000);
      if (ip) {
        writeCache(ip);
        return ip;
      }
    }
    return null;
  })().finally(() => { inFlight = null; });

  return inFlight;
}
