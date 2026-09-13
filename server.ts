import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { ContainersRoutes, SaleContainersRoutes } from './routes/containers';
import { ItemsRoutes } from './routes/items';
import { LocalDataProvider, PrismaDataProvider } from './storage/providers';
import { BreweriesRoutes } from './routes/breweries';
import { MenuItemsRoutes, MenusRoutes, SubMenusRoutes } from './routes/menus';
import { prisma } from './prisma/client';
import { adminAuth } from './middleware/auth';
import helmet from 'helmet';
import { generalLimiter, adminLimiter, expensiveFormatLimiter } from './middleware/rateLimits';

const app = express();
const port = process.env.TOE_SERVER_PORT || 3000;

// Only trust X-Forwarded-* headers (client IP, protocol) when we know there's actually a
// reverse proxy in front of us (e.g. the Caddy service in docker-compose.yml) adding them.
// Trusting them with no proxy in front would let any client spoof its own IP and walk right
// past the IP-based rate limiters below. Set TOE_TRUST_PROXY=true only in that topology.
if (process.env.TOE_TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// Standard security headers (HSTS, X-Content-Type-Options, X-Frame-Options, etc.). CSP is
// turned off deliberately: the admin editor pages (pug views under routes/viewHelpers) rely on
// inline <script> blocks and inline onclick handlers, which a default CSP would break. The
// other protections helmet adds still apply.
app.use(helmet({ contentSecurityPolicy: false }));

// A generous, app-wide rate limit as a backstop against scripted abuse (see
// middleware/rateLimits.ts for the specifics and the tighter limits layered on top of it for
// admin routes and PDF generation).
app.use(generalLimiter);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

// PDF generation (?format=digital / ?format=print) is public and CPU-heavy; keep it from being
// used to tie up the server.
app.use(expensiveFormatLimiter);

// Gate every write (POST/PATCH/PUT/DELETE) and every "/manage" admin editor page behind a
// shared admin password. Public read routes (the menu JSON/print/digital formats the Wix
// widget and the public site use) are left open. adminLimiter runs first so that repeated
// *failed* login attempts are throttled too, not just successful admin usage. See
// middleware/auth.ts for the exact rule and how to set the password.
app.use(adminLimiter);
app.use(adminAuth);

app.get('/', (_req: Request, res: Response) => {
  res.render('index')
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

// Setting up HTML rendering
app.set('view engine', 'pug');
app.set('views', './dist/public/views')
app.use(express.static(path.join(import.meta.dirname, 'public', 'css')));
app.use(express.static(path.join(import.meta.dirname, 'public', 'js')));

// Register routers
const dataProvider = new PrismaDataProvider(prisma);
app.use('/breweries', new BreweriesRoutes(dataProvider).router)
app.use('/containers', new ContainersRoutes(dataProvider).router)
app.use('/sale-containers', new SaleContainersRoutes(dataProvider).router)
app.use('/items', new ItemsRoutes(dataProvider).router);
app.use('/menu-items', new MenuItemsRoutes(dataProvider).router);
app.use('/menus', new MenusRoutes(dataProvider).router);
app.use('/submenus', new SubMenusRoutes(dataProvider).router);

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
