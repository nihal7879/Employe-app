import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, catchError, throwError } from 'rxjs';
import { getClientIp } from '../utils/get-ip';

// Limits FAILED login attempts per client IP: after MAX_FAILURES failures in
// WINDOW_MS, further attempts from that IP get 429 until the window resets.
//
// Successful logins are never counted, so a whole office sharing one public
// IP can log in at the same time without tripping it — only repeated
// invalid/forged credentials do.
//
// Kept in memory: on serverless each instance counts separately, so this
// slows scripted abuse rather than being a hard global cap.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 30;
const MAX_TRACKED_IPS = 10_000;

// Responses that mean "bad credentials / bad request" — the ones worth
// counting. Server errors (5xx) are our fault, not the user's, so they don't count.
const COUNTED_STATUSES = new Set([HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN]);

const failures = new Map<string, { count: number; resetAt: number }>();

function prune(now: number) {
  if (failures.size <= MAX_TRACKED_IPS) return;
  for (const [key, entry] of failures) if (entry.resetAt <= now) failures.delete(key);
  if (failures.size > MAX_TRACKED_IPS) failures.clear();
}

function recordFailure(ip: string, now: number) {
  prune(now);
  const entry = failures.get(ip);
  if (!entry || entry.resetAt <= now) {
    failures.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

@Injectable()
export class LoginRateLimitInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const ip = getClientIp(req);
    const now = Date.now();

    const entry = failures.get(ip);
    if (entry && entry.resetAt > now && entry.count >= MAX_FAILURES) {
      throw new HttpException(
        'Too many failed login attempts. Please wait a few minutes and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return next.handle().pipe(
      catchError((err) => {
        if (err instanceof HttpException && COUNTED_STATUSES.has(err.getStatus())) {
          recordFailure(ip, Date.now());
        }
        return throwError(() => err);
      }),
    );
  }
}
