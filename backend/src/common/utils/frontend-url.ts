import type { Request } from 'express';

// FRONTEND_URL may hold a comma-separated list (localhost + prod). Pick the
// entry that matches the host that served THIS request, so the localhost
// backend redirects to the localhost frontend and the deployed backend
// redirects to the deployed frontend — regardless of NODE_ENV.
export function resolveFrontendUrl(req: Request, configured: string | undefined): string {
  const urls = (configured || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const host = (req.get('host') || '').toLowerCase();
  const isLocal = host.includes('localhost') || host.startsWith('127.');
  return (
    (isLocal ? urls.find((u) => u.includes('localhost')) : urls.find((u) => !u.includes('localhost'))) ||
    urls[0]
  );
}
