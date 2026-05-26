import type { Request } from 'express';
import { getClientIp } from './get-ip';

export interface RequestContext {
  ip: string;
  device: string | null;   // Mobile | Tablet | Desktop | Bot | Unknown
  browser: string | null;  // Chrome | Edge | Firefox | Safari | Opera | etc.
  gps: string | null;      // optional, set only if the client sent X-GPS-Location
  user_agent: string;
}

const BROWSER_PATTERNS: [string, RegExp][] = [
  ['Edge',    /Edg(?:e|A|iOS)?\/[\d.]+/],
  ['OPR',     /OPR\/[\d.]+/],         // Opera modern
  ['Opera',   /Opera\/[\d.]+/],
  ['Chrome',  /Chrome\/[\d.]+/],
  ['Safari',  /Safari\/[\d.]+/],      // checked after Chrome (Chrome UA also has Safari token)
  ['Firefox', /Firefox\/[\d.]+/],
  ['IE',      /MSIE [\d.]+|Trident\/[\d.]+/],
];

function detectBrowser(ua: string): string | null {
  if (!ua) return null;
  for (const [name, re] of BROWSER_PATTERNS) {
    if (re.test(ua)) {
      if (name === 'Chrome' && /Edg\//.test(ua)) continue;
      if (name === 'Safari' && /Chrome\//.test(ua)) continue;
      return name === 'OPR' ? 'Opera' : name;
    }
  }
  return null;
}

function detectDevice(ua: string): string | null {
  if (!ua) return null;
  if (/bot|crawler|spider|crawling/i.test(ua)) return 'Bot';
  if (/Tablet|iPad|PlayBook|Kindle/i.test(ua)) return 'Tablet';
  if (/Mobile|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

export function getRequestContext(req: Request): RequestContext {
  const ua = String(req.headers['user-agent'] || '');
  const gpsHeader = req.headers['x-gps-location'];
  const gpsBody = (req.body as Record<string, unknown> | undefined)?.gps;
  const gpsRaw = (Array.isArray(gpsHeader) ? gpsHeader[0] : gpsHeader) ?? gpsBody;
  const gps = gpsRaw ? String(gpsRaw).slice(0, 128) : null;
  return {
    ip: getClientIp(req),
    device: detectDevice(ua),
    browser: detectBrowser(ua),
    gps,
    user_agent: ua.slice(0, 512),
  };
}
