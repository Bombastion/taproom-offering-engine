import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// A generous backstop against scripted abuse of the whole app. Not meant to interfere with
// normal traffic — including the public "currently on tap" widget, which may be polled every
// few minutes from many different visitors' browsers.
export const generalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// The main defense against brute-forcing a password: caps *failed* sign-ins (401 responses) per
// IP at /api/auth/login. Successful sign-ins and the 403s for pending or disabled accounts (which
// only happen after a correct password) don't count. 30 failures per 10 minutes is plenty for
// typos, but far too slow to meaningfully brute-force a reasonably long password.
// It's applied to the login route only: an admin editing a menu, or the client checking on load
// whether it's still signed in, isn't a login attempt and shouldn't use up the budget.
// `generalLimiter` still caps overall volume.
export const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many failed sign-in attempts from this address. Please wait a while and try again.',
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req: Request, res: Response) => res.statusCode !== 401,
});

// PDF generation (?format=digital and ?format=print) is meaningfully more CPU-intensive than
// the other public menu formats, and — unlike the admin routes — it's reachable with no auth
// at all. Give it its own tight limit so it can't be used to tie up the server.
export const expensiveFormatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many menu-export requests from this address. Please wait a minute and try again.',
  skip: (req: Request) => req.query.format !== 'digital' && req.query.format !== 'print',
});
