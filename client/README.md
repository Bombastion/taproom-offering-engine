# Taproom admin client

A mobile-first web app for managing menus, sections (sub-menus) and items. It's a React +
TypeScript app built with Vite, and it talks to the server's JSON API under `/api`
(`routes/api.ts`, `routes/auth.ts`). People sign in with an email and password; the server keeps
the session in an httpOnly cookie, so the app never stores a password or token. The first admin
is created from `TOE_ADMIN_EMAIL` / `TOE_ADMIN_PASSWORD` (see the main README).

The app is served at `/admin/` on the same domain as the server, so no CORS setup is needed.

## Running it with Docker (normal use)

`docker compose up --build` from the repo root starts it alongside the server. Caddy routes
`https://$DOMAIN/admin/` to this app (the `admin-client` service: nginx serving the built
files) and everything else, including `/api`, to the server. For local testing with the default
`DOMAIN=localhost`, open https://localhost/admin/ (expect a certificate warning; Caddy uses its
own local certificate authority for localhost).

## Developing

```sh
# Terminal 1: run the server however you normally do, on localhost:3000,
# with TOE_ADMIN_PASSWORD set

# Terminal 2
cd client
npm install
npm run dev        # http://localhost:5173/admin/
```

The dev server proxies `/api` (and `/fonts`, which the print menu designer's preview loads its
fonts from) to `http://localhost:3000`; set `TOE_API_TARGET` to point it somewhere else.

`npm run build` type-checks and writes the production build to `dist/`.

`npm test` runs the unit tests in `test/` (Vitest + Testing Library in jsdom); `npm run
test:watch` re-runs them as you edit. See `TESTING.md` at the repo root for running them in Docker.

## Layout

- `src/main.tsx`: routes. Every screen has a real URL, so the phone's back gesture, reloads and
  shared links all work:
  - `/admin/` menus
  - `/admin/menus/:menuId` a menu's sections
  - `/admin/menus/:menuId/sections/:sectionId` a section's items (`?add=1` opens the add sheet)
  - `/admin/menus/:menuId/sections/:sectionId/items/:menuItemId` the item editor (`/new` to create)
  - `/admin/breweries` and `/admin/breweries/:breweryId` (details and logo)
  - `/admin/items` the item library, and `/admin/items/:itemId` to edit one (`/new` to create)
  - `/admin/pour-sizes` pour sizes (added, renamed, reordered and deleted in place)
  - `/admin/menus/:menuId/design/print` the print menu designer (see below)
- `src/api.ts`: typed API calls. `src/auth.ts`: the stored sign-in. `src/usePendingUsers.ts`: the
  admin user list that the Users screen and the "waiting for approval" dot share.
- Accounts: `/signup` (request an account), `/account` (change password, sign out) and `/users`
  (admins only: approve, reject, disable, change roles). Regular users get "not found" for `/users`.
- `src/components/Screen.tsx`: the shared shell (top bar with Back and Home, breadcrumbs, tab bar).
- `docker/`: nginx config used by the image.

Menu and brewery logos can be uploaded, replaced and removed from the menu and brewery screens.
Whatever image is picked is converted in the browser to a PNG of at most 600px on its longest
side, since the menu board can only draw PNG and JPEG.

Items can be added to the library on their own from the Items screen, or straight onto a section
from that section. Prices belong to an item's place on a section, so they're only set there.

Deleting is guarded: an item can only be deleted once it's off every menu, and a pour size only
once no item prices use it. Until then, their screens list where they're still used, with links.

## The print menu designer

`pages/PrintDesignPage.tsx` edits how a menu's print view looks (`design.ts` has the types and helpers
for it; the server's `models/menuDesign.ts` decides what is valid). It keeps a draft of the whole design,
and nothing is kept until Save. The preview is the real print view, drawn by the server from the draft
(`POST /api/menus/:id/design/print/preview`) after a short pause in the editing, so it is always what will
print.

The preview is shown in an iframe on `public/preview-frame.html`, which is handed the page by
`postMessage` and writes it in. It can't be a `srcdoc` iframe: that would inherit the app's strict
content policy (no inline style or script) and would not be in quirks mode, which the print page needs.
The frame page is served sandboxed with a policy of its own (`docker/security-headers-preview.conf`, wired
up in `docker/nginx.conf`). After changing any of these, check it in a real browser; jsdom can't.

The controls are one group per part of the menu (Page, Logo and title, Section headings, Columns, Rows,
Footer), in `components/design/groups.tsx` and `columns.tsx`; only one is open at a time. A group is given the
design and a `change(path, value)` function and holds no state beyond which of its entries are open, so adding
a control is a few lines. `StyleEditor` is the whole text style (font, size, weight, color, alignment, italic,
uppercase, letter spacing, line height) and is used for every piece of text. The small inputs in `controls.tsx`
only report values the server would accept, so the draft is always a valid design.

The Columns group edits what is in each item row, from left to right: item details (lines of text, each made
of parts: a field of the item, what is printed before it and how it is written, with an optional style of its
own, kept as only what differs from the line's), prices (which pour sizes, their width, the price format, and
styles for the prices and the size names) and pictures. Columns are reordered with arrows and open in place
(`Fold.tsx`), so the preview stays in view. A column's width is either its own share or "what the others
leave", and the editor only offers what keeps the widths within 100%. Prices can be limited to some pour sizes,
which it lists from `/api/containers` (the designer doesn't wait for them, only that part of it does).
