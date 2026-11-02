# Taproom Offering Engine

Keep your taproom's menu in one place and show it everywhere: on your website, on a TV, and on paper.

You add your drinks once, from your phone or your computer. The Taproom Offering Engine then publishes
the same menu three ways:

- **A website widget**: a "Currently On Tap" display you paste into a Wix page
- **A TV menu board**: pictures sized for an upright TV, one for each screenful
- **A printable menu**: a page you can print for the bar or the tables

Built-in designers let you choose fonts, colors and layout for the board and the printed menu. When a
beer changes, you change it once and all three follow.

**On this page:** [Ways to use it](#ways-to-use-it) ·
[Run it on your own computer](#run-it-on-your-own-computer) · [Put it on the internet](#put-it-on-the-internet) ·
[Looking after it](#looking-after-it) · [If something goes wrong](#if-something-goes-wrong) ·
[Show your menu on your website, TV and on paper](#show-your-menu-on-your-website-tv-and-on-paper) ·
[Technical reference](#technical-reference) · [License](#license)

## Ways to use it

**We run it for you (paid).** If you'd rather not run any software yourself, we can host it for you:
we look after the server, the updates and the backups, and you just use the admin app. Paid hosting is
being set up. To ask about it, open an issue on this project's GitHub page.

**You run it yourself (free).** The code is yours to run for your own taproom or brewery. Everything
below explains how, step by step, and you don't need to be a programmer. You will need to type a few
commands, and every one of them is written out for you to copy.

The code is free to use, but it is not free to resell: you can't offer it to other businesses as a
service. See the [license](#license).

## Run it on your own computer

This is the quickest way to try it out. Nothing is put on the internet; the menu app just runs on your
computer so you can click around, add your beers and see what the menus look like. It takes about 20
minutes, most of it waiting for downloads. When you're happy with it, [put it on the internet](#put-it-on-the-internet)
so your website and TV can reach it.

**What you need**

- A Windows, Mac or Linux computer with a reliable internet connection.
- **Docker**, a free program that runs the menu app and its database for you without you having to
  install them one by one. On Windows and Mac, install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
  (it is free for small businesses; check Docker's terms for yours). On Linux, install
  [Docker Engine and the Compose plugin](https://docs.docker.com/engine/install/).

### 1. Start Docker

Open Docker Desktop and wait until it says Docker is running. On Windows it may ask you to restart the
computer the first time.

### 2. Get the code

On this project's GitHub page, click the green **Code** button, then **Download ZIP**. Unzip it
somewhere you'll find again (your Documents folder is fine) and **keep it in that same place**: Docker
ties your saved menus to the folder's name, so moving or renaming it later makes the app start empty
(your data is not lost; it stays with the old folder name).

### 3. Open a terminal in that folder

A terminal is a window where you type commands.

- **Mac:** open the **Terminal** app (press Command+Space, type "Terminal"). Type `cd ` (the letters
  c, d and a space), drag the unzipped folder from Finder onto the Terminal window, and press Return.
- **Windows:** open the unzipped folder in File Explorer, click an empty part of the address bar at the
  top, type `powershell` and press Enter.
- **Linux:** open a terminal in the folder.

### 4. Make your settings file

The app reads its settings from a file called `.env`. There is an example to copy. In the terminal, run
the line for your computer:

```sh
cp .env.example .env              # Mac and Linux
Copy-Item .env.example .env       # Windows (PowerShell)
```

Now open the new file in a plain text editor:

```sh
open -e .env                      # Mac
notepad .env                      # Windows
nano .env                         # Linux (Ctrl+O then Enter to save, Ctrl+X to leave)
```

Change these two lines, and leave the rest alone for now:

```sh
TOE_ADMIN_EMAIL=you@yourbrewery.com
TOE_ADMIN_PASSWORD=pick-a-long-password-only-you-know
```

That email and password are what you'll sign in with. Use a long password (a few random words is
good). Save the file. The password is only used the first time the app starts; after that it lives in
the app, and you change it on the Account screen.

### 5. Start the app

```sh
docker compose up --build
```

The first time, this downloads and builds everything, which takes several minutes and prints a lot of
text. It's ready when you see **`Server listening on port 3000`**. Leave this window open while you use
the app (closing it stops the app; see [Looking after it](#looking-after-it) for running it in the background).

### 6. Open the admin app

In your web browser, go to **https://localhost/admin/** and sign in with the email and password from
step 4.

Your browser will warn you that the connection isn't private. That's expected on your own computer: the
app is making up its own security certificate, since there's no real web address yet. Click **Advanced**
(or **Show Details**) and choose to continue to localhost. Once you [put it on the internet](#put-it-on-the-internet)
with a real address, the warning goes away.

### 7. Add your menu

The tabs along the bottom are where things live. A good order:

1. **Pour sizes**: the sizes you serve, such as 4 oz, 12 oz and a pint.
2. **Breweries**: who makes what you pour (add your own brewery too).
3. **Items**: your drinks, each with its brewery, style and strength.
4. **Menus**: create a menu, add sections to it ("Drafts", "Cans", "Guest Taps"), and add items to each
   section with their prices.

On a menu's screen, **Design print menu** and **Design menu board** open the designers, with a live
preview and ready-made styles to start from.

## Put it on the internet

For your website and TV to show your menu, the app has to be running on a computer that is always on
and reachable by a web address, like `menu.yourbrewery.com`. There are two ways to do that. Either way
you'll use the same steps as above, on that computer, plus an address and a couple of open "doors"
(ports) to the outside world.

**You will need**

- A **domain name** you control (from any domain seller), and the ability to add a DNS record to it. A
  subdomain such as `menu.yourbrewery.com` is ideal.
- An always-on computer, either:
  - **A small rented server** (also called a "VPS" or "cloud server") from a provider such as
    DigitalOcean, Linode, Hetzner or Vultr. This is the easier and more reliable choice. Pick a Linux
    server (Ubuntu is a good choice) with 2 GB of memory or more; building the app needs some room.
  - **A computer at your brewery**, if you're comfortable changing your router's settings (see
    ["Hosting from your own network"](#hosting-from-your-own-network)).

If this is more than you want to take on, a friend or IT person can do it in about an hour with this
guide, or you can ask about [paid hosting](#ways-to-use-it).

### On a rented server

1. **Create the server** with your provider and note its public IP address (four numbers, like
   `203.0.113.10`).
2. **Point your domain at it.** In your domain seller's DNS settings, add an **A record** for the name you
   want (say `menu`) with the server's IP address as its value. It can take a few minutes, sometimes
   longer, to take effect.
3. **Open the doors.** In your provider's firewall settings, allow incoming traffic on **ports 80 and
   443** (and port 22 so you can connect). Don't open any others. Port 80 is needed to get your free
   security certificate even though everything is then served on 443.
4. **Connect to the server** (your provider shows how; usually `ssh root@203.0.113.10` in a terminal) and
   install Docker by following [Docker's instructions for your Linux version](https://docs.docker.com/engine/install/).
5. **Get the code** on the server, using the repository's address from its GitHub page:

   ```sh
   git clone https://github.com/Bombastion/taproom-offering-engine.git
   cd taproom-offering-engine
   ```

6. **Make your settings file**, as in [step 4 above](#4-make-your-settings-file), but also set your
   address:

   ```sh
   cp .env.example .env
   nano .env
   ```

   ```sh
   TOE_ADMIN_EMAIL=you@yourbrewery.com
   TOE_ADMIN_PASSWORD=pick-a-long-password-only-you-know
   DOMAIN=menu.yourbrewery.com
   ```

7. **Start it in the background:**

   ```sh
   docker compose up --build -d
   ```

8. **Visit https://menu.yourbrewery.com/admin/** and sign in. The first visit can take a few seconds
   while the security certificate is issued; after that the browser shows a normal padlock.

The app starts again by itself if the server restarts.

### Hosting from your own network

This works the same way, on a computer that stays on at your brewery, but your internet connection has to
cooperate. You'll need to:

1. Give that computer a fixed address on your network (your router's settings call this a "DHCP
   reservation" or "static lease").
2. Set your domain's A record to your internet connection's public IP address. If your provider changes
   it from time to time, use a "dynamic DNS" service that keeps the record up to date.
3. In your router, **forward only ports 80 and 443** to that computer. Do not forward port 3000.
4. Follow steps 5 to 8 above on that computer (on Windows or Mac, run Docker Desktop, and set it to start
   when you sign in).

Some internet providers block ports 80 and 443 for home connections. If yours does, a rented server is
the way to go.

### Staying safe

- Use a long, unique admin password, and keep `.env` private. Never post it anywhere.
- Only ports 80 and 443 should be reachable from the internet. The database isn't reachable from outside
  the app's own Docker network, so its default password is fine; don't add a `ports:` entry to the `db`
  service in `docker-compose.yml`, and don't open port 3000.
- Keep the `caddy_data` Docker volume across updates. It holds your security certificates, and losing it
  means getting new ones, which the certificate issuer limits.

## Looking after it

All commands are run in a terminal, in the app's folder.

**Stop and start**

```sh
docker compose down          # stop it (your menus are kept)
docker compose up -d         # start it again, in the background
docker compose logs -f       # watch what it's doing (Ctrl+C stops watching, not the app)
```

If you started it with `docker compose up` (no `-d`), press Ctrl+C in that window to stop it.

**Back up your menus.** Everything you've entered (menus, items, logos and accounts) lives in one
database. Make a backup before any update, and regularly:

```sh
docker compose exec db pg_dump -U postgres --clean --if-exists -f /tmp/backup.sql postgres
docker compose cp db:/tmp/backup.sql ./backup.sql
```

That leaves a file called `backup.sql` in the app's folder. Copy it somewhere safe that isn't this
computer (a cloud drive or a USB stick). Keep a few dated copies.

**Restore a backup** (this replaces what's in the app now):

```sh
docker compose stop taproom-offering-engine
docker compose cp ./backup.sql db:/tmp/backup.sql
docker compose exec db psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/backup.sql postgres
docker compose start taproom-offering-engine
```

**Update to a newer version.** Take a backup first. If you downloaded the code with `git clone`, run
this in the app's folder:

```sh
git pull
docker compose up --build -d
```

Any changes to the database are applied automatically when the app starts. If you downloaded a ZIP
instead, unzip the new version **over the same folder** (keep your `.env` file, and keep the folder's
name and location), then run `docker compose up --build -d`.

**Staff who need to edit the menu.** Each account has its own menus, items and breweries, and accounts
don't share them: someone who requests their own account starts with an empty app, not with yours. So
people who maintain the same menu sign in with the same account (change its password from the Account
screen when someone leaves). Separate accounts are for separate taprooms. See [Accounts and signing
in](#accounts-and-signing-in) for the details.

## If something goes wrong

**"Cannot connect to the Docker daemon", or `docker` isn't found.** Docker isn't running. Open Docker
Desktop (or on Linux, start the Docker service) and try again.

**An error that mentions `TOE_ADMIN_PASSWORD`.** The app can't find your settings. Check that the file is
named exactly `.env` (on Windows, make sure it isn't `.env.txt`), that it's in the same folder as
`docker-compose.yml`, and that the line `TOE_ADMIN_PASSWORD=` has a password after it.

**The browser warns the connection isn't private.** Expected on `https://localhost`, see [step 6](#6-open-the-admin-app).
On a real domain you shouldn't see it; if you do, the certificate hasn't been issued yet. Wait a minute
and check that the domain points at the server and that ports 80 and 443 are open.

**"Port is already allocated" or "address already in use".** Something else on the computer is using port
80 or 443. See [When port 80 or 443 is already in use](#when-port-80-or-443-is-already-in-use).

**I can't sign in.** Use the email and password from `.env` (the email defaults to `admin` if you left it
out). Changing `TOE_ADMIN_PASSWORD` in `.env` later does not change an existing account's password. To
set a new one, see [Forgotten passwords](#forgotten-passwords).

**The app started empty after I moved or re-downloaded the folder.** Docker ties your data to the folder's
name. Move the folder back, or restore a [backup](#looking-after-it).

**I want to delete everything and start over.** `docker compose down -v` stops the app and **permanently
deletes all of its data**, certificates included. Then start again from step 5.

## Show your menu on your website, TV and on paper

Once your menu is set up, each of these shows the current menu, so a change in the admin app appears
everywhere. Replace `menu.yourbrewery.com` with your address (`localhost` on your own computer), and
`<menuId>` with the long code in the admin app's address bar when you have a menu open
(`/admin/menus/<menuId>`).

- **On your website (Wix).** Edit the file `wix-widget/currently-on-tap.html`. Near the bottom, in the
  `CONFIG` block, set `API_BASE_URL` to `https://menu.yourbrewery.com` and `MENU_ID` to your menu's ID
  (the file ships with a sample ID and a local address). Then in the Wix editor add an HTML embed element,
  and paste in the whole file. The widget refreshes itself every 15 minutes (`REFRESH_INTERVAL_MS`). It
  needs your app to be [on the internet](#put-it-on-the-internet).
- **On the TV.** The menu board is made of pictures, 1080 by 1920 pixels, one for each screenful.
  `https://menu.yourbrewery.com/menus/<menuId>?format=digital` gives you all of them in a ZIP, and
  adding `&page=1` (or 2, 3 and so on) gives a single picture to put on a screen or in a slideshow. On a
  menu's screen in the admin app, "Menu board images" does the same.
- **On paper.** Open `https://menu.yourbrewery.com/menus/<menuId>?format=print` (or "Print view" on the
  menu's screen) and print it from your browser.

Each section can be left off any of these (on the section's screen), for example a "Non-Alcoholic Beers"
section that only goes on the TV. The [technical reference](#public-menu-urls) lists every address.

## Technical reference

Everything above is enough to run the app. The rest of this page is for people who want to change how
it's set up or work on the code.

| Piece | Where | What it is |
| ----- | ----- | ---------- |
| Server | repo root (`server.ts`, `app.ts`, `routes/`) | Express 5 + TypeScript (run with `tsx`), storing data in Postgres through Prisma |
| Admin client | `client/` | React + Vite app, served at `/admin/` (see [client/README.md](client/README.md)) |
| Wix widget | `wix-widget/currently-on-tap.html` | Embeddable "currently on tap" display |
| Reverse proxy | `Caddyfile` | HTTPS and routing in front of the server and admin client |

With Docker, `docker compose up --build` starts four services:

- `db`: Postgres, with its data in the `pg_data` volume
- `taproom-offering-engine`: the server. It applies database migrations on startup, then starts.
- `admin-client`: the built admin app, served by nginx
- `caddy`: the only thing exposed to the network, on ports 80 and 443 (the server is also bound to
  `127.0.0.1:3000` on the host, for local use only)

### Configuration

The settings file is `.env` (gitignored; Docker Compose reads it automatically). Start from `.env.example`.

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `TOE_ADMIN_PASSWORD` | **Yes** | The password for the first admin account. Docker Compose refuses to start without it. Use something long and random. Only used while there are no users; see [Accounts](#accounts-and-signing-in). |
| `TOE_ADMIN_EMAIL` | No | What the first admin signs in with. Defaults to `admin`; the older name `TOE_ADMIN_USERNAME` still works. |
| `TOE_SIGNUP_ENABLED` | No | Set to `false` to stop accepting requests for new accounts. On by default. See [Accounts](#accounts-and-signing-in). |
| `DOMAIN` | No | The domain Caddy serves, e.g. `menu.yourbrewery.com`. Defaults to `localhost`. A real domain gets a Let's Encrypt certificate automatically; `localhost` uses Caddy's own local certificate authority, so browsers show a certificate warning. Accepts a comma-separated list. |
| `INTERNAL_DOMAIN` | No | A name that only resolves on your own network, e.g. `taproom.lan` from a DNS entry on your router. Caddy serves it with a certificate from its local CA. Keep it out of `DOMAIN`; see below. |
| `HTTP_PORT`, `HTTPS_PORT` | No | Host ports Caddy listens on. Default `80` and `443`. Change them if something else on the machine already uses those (see below). |
| `DEFAULT_SNI` | No | Only for testing from other devices on your network by IP address. See below. |
| `DATABASE_URL` | Only without Docker | Postgres connection string, e.g. `postgres://postgres:postgres@localhost:5432/postgres`. Docker Compose sets this itself. |
| `TOE_SERVER_PORT` | No | Port the server listens on. Defaults to `3000`. |
| `TOE_TRUST_PROXY` | No | Set to `true` only when exactly one reverse proxy (Caddy) sits in front of the server. Docker Compose sets it. Never set it without a proxy: clients could spoof their IP and get around the rate limits. |

### Running with Docker, in more detail

The step-by-step guide above covers the normal cases. These are for less usual setups.

#### Testing from a phone or another computer

1. Find this machine's LAN IP (say `192.168.1.20`).
2. In `.env`, set `DOMAIN=localhost, 192.168.1.20` and `DEFAULT_SNI=192.168.1.20`.
3. Restart with `docker compose up --build` and browse to `https://192.168.1.20/admin/`.

#### Using an internal DNS name

If you give the machine a name on your own network (a DNS entry on your router, such as
`taproom.lan`), put it in `INTERNAL_DOMAIN`, **not** `DOMAIN`:

```sh
INTERNAL_DOMAIN=taproom.lan
```

Let's Encrypt only issues certificates for real public domains, so a name like this in `DOMAIN`
fails with `cannot issue for "taproom.lan": domain name does not end with a valid public suffix`.
Names in `INTERNAL_DOMAIN` get a certificate from Caddy's own local certificate authority instead.

Browsers will still warn until they trust that authority. To remove the warning, copy its root
certificate off the server and install it on each device that needs it:

```sh
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
```

Then add it to the device's trusted root certificates (on macOS, open it in Keychain Access and set
it to "Always Trust"). Phones need it installed and trusted in their certificate settings too.

#### When port 80 or 443 is already in use

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

### Running without Docker (for developers)

For working on the code.

You need **Node.js 22 or newer** (the Docker image uses Node 23) and a **PostgreSQL** database
(Postgres 18 is what Docker uses), with its address in `DATABASE_URL` in `.env`.

```sh
npm install                  # also generates the Prisma client into generated/
npx prisma migrate deploy    # creates the tables
npm start                    # http://localhost:3000
```

Run `npm run generate` after changing `prisma/schema.prisma`. To create a new migration during development, use
`npx prisma migrate dev --name <what-changed>`.

To work on the admin app with hot reload, run the server as above, then in another terminal:

```sh
cd client
npm install
npm run dev                  # http://localhost:5173/admin/
```

The dev server proxies `/api` to `localhost:3000`. See [client/README.md](client/README.md).

### Accounts and signing in

People sign in to the admin app with an email and password. The server stores a session for each
sign-in and gives the browser an httpOnly cookie (`toe_session`); only a hash of the cookie's
secret is stored, signing out ends the session on the server, and a disabled account loses access
on its next request. A normal sign-in lasts a day (and ends when the browser closes); "Keep me
signed in" lasts 30 days. Failed sign-ins are limited to 30 per 10 minutes per IP address.

#### Requesting and approving accounts

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

#### Forgotten passwords

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

#### Data ownership

Everything the admin app manages belongs to one account.
Another account's menus, items, etc., item or pour size produces a 404, and so does linking to it
from your own data. The one exception is the public menu formats below, which are found by the
menu's link and don't require login.

### Public menu URLs

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

#### Menu designs

How a menu looks on its two designable views is described by a **design**: a JSON document per
menu and view, validated on the way in and again whenever it is read, with a default for anything it
leaves out. A menu with no saved design looks like the default. The designer saves a whole design, so
changing the defaults later doesn't change a menu that has been saved. Fonts come from a fixed list the
server hosts itself (`models/fonts.ts`, files and licences in `public/fonts`).

- **Print** (`models/menuDesign.ts`, drawn by `print/render.ts` as an HTML page): fonts, sizes, colors,
  which fields appear in which columns, page size and margins, a footer. The default is the Modern preset.
- **Board** (`models/boardDesign.ts`, drawn by `board/render.ts` as a PDF that is turned into one PNG per
  screenful): background and safe margin, the logo and an optional title at the top, section bars, and
  item rows made of a picture and lines of text built from the item's fields. The default is the Bold
  preset (big condensed capitals on deep blue with red bars); Dark and Light are the other presets. Every size is in pixels of the 1080×1920 picture,
  and the board shows no prices. pdfkit can't use the web fonts, so the board draws with static
  regular/bold files in `public/fonts/board` (and `FiraSans-Regular.ttf`); a font is offered on the
  board only if it has them (`boardFiles` in `models/fonts.ts`).

The admin API (all under `/api`, signed in), where `<view>` is `print` or `board`:

| Request | Does |
| ------- | ---- |
| `GET /design/fonts`, `GET /design/presets` | The fonts and starting designs on offer for the print view; add `?view=board` for the board's |
| `GET /menus/<menuId>/design/<view>` | The menu's design, or the default (`isDefault: true`) |
| `PUT /menus/<menuId>/design/<view>` with `{ "design": {...} }` | Validates and saves it (400 with `issues`, one per bad field, if not) |
| `DELETE /menus/<menuId>/design/<view>` | Goes back to the default |
| `POST /menus/<menuId>/design/<view>/preview` with `{ "design": {...} }` | Draws the view with that design, without saving: the print menu as HTML, the board as `{ "pages": [PNG data URLs] }` at half size |

These are public and need no login. The menu board and print formats are rate limited (10 requests per minute per IP).
The admin API under `/api` always requires a signed-in user.

### Tests

```sh
npm test                 # server tests
cd client && npm test    # admin client tests
npm run test:docker      # both, in Docker
```

None of the tests need a database. See [TESTING.md](TESTING.md) for more.

### Project layout

```
server.ts, app.ts       Entry point and Express app (middleware, routes)
routes/                 menus.ts (public formats), api.ts (menu data and design API), auth.ts (sign in/out, signup, password), admin.ts (managing accounts)
auth/                   Password hashing, sessions, creating the first admin, password reset, settings
scripts/                Commands run on the server (reset-password)
middleware/             Session check, same-origin check and rate limits
storage/providers.ts    Data layer: Prisma/Postgres, plus an in-memory provider used by tests
prisma/                 Schema and migrations
print/                  The print menu: what it shows (model.ts, shared with the board), how it looks (css.ts) and the page itself (render.ts)
board/                  The menu board: layout as a PDF, rendered to PNGs (render.ts)
models/menuDesign.ts    The print design format, its defaults and validation, and the pieces the board design shares; models/boardDesign.ts is the board's; models/fonts.ts is the font list
public/                 Fonts
data/                   Sample JSON data loaded by the in-memory provider (tests only)
client/                 Admin app
wix-widget/             Wix embed
build/, docker-compose*.yml, Caddyfile   Container and proxy setup
```

## License

Taproom Offering Engine is **source-available** under the [Elastic License 2.0](LICENSE). In plain
words (the license text is what counts):

- You **can** run it for your own taproom or brewery, read the code, change it, and share your changes,
  as long as you keep the license and notices.
- You **can't** offer it to other people as a hosted or managed service, which includes charging others
  for access to a copy you run. Hosting it for other breweries is what the paid hosted plan is for.
- It comes as it is, with no warranty.

Because of that second limit this is not "open source" as the Open Source Initiative defines the term,
even though the code is public. The fonts in `public/fonts` and the libraries the app uses keep their own
licenses (the fonts' are in `public/fonts/licenses`). If you're not sure whether something you want to do
is allowed, open an issue and ask.
