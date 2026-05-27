import { Request } from 'express';

// Returns true for loopback / link-local / RFC1918 ranges. These are useless
// for fraud-detection purposes because they don't identify a real client —
// they're the on-LAN address of a proxy hop or the dev machine itself.
function isInternalIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '::1') return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true; // 172.16.0.0–172.31.255.255
  if (ip.startsWith('169.254.')) return true;             // link-local
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // IPv6 ULA
  if (ip.startsWith('fe80:')) return true;                // IPv6 link-local
  return false;
}

function normalize(ip: string): string {
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);  // IPv4-mapped IPv6
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

// Dotted-quad sanity check. Anything with a colon is treated as IPv6 (the
// IPv4-mapped form like ::ffff:1.2.3.4 has already been stripped by normalize).
function isIpv4(ip: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip);
}

// Pull the real client IP out of the request. Tries a sensible chain of proxy
// headers (Cloudflare → nginx → standard XFF), then Express's req.ip, and
// finally the raw socket. The first PUBLIC address wins — internal/loopback
// IPs are accepted only when no public address is available (e.g. genuine
// local dev). This is what the audit log + fraud-detection screens read.
export function getClientIp(req: Request): string {
  const trusted: string[] = [];   // from proxy headers / socket — server-side signals
  const selfReported: string[] = []; // from the browser via api.ipify.org

  const push = (bucket: string[], raw: unknown) => {
    if (!raw) return;
    const values = Array.isArray(raw) ? raw : String(raw).split(',');
    for (const v of values) {
      const ip = normalize(String(v).trim());
      if (ip) bucket.push(ip);
    }
  };

  push(trusted, req.headers['cf-connecting-ip']);   // Cloudflare
  push(trusted, req.headers['true-client-ip']);     // Akamai / Cloudflare Enterprise
  push(trusted, req.headers['x-real-ip']);          // common nginx setup
  push(trusted, req.headers['x-forwarded-for']);    // standard proxy chain (left-most = client)
  if (req.ip) push(trusted, req.ip);
  if (req.socket?.remoteAddress) push(trusted, req.socket.remoteAddress);

  // Browser-supplied public IP (from ipify or similar). Low-trust — clients
  // can spoof — so only used when every trusted signal is loopback/private,
  // which is the local-dev and NAT-without-proxy case.
  push(selfReported, req.headers['x-client-public-ip']);

  // Selection priority — pick the most useful identifier for the audit log:
  //   1. trusted public IPv4   (most readable, most devices have one)
  //   2. trusted public IPv6   (dual-stack / IPv6-only clients fall here)
  //   3. self-reported public IPv4
  //   4. self-reported public IPv6
  //   5. anything we saw at all (lets ops tell that detection ran)
  for (const ip of trusted)      if (!isInternalIp(ip) && isIpv4(ip)) return ip;
  for (const ip of trusted)      if (!isInternalIp(ip))               return ip;
  for (const ip of selfReported) if (!isInternalIp(ip) && isIpv4(ip)) return ip;
  for (const ip of selfReported) if (!isInternalIp(ip))               return ip;
  return trusted[0] || selfReported[0] || 'unknown';
}
