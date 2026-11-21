import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { getClientIp } from '../utils/get-ip';

// Simple fixed-window limiter for the login endpoints: at most MAX_ATTEMPTS
// per client IP every WINDOW_MS. Kept in memory, so on serverless each
// instance counts separately — it slows down scripted abuse rather than being
// a hard global cap. No extra dependency needed.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 20;
const MAX_TRACKED_IPS = 10_000;

const hits = new Map<string, { count: number; resetAt: number }>();

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const ip = getClientIp(req);
    const now = Date.now();

    if (hits.size > MAX_TRACKED_IPS) {
      for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
      if (hits.size > MAX_TRACKED_IPS) hits.clear();
    }

    const entry = hits.get(ip);
    if (!entry || entry.resetAt <= now) {
      hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }
    entry.count += 1;
    if (entry.count > MAX_ATTEMPTS) {
      throw new HttpException(
        'Too many login attempts. Please wait a few minutes and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
