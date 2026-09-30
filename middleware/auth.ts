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

// All editing happens through the JSON API under /api, but any write (POST/PATCH/PUT/DELETE)
// elsewhere is treated as an admin action too, so a route added later can't be left open by
// accident. Reads outside /api — the public menu JSON/widget/print/digital formats — stay open, since the public
// site and the Wix widget depend on those being reachable without a login.
//
// The one exception is the JSON API under /api used by the admin client app (see /client): it
// exists only for editing, so every request to it needs the login, reads included.
export function isApiPath(req: Request): boolean {
  return req.path === '/api' || req.path.startsWith('/api/');
}

export function requiresAuth(req: Request): boolean {
  if (isApiPath(req)) {
    return true;
  }
  return !(req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS');
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

  // The admin client app shows its own sign-in screen, so API 401s leave out the challenge
  // header that would otherwise make the browser pop up its native login dialog.
  if (!isApiPath(req)) {
    res.set('WWW-Authenticate', 'Basic realm="Taproom Admin", charset="UTF-8"');
  }
  res.status(401).send('Authentication required.');
}
