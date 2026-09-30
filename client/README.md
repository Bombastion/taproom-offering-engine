# Taproom admin client

A mobile-first web app for managing menus, sections (sub-menus) and items. It's a React +
TypeScript app built with Vite, and it talks to the server's JSON API under `/api`
(`routes/api.ts`), signing in with the server's admin username/password (`TOE_ADMIN_USERNAME` /
`TOE_ADMIN_PASSWORD`).

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

The dev server proxies `/api` to `http://localhost:3000`; set `TOE_API_TARGET` to point it
somewhere else.

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
- `src/api.ts`: typed API calls. `src/auth.ts`: the stored sign-in.
- `src/components/Screen.tsx`: the shared shell (top bar with Back and Home, breadcrumbs, tab bar).
- `docker/`: nginx config used by the image.

Menu and brewery logos can be uploaded, replaced and removed from the menu and brewery screens.
Whatever image is picked is converted in the browser to a PNG of at most 600px on its longest
side, since the menu board PDF can only draw PNG and JPEG.

Items can be added to the library on their own from the Items screen, or straight onto a section
from that section. Prices belong to an item's place on a section, so they're only set there.

Deleting is guarded: an item can only be deleted once it's off every menu, and a pour size only
once no item prices use it. Until then, their screens list where they're still used, with links.
