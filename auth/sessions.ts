import crypto from 'crypto';
import { Request, Response } from 'express';

/*
Sessions: after a successful login the server stores a Session row and gives the browser a random
secret in an httpOnly cookie. Only the sha256 of that secret is stored, so a leaked database can't
be used to sign in. Signing out deletes the row, and disabling a user takes effect on their next
request, since every request looks the session up.
*/

export const SESSION_COOKIE = 'toe_session';

// A normal sign-in lasts a day (and the cookie is dropped when the browser closes); "keep me
// signed in" lasts a month.
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const REMEMBERED_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function newSessionToken(): { token: string; id: string } {
    const token = crypto.randomBytes(32).toString('base64url');
    return { token, id: sessionIdForToken(token) };
}

export function sessionIdForToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// Reads one cookie from the request without needing a cookie-parsing dependency
export function readCookie(req: Request, name: string): string | null {
    const header = req.headers.cookie;
    if (!header) return null;
    for (const part of header.split(';')) {
        const separator = part.indexOf('=');
        if (separator < 0) continue;
        if (part.slice(0, separator).trim() === name) {
            try {
                return decodeURIComponent(part.slice(separator + 1).trim());
            } catch {
                return null;
            }
        }
    }
    return null;
}

// `req.secure` is true behind the Caddy proxy (TOE_TRUST_PROXY) and false for plain local
// development, where a Secure cookie would never be sent back over http.
function cookieOptions(req: Request) {
    return { httpOnly: true, sameSite: 'lax' as const, secure: req.secure, path: '/' };
}

export function setSessionCookie(req: Request, res: Response, token: string, remember: boolean): void {
    res.cookie(SESSION_COOKIE, token, {
        ...cookieOptions(req),
        // Without a max age the browser forgets the cookie when it closes
        ...(remember ? { maxAge: REMEMBERED_SESSION_TTL_MS } : {}),
    });
}

export function clearSessionCookie(req: Request, res: Response): void {
    res.clearCookie(SESSION_COOKIE, cookieOptions(req));
}
