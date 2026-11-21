import type { ConfigService } from '@nestjs/config';

// The one place JWT_SECRET is read. There is deliberately no fallback value:
// a guessable default would let anyone forge an Admin session if the env var
// were ever missing, so a missing/placeholder secret stops the app instead.
export function jwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET');
  if (!secret || secret === 'change-me') {
    throw new Error('JWT_SECRET is not set. Add a long random value to the backend environment.');
  }
  return secret;
}
