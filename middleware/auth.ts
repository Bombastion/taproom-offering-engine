import { Request, Response, NextFunction } from 'express';
import { DataProvider } from '../storage/providers';
import { PublicUser, toPublicUser } from '../models/users';
import { readCookie, SESSION_COOKIE, sessionIdForToken } from '../auth/sessions';

declare global {
  namespace Express {
    interface Request {
      // The signed-in user, set by sessionMiddleware when the request carries a valid session
      // for an active user
      user?: PublicUser;
    }
  }
}

// Everything under /api needs a signed-in user, reads included, since it's the editing surface
// rather than public menu data. Any write (POST/PATCH/PUT/DELETE) elsewhere is treated the same
// way, so a route added later can't be left open by accident. Reads outside /api — the public
// menu JSON/widget/print/digital formats — stay open, since the public site and the Wix widget
// depend on those being reachable without a login.
export function isApiPath(req: Request): boolean {
  return req.path === '/api' || req.path.startsWith('/api/');
}

// The only /api routes that work without a session: signing in, and signing out (which should
// still clear the cookie even if the session has already expired).
const PUBLIC_AUTH_PATHS = new Set(['/api/auth/login', '/api/auth/logout']);

export function requiresAuth(req: Request): boolean {
  if (PUBLIC_AUTH_PATHS.has(req.path)) {
    return false;
  }
  if (isApiPath(req)) {
    return true;
  }
  return !(req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS');
}

// Looks up the session cookie and, if it belongs to a live session of an active user, puts that
// user on the request. Doesn't reject anything by itself; see requireSession.
export function sessionMiddleware(dataProvider: DataProvider) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) {
      const session = await dataProvider.getSession(sessionIdForToken(token));
      if (session) {
        if (session.expiresAt.getTime() <= Date.now()) {
          await dataProvider.deleteSession(session.id);
        } else {
          const user = await dataProvider.getUser(session.userId);
          // Checked on every request, so disabling a user locks them out straight away
          if (user && user.status === 'ACTIVE') {
            req.user = toPublicUser(user);
          }
        }
      }
    }
    next();
  };
}

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (!requiresAuth(req) || req.user) {
    next();
    return;
  }
  // No WWW-Authenticate header: the admin client has its own sign-in screen, and a challenge
  // would make browsers pop up their own login dialog.
  res.status(401).send('Authentication required.');
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Cookies are sent automatically, so a page on another site could otherwise make a signed-in
// browser submit a write. The cookie is SameSite=Lax, which already stops that in current
// browsers; this is a second check that refuses any write the browser says came from somewhere
// else. Requests with no Origin header (scripts, curl) aren't browser-driven cross-site requests
// and are let through; they have no session cookie to abuse.
export function sameOriginWrites(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  let sameOrigin = req.get('sec-fetch-site') !== 'cross-site';
  const origin = req.get('origin');
  if (sameOrigin && origin !== undefined) {
    try {
      sameOrigin = new URL(origin).host === req.get('host');
    } catch {
      sameOrigin = false;
    }
  }
  if (!sameOrigin) {
    res.status(403).send('Cross-site requests are not allowed.');
    return;
  }
  next();
}
