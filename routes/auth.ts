import { Request, Response } from 'express';
import Routes from './common';
import { hashPassword, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, verifyPassword } from '../auth/passwords';
import {
  clearSessionCookie,
  newSessionToken,
  readCookie,
  REMEMBERED_SESSION_TTL_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  sessionIdForToken,
  setSessionCookie,
} from '../auth/sessions';
import { signupEnabled } from '../auth/config';
import { DataProviderError } from '../storage/providers';
import { normalizeEmail, toPublicUser } from '../models/users';

/*
Signing in and out, requesting an account and changing your password, mounted at /api/auth.
Login, logout and signup work without a session (see middleware/auth.ts); everything else here
needs one.
*/

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function invalid(message: string): DataProviderError {
  return new DataProviderError(message, 422);
}
export class AuthRoutes extends Routes {
  registerRoutes(): void {
    const handle = (fn: (req: Request, res: Response) => Promise<void>) => {
      return async (req: Request, res: Response) => {
        try {
          await fn(req, res);
        } catch (e: any) {
          this.handleError(res, e);
        }
      };
    };

    // Body: { email, password, remember? }. Wrong email and wrong password get the same answer
    // (and take the same time), so this can't be used to find out which emails have accounts.
    this.router.post('/login', handle(async (req, res) => {
      const email = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!email || !password || email.length > 320 || password.length > MAX_PASSWORD_LENGTH) {
        res.status(400).send('Enter your email and password.');
        return;
      }
      const remember = req.body?.remember === true;

      const user = await this.dataProvider.getUserByEmail(email);
      const passwordMatches = await verifyPassword(password, user?.passwordHash ?? null);
      if (!user || !passwordMatches) {
        res.status(401).send('Incorrect email or password.');
        return;
      }
      // Only said once the password has proven who's asking
      if (user.status === 'PENDING') {
        res.status(403).json({ code: 'pending', message: 'Your account is waiting for an admin to approve it.' });
        return;
      }
      if (user.status !== 'ACTIVE') {
        res.status(403).json({ code: 'disabled', message: 'This account has been disabled.' });
        return;
      }

      // Signing in again replaces whatever session this browser already had
      const previous = readCookie(req, SESSION_COOKIE);
      if (previous) {
        await this.dataProvider.deleteSession(sessionIdForToken(previous));
      }
      const { token, id } = newSessionToken();
      const now = new Date();
      await this.dataProvider.createSession({
        id,
        userId: user.id,
        createdAt: now,
        expiresAt: new Date(now.getTime() + (remember ? REMEMBERED_SESSION_TTL_MS : SESSION_TTL_MS)),
      });
      setSessionCookie(req, res, token, remember);
      // Housekeeping; nothing waits on it
      this.dataProvider.deleteExpiredSessions(now).catch((e) => console.error(e));
      res.json({ user: toPublicUser(user) });
    }));

    // What the sign-in screen needs to know before anyone is signed in: whether to offer "Request an
    // account" (TOE_SIGNUP_ENABLED, see auth/config.ts)
    this.router.get('/config', handle(async (_req, res) => {
      res.json({ signupEnabled: signupEnabled() });
    }));

    // Body: { email, password, displayName? }. Makes a PENDING account for an admin to approve; it
    // can't sign in until then. The answer is the same whether or not the email already has an
    // account (and the password is hashed either way), so this can't be used to find out which
    // emails do, and an existing account is never changed by it.
    this.router.post('/signup', handle(async (req, res) => {
      if (!signupEnabled()) throw new DataProviderError('Account requests are turned off.', 403);
      const email = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const rawName = req.body?.displayName;
      if (rawName !== undefined && rawName !== null && typeof rawName !== 'string') throw invalid('displayName must be text');
      const displayName = typeof rawName === 'string' ? rawName.trim() : '';
      if (!EMAIL_PATTERN.test(email) || email.length > 320) throw invalid('Enter a valid email address.');
      if (password.length < MIN_PASSWORD_LENGTH) throw invalid(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      if (password.length > MAX_PASSWORD_LENGTH) throw invalid('That password is too long.');
      if (displayName.length > 100) throw invalid('Use a name of at most 100 characters.');

      const passwordHash = await hashPassword(password);
      try {
        if (!(await this.dataProvider.getUserByEmail(email))) {
          await this.dataProvider.createUser({
            email,
            displayName: displayName || null,
            passwordHash,
            role: 'USER',
            status: 'PENDING',
          });
        }
      } catch (e) {
        // Two requests for the same new email at once: the loser looks just like a repeat
        if (!(e instanceof DataProviderError && e.statusCode === 409)) throw e;
      }
      res.status(202).json({ status: 'pending' });
    }));

    this.router.post('/logout', handle(async (req, res) => {
      const token = readCookie(req, SESSION_COOKIE);
      if (token) {
        await this.dataProvider.deleteSession(sessionIdForToken(token));
      }
      clearSessionCookie(req, res);
      res.sendStatus(204);
    }));

    // Body: { currentPassword, newPassword }. Signs every other browser out, keeping this one.
    this.router.post('/password', handle(async (req, res) => {
      const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
      const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
      if (!currentPassword) throw invalid('Enter your current password.');
      if (newPassword.length < MIN_PASSWORD_LENGTH) throw invalid(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      if (newPassword.length > MAX_PASSWORD_LENGTH) throw invalid('That password is too long.');

      const user = await this.dataProvider.getUser(req.user!.id);
      // Not a 401: that would tell the client its session is over
      if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
        res.status(403).send('Your current password is incorrect.');
        return;
      }
      await this.dataProvider.updateUser(user.id, { passwordHash: await hashPassword(newPassword) });
      const token = readCookie(req, SESSION_COOKIE);
      await this.dataProvider.deleteSessionsForUser(user.id, token ? sessionIdForToken(token) : undefined);
      res.sendStatus(204);
    }));

    // Who's signed in. The client calls this on load to find out whether its cookie is still good.
    this.router.get('/me', handle(async (req, res) => {
      res.json({ user: req.user });
    }));
  }
}
