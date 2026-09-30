import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { requiresAuth } from './auth';

// A generous backstop against scripted abuse of the whole app. Not meant to interfere with
// normal traffic — including the public "currently on tap" widget, which may be polled every
// few minutes from many different visitors' browsers.
export const generalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// The main defense against brute-forcing the admin Basic Auth password: caps *failed* login
// attempts (401 responses) per IP at every route `adminAuth` protects (every write, every
// "/manage" page, and the /api used by the admin client). It runs before `adminAuth` so a
// client that's already over the limit is turned away before its credentials are even checked.
// Successful requests don't count: the admin client makes several API calls per screen, and a
// signed-in admin editing a menu shouldn't be locked out. `generalLimiter` still caps overall
// volume. 30 failures per 10 minutes is plenty for typos, but far too slow to meaningfully
// brute-force a reasonably long password.
export const adminLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many failed sign-in attempts from this address. Please wait a while and try again.',
  skip: (req: Request) => !requiresAuth(req),
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
