import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import { DataProvider } from './storage/providers';
import { MenusRoutes } from './routes/menus';
import { ApiRoutes } from './routes/api';
import { AuthRoutes } from './routes/auth';
import { isApiPath, requireSession, sameOriginWrites, sessionMiddleware } from './middleware/auth';
import helmet from 'helmet';
import { generalLimiter, loginLimiter, expensiveFormatLimiter } from './middleware/rateLimits';

// Builds the Express app (middleware, views and routes) around the given data provider, without
// starting to listen. server.ts wires it to Postgres and starts it; the tests build it around an
// in-memory provider instead.
export function createApp(dataProvider: DataProvider): Express {
  const app = express();

  // Only trust X-Forwarded-* headers (client IP, protocol) when we know there's actually a
  // reverse proxy in front of us (e.g. the Caddy service in docker-compose.yml) adding them.
  // Trusting them with no proxy in front would let any client spoof its own IP and walk right
  // past the IP-based rate limiters below. Set TOE_TRUST_PROXY=true only in that topology.
  if (process.env.TOE_TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  // Standard security headers (HSTS, X-Content-Type-Options, X-Frame-Options, etc.). CSP is
  // left off for now; the other protections helmet adds still apply.
  app.use(helmet({ contentSecurityPolicy: false }));

  // A generous, app-wide rate limit as a backstop against scripted abuse (see
  // middleware/rateLimits.ts for the specifics and the tighter limits layered on top of it for
  // admin routes and PDF generation).
  app.use(generalLimiter);

  app.use(express.json({ limit: '5mb' }));

  // PDF generation (?format=digital / ?format=print) is public and CPU-heavy; keep it from being
  // used to tie up the server.
  app.use(expensiveFormatLimiter);

  // Gate the admin JSON API (and, as a safety net, any write outside it) behind a signed-in user.
  // The public menu formats the Wix widget and the public site use are left open. Browsers send
  // the session cookie automatically, so writes that the browser says came from another site are
  // refused first. See middleware/auth.ts for the exact rules and auth/ for how sessions work.
  app.use(sameOriginWrites);
  app.use(sessionMiddleware(dataProvider));
  app.use(requireSession);

  // Allow cross-origin requests (e.g., the Wix "currently on tap" widget fetching
  // menu data from this server's domain). Menu data served here is public/read-only,
  // so an open CORS policy is fine.
  app.use((req: Request, res: Response, next: NextFunction) => {
    // The admin JSON API is only ever called same-origin by the admin client, so it gets no CORS
    // headers at all.
    if (isApiPath(req)) {
      next();
      return;
    }
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Setting up HTML rendering
  app.set('view engine', 'pug');
  app.set('views', './dist/public/views')
  app.use(express.static(path.join(import.meta.dirname, 'public', 'css')));

  // Register routers
  // Public menu formats (JSON, widget, print, PDF)
  app.use('/menus', new MenusRoutes(dataProvider).router);
  // JSON API for the admin client app (/client). Behind a login (except for signing in and out),
  // and never cached, since it serves the editing surface rather than public menu data.
  app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  // Failed sign-ins are throttled per IP so passwords can't be guessed at speed
  app.use('/api/auth/login', loginLimiter);
  app.use('/api/auth', new AuthRoutes(dataProvider).router);
  app.use('/api', new ApiRoutes(dataProvider).router);

  // Last-resort error handler: anything that reaches here escaped a route's own try/catch (or
  // was an unhandled rejection inside an async handler, which Express 5 forwards here
  // automatically). Always log full details server-side; always send a generic message to the
  // client — this is a public-facing service, so no internal error details (stack traces, query
  // fragments, etc.) should ever reach a caller.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    if (res.headersSent) {
      return;
    }
    res.status(500).send('Unexpected error occurred');
  });

  return app;
}
