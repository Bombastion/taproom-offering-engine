import rateLimit from 'express-rate-limit';
import { Request } from 'express';
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

// The main defense against brute-forcing the admin Basic Auth password: caps attempts per IP
// at every route `adminAuth` protects (every write, and every "/manage" page), including
// *failed* auth attempts, since this middleware runs before `adminAuth` does. 30 requests per
// 10 minutes is far more than a real admin editing the menu needs, but far too slow to
// meaningfully brute-force a reasonably long password.
export const adminLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many admin requests from this address. Please wait a while and try again.',
  skip: (req: Request) => !requiresAuth(req),
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
