import { Request } from 'express';

export function getClientIp(req: Request): string {
  const xfwd = (req.headers['x-forwarded-for'] as string) || '';
  let ip = xfwd
    ? xfwd.split(',')[0].trim()
    : req.ip || req.socket?.remoteAddress || '';
  // Normalize IPv6-mapped IPv4 (::ffff:1.2.3.4) and loopback (::1)
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') ip = '127.0.0.1';
  return ip;
}
