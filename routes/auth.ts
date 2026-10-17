import { Request, Response } from 'express';
import Routes from './common';
import { MAX_PASSWORD_LENGTH, verifyPassword } from '../auth/passwords';
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
import { normalizeEmail, toPublicUser } from '../models/users';

/*
Signing in and out, mounted at /api/auth. Login and logout work without a session (see
middleware/auth.ts); everything else here needs one.
*/
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

    this.router.post('/logout', handle(async (req, res) => {
      const token = readCookie(req, SESSION_COOKIE);
      if (token) {
        await this.dataProvider.deleteSession(sessionIdForToken(token));
      }
      clearSessionCookie(req, res);
      res.sendStatus(204);
    }));

    // Who's signed in. The client calls this on load to find out whether its cookie is still good.
    this.router.get('/me', handle(async (req, res) => {
      res.json({ user: req.user });
    }));
  }
}
