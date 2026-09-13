import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// A single shared admin credential is enough for a small taproom app; this isn't meant to
// scale to per-user accounts. Set these via environment variables — never hardcode a real
// password here, since this file is committed to the repo.
//
// Read lazily (inside adminAuth, not at module load) so this works regardless of whether
// something that loads .env (see prisma/client.ts's `import "dotenv/config"`) happens to run
// before or after this module is first imported.
function getAdminUsername(): string {
  return process.env.TOE_ADMIN_USERNAME || 'admin';
}

function getAdminPassword(): string | undefined {
  return process.env.TOE_ADMIN_PASSWORD;
}

function safeStringEqual(a: string, b: string): boolean {
  // crypto.timingSafeEqual throws on mismatched buffer lengths, and doing a plain !== check
  // first would leak length via timing. Pad both sides to the same length before comparing,
  // and separately check the real lengths matched.
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  const maxLen = Math.max(bufA.length, bufB.length, 1);
  const paddedA = Buffer.alloc(maxLen);
  const paddedB = Buffer.alloc(maxLen);
  bufA.copy(paddedA);
  bufB.copy(paddedB);
  return bufA.length === bufB.length && crypto.timingSafeEqual(paddedA, paddedB);
}

// Every write (POST/PATCH/PUT/DELETE) is an admin action, and every "/manage" page is part of
// the admin editor UI (see breweries.ts, containers.ts, items.ts, menus.ts — they all follow
// this same "/manage" suffix convention for their HTML editor routes). Everything else — the
// public menu JSON/print/digital formats, and plain GETs by id — stays open, since the public
// site and the Wix widget depend on those being reachable without a login.
export function requiresAuth(req: Request): boolean {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return req.path.endsWith('/manage');
  }
  return true;
}

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  if (!requiresAuth(req)) {
    next();
    return;
  }

  const adminPassword = getAdminPassword();
  if (!adminPassword) {
    // Fail closed: if no password has been configured, refuse admin routes instead of
    // silently leaving them open once this server is reachable from the internet.
    res.status(503).send('Admin auth is not configured. Set TOE_ADMIN_PASSWORD on the server.');
    return;
  }

  const header = req.headers.authorization || '';
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    const user = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : decoded;
    const pass = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : '';
    if (safeStringEqual(user, getAdminUsername()) && safeStringEqual(pass, adminPassword)) {
      next();
      return;
    }
  }

  res.set('WWW-Authenticate', 'Basic realm="Taproom Admin", charset="UTF-8"');
  res.status(401).send('Authentication required.');
}
