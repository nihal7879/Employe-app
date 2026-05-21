import { Request } from 'express';

export function getClientIp(req: Request): string {
  const xfwd = (req.headers['x-forwarded-for'] as string) || '';
  if (xfwd) return xfwd.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || '';
}
