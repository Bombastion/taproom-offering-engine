# Taproom Offering Engine

A small server and mobile-friendly admin app for managing a taproom's menus (sections, items,
pour sizes and prices) and publishing them in a few public formats:

- **JSON**, for anything that wants the raw menu
- **Widget JSON**, a nested menu that the Wix "Currently On Tap" embed polls
- **Print**, a printable HTML menu
- **Digital**, menu board images for the TV (PNG, one per page)

| Piece | Where | What it is |
| ----- | ----- | ---------- |
| Server | repo root (`server.ts`, `app.ts`, `routes/`) | Express 5 + TypeScript (run with `tsx`), storing data in Postgres through Prisma |
| Admin client | `client/` | React + Vite app, served at `/admin/` (see [client/README.md](client/README.md)) |
| Wix widget | `wix-widget/currently-on-tap.html` | Embeddable "currently on tap" display |
| Reverse proxy | `Caddyfile` | HTTPS and routing in front of the server and admin client |

## Prerequisites

- **Docker** with Docker Compose. This is the normal way to run everything.
- For running without Docker: **Node.js 22 or newer** (the Docker image uses Node 23) and a
  **PostgreSQL** database. Postgres 18 is what Docker uses.

## Configuration

Copy the example environment file and edit it. `.env` is gitignored; Docker Compose reads it
automatically.

```sh
cp .env.example .env
```

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `TOE_ADMIN_PASSWORD` | **Yes** | The password for the first admin account. Docker Compose refuses to start without it. Use something long and random. Only used while there are no users; see [Accounts](#accounts-and-signing-in). |
| `TOE_ADMIN_EMAIL` | No | What the first admin signs in with. Defaults to `admin`; the older name `TOE_ADMIN_USERNAME` still works. |
| `TOE_SIGNUP_ENABLED` | No | Set to `false` to stop accepting requests for new accounts. On by default. See [Accounts](#accounts-and-signing-in). |
| `DOMAIN` | No | The domain Caddy serves, e.g. `menu.zymosbrewing.com`. Defaults to `localhost`. A real domain gets a Let's Encrypt certificate automatically; `localhost` uses Caddy's own local certificate authority, so browsers show a certificate warning. Accepts a comma-separated list. |
| `INTERNAL_DOMAIN` | No | A name that only resolves on your own network, e.g. `zymos.brew` from a DNS entry on your router. Caddy serves it with a certificate from its local CA. Keep it out of `DOMAIN`; see below. |
| `HTTP_PORT`, `HTTPS_PORT` | No | Host ports Caddy listens on. Default `80` and `443`. Change them if something else on the machine already uses those (see below). |
| `DEFAULT_SNI` | No | Only for testing from other devices on your network by IP address. See below. |
| `DATABASE_URL` | Only without Docker | Postgres connection string, e.g. `postgres://postgres:postgres@localhost:5432/postgres`. Docker Compose sets this itself. |
| `TOE_SERVER_PORT` | No | Port the server listens on. Defaults to `3000`. |
| `TOE_TRUST_PROXY` | No | Set to `true` only when exactly one reverse proxy (Caddy) sits in front of the server. Docker Compose sets it. Never set it without a proxy: clients could spoof their IP and get around the rate limits. |

## Running with Docker (recommended)

```sh
docker compose up --build
```

This starts four services:

- `db`: Postgres, with its data in the `pg_data` volume
- `taproom-offering-engine`: the server. It applies database migrations on startup, then starts.
- `admin-client`: the built admin app, served by nginx
- `caddy`: the only thing exposed to the network, on ports 80 and 443

Then open:

- **https://localhost/admin/** for the admin app. Sign in with `TOE_ADMIN_EMAIL` and
  `TOE_ADMIN_PASSWORD`. Your browser will warn about the certificate when `DOMAIN` is `localhost`;
  that is expected.
- `http://127.0.0.1:3000` for the server directly. It is bound to loopback only.

The database starts empty. Create your breweries, pour sizes, items and menus in the admin app.

### Testing from a phone or another computer

1. Find this machine's LAN IP (say `192.168.1.20`).
2. In `.env`, set `DOMAIN=localhost, 192.168.1.20` and `DEFAULT_SNI=192.168.1.20`.
3. Restart with `docker compose up --build` and browse to `https://192.168.1.20/admin/`.

### Using an internal DNS name

If you give the machine a name on your own network (a DNS entry on your router, such as
`zymos.brew`), put it in `INTERNAL_DOMAIN`, **not** `DOMAIN`:

```sh
INTERNAL_DOMAIN=zymos.brew
```

Let's Encrypt only issues certificates for real public domains, so a name like this in `DOMAIN`
fails with `cannot issue for "zymos.brew": domain name does not end with a valid public suffix`.
Names in `INTERNAL_DOMAIN` get a certificate from Caddy's own local certificate authority instead.

Browsers will still warn until they trust that authority. To remove the warning, copy its root
certificate off the server and install it on each device that needs it:

```sh
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
```

Then add it to the device's trusted root certificates (on macOS, open it in Keychain Access and set
it to "Always Trust"). Phones need it installed and trusted in their certificate settings too.

### When port 80 or 443 is already in use

If `docker compose up` fails with "port is already allocated" or "address already in use", find
what holds the port (`sudo ss -ltnp | grep ':80 '`), then either stop it or move Caddy in `.env`:

```sh
HTTP_PORT=8080
HTTPS_PORT=8443
```

The admin app is then at `https://<domain>:8443/admin/`. Caddy uses these same numbers inside the
container, so its HTTP-to-HTTPS redirects stay correct.

For a public domain this has a catch: Let's Encrypt validates only on the standard ports 80 and 443,
so certificates won't issue unless the outside world's 80/443 reach Caddy's ports. If another web
server owns 80/443 on the machine, the cleaner setup is to let it proxy your domain to Caddy (or
straight to the server on `127.0.0.1:3000`) and terminate TLS there.

### Going live

1. Point your domain's DNS at this machine's public IP and set `DOMAIN` to it.
2. Forward only ports **80 and 443** through your router. Port 80 is needed for the Let's Encrypt
   challenge even though everything redirects to HTTPS. Do not forward port 3000.
3. Keep the `caddy_data` volume between deployments. Losing it means re-issuing certificates, which
   Let's Encrypt rate-limits.
4. Change the Postgres password in `docker-compose.yml` (it defaults to `postgres`) if the database
   could ever be reached from outside the compose network.

## Running without Docker

For development on the server. You need a running Postgres and a `DATABASE_URL` in `.env`.

```sh
npm install                  # also generates the Prisma client into generated/
npx prisma migrate deploy    # creates the tables
npm run copy-files           # copies public/ to dist/ (the server renders views from dist/public/views)
npm start                    # http://localhost:3000
```

Re-run `npm run copy-files` after changing anything in `public/`, and `npm run generate` after
changing `prisma/schema.prisma`. To create a new migration during development, use
`npx prisma migrate dev --name <what-changed>`.

To work on the admin app with hot reload, run the server as above, then in another terminal:

```sh
cd client
npm install
npm run dev                  # http://localhost:5173/admin/
```

The dev server proxies `/api` to `localhost:3000`. See [client/README.md](client/README.md).

## Accounts and signing in

People sign in to the admin app with an email and password. The server stores a session for each
sign-in and gives the browser an httpOnly cookie (`toe_session`); only a hash of the cookie's
secret is stored, signing out ends the session on the server, and a disabled account loses access
on its next request. A normal sign-in lasts a day (and ends when the browser closes); "Keep me
signed in" lasts 30 days. Failed sign-ins are limited to 30 per 10 minutes per IP address.

### Requesting and approving accounts

Anyone can ask for an account from the sign-in screen ("Request one"): name (optional), email and
a password of at least 10 characters. That creates a **pending** account, which can't sign in. An
admin approves or rejects it on the **Users** screen (More menu → Users; a dot on the menu button
shows when requests are waiting). There is no email: the applicant just finds out by trying to
sign in again, and is told their account is waiting. The signup form answers the same whether or
not the email already has an account, and an existing account is never changed by it. Requests
are limited to 5 per hour per IP address.

Admins can also disable and re-enable accounts (which signs the person out and keeps their data),
and make people admins or regular users. Nothing is ever deleted. Rejecting a request disables
it, which keeps the email taken. You can't disable or demote yourself, and the last active admin
can't be removed. Admins manage accounts, nothing more: they see only their own menus and items,
like everyone. Everyone can change their own password on the Account screen (More menu →
Account); that signs their other browsers out.

To stop taking new requests, set `TOE_SIGNUP_ENABLED=false` in `.env` and restart. The "Request one"
link disappears and the server refuses new requests. Existing accounts, and requests already
waiting for approval, are unaffected.

### Forgotten passwords

There is no "forgot password" email. Someone who can run commands on the server sets a new password
instead:

```sh
docker compose exec taproom-offering-engine npm run user:reset-password -- someone@example.com
```

It asks for the new password twice without showing it (at least 10 characters), changes it, and
signs that account out everywhere. It changes nothing else: a pending or disabled account stays
that way. If the email isn't found, it lists the admin accounts, so this also works for an admin
who has forgotten which email they used. Without a terminal (a script, say), pipe the password in
with `--password-stdin`; the password is never taken as an argument, so it doesn't end up in shell
history. Outside Docker, run `npm run user:reset-password -- <email>` with `DATABASE_URL` set.

The first admin is created at startup, from `TOE_ADMIN_EMAIL` and `TOE_ADMIN_PASSWORD`, but only
while there are no users at all. After that the accounts live in the database: changing
`TOE_ADMIN_PASSWORD` later does **not** change an existing account's password.

Upgrading from the shared-password version: your existing `.env` keeps working (`TOE_ADMIN_USERNAME`
is read as the sign-in name, defaulting to `admin`), so sign in with that name and the same
password. The container now runs `prisma migrate deploy` instead of `migrate dev`, so new
migrations (this one adds the user and session tables) are applied automatically on start.
Back up the `pg_data` volume before upgrading.

### Data ownership

Everything the admin app manages belongs to one account.
Another account's menus, items, etc., item or pour size produces a 404, and so does linking to it
from your own data. The one exception is the public menu formats below, which are found by the
menu's link and don't require login.

## Public menu URLs

Menu IDs are visible in the admin app's URLs (`/admin/menus/<menuId>`).

| URL | Returns |
| --- | ------- |
| `/menus/<menuId>` or `?format=json` | The menu as JSON |
| `/menus/<menuId>?format=widget` | Nested JSON (sections and items, with no pour sizes or prices) for the Wix widget |
| `/menus/<menuId>?format=print` | Printable HTML menu |
| `/menus/<menuId>?format=digital` | Menu board for the TV: a ZIP of PNG images, one per page (1080×1920) |
| `/menus/<menuId>?format=digital&page=<n>` | Just page `n` (starting at 1) of the menu board, as a PNG |

Each section can be left off any of the print view, the menu board and the website widget (on the
section's screen in the admin app), for example a "Non-Alcoholic Beers" section that only goes on the
menu board. A section left off a view disappears from it entirely, heading and items.

A menu can have a **default brewery** (set on its screen in the admin app). The print view and menu
board leave that brewery's name off its beers and still name every other brewery. The widget and JSON
formats are unaffected.

### Print menu designs

How the print menu looks (fonts, sizes, colors, which fields appear in which columns, page size and
margins, a footer) is described by a **design**: a JSON document per menu, validated by
`models/menuDesign.ts` and drawn by `print/render.ts`. A menu with no saved design prints with the
default design (the Modern preset, which has no footer). The designer saves a whole design, so changing
the default later doesn't change a menu that has been saved. A design only needs to hold what differs
from the default. Fonts come from a fixed list the server
hosts itself (`models/fonts.ts`, files and licences in `public/fonts`).

The admin API (all under `/api`, signed in):

| Request | Does |
| ------- | ---- |
| `GET /design/fonts`, `GET /design/presets` | The fonts and starting designs on offer |
| `GET /menus/<menuId>/design/print` | The menu's design, or the default (`isDefault: true`) |
| `PUT /menus/<menuId>/design/print` with `{ "design": {...} }` | Validates and saves it (400 with `issues`, one per bad field, if not) |
| `DELETE /menus/<menuId>/design/print` | Goes back to the default |
| `POST /menus/<menuId>/design/print/preview` with `{ "design": {...} }` | The menu as HTML with that design, without saving |

These are public and need no login. The menu board and print formats are rate limited (10 requests per minute per IP).
The admin API under `/api` always requires a signed-in user.

## Wix "Currently On Tap" widget

`wix-widget/currently-on-tap.html` is pasted into a Wix HTML embed. Before using it, edit the
`CONFIG` block near the bottom of that file:

- `API_BASE_URL`: your server's public URL (it ships pointing at `http://localhost:3000`)
- `MENU_ID`: the ID of the menu to display (the shipped value is a dev menu ID)
- `REFRESH_INTERVAL_MS`: how often the widget refetches (default 15 minutes)

## Tests

```sh
npm test                 # server tests
cd client && npm test    # admin client tests
npm run test:docker      # both, in Docker
```

None of the tests need a database. See [TESTING.md](TESTING.md) for more.

## Project layout

```
server.ts, app.ts       Entry point and Express app (middleware, routes)
routes/                 menus.ts (public formats), api.ts (menu data and design API), auth.ts (sign in/out, signup, password), admin.ts (managing accounts)
auth/                   Password hashing, sessions, creating the first admin, password reset, settings
scripts/                Commands run on the server (reset-password)
middleware/             Session check, same-origin check and rate limits
storage/providers.ts    Data layer: Prisma/Postgres, plus an in-memory provider used by tests
prisma/                 Schema and migrations
print/                  The print menu: what it shows (model.ts), how it looks (css.ts) and the page itself (render.ts)
models/menuDesign.ts    The design format, its defaults and validation; models/fonts.ts is the font list
public/                 Fonts (and the old print template, no longer used)
data/                   Sample JSON data loaded by the in-memory provider (tests only)
client/                 Admin app
wix-widget/             Wix embed
build/, docker-compose*.yml, Caddyfile   Container and proxy setup
```
