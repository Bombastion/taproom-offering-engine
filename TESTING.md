# Tests

Unit tests use [Vitest](https://vitest.dev) for both halves of the project:

| Suite  | Where          | What it covers |
| ------ | -------------- | -------------- |
| Server | `test/`        | Auth and rate-limit middleware, the admin JSON API (`routes/api.ts`), the public menu formats (`?format=json/widget/print/digital`), the shared route helpers, both data providers, and the full middleware stack in `app.ts` |
| Client | `client/test/` | The API client and sign-in storage, shared components (sheets, toasts, reordering, logo editor) and each screen, rendered in jsdom against a mocked API |

The classic `/manage` editor pages (and the old CRUD routes that only they use) aren't covered,
since they're being retired.

Nothing needs a database: server tests run against the in-memory `LocalDataProvider` (or a mocked
Prisma client for `PrismaDataProvider`'s own logic), and client tests replace `fetch` with a fake
server (`client/test/utils.tsx`).

## Running in Docker

From the repo root:

```sh
npm run test:docker
```

That builds and runs both suites from `docker-compose.test.yml`; the client suite also type-checks
the app and its tests. To run one suite, or one file:

```sh
docker compose -f docker-compose.test.yml run --rm --build server-tests
docker compose -f docker-compose.test.yml run --rm --build client-tests
docker compose -f docker-compose.test.yml run --rm --build server-tests npm test -- test/routes/api.test.ts
```

## Running locally

```sh
npm test              # server, from the repo root
npm run test:watch    # re-runs as you edit

cd client
npm test              # client
npm run test:watch
```

## Writing tests

- Server: `test/helpers.ts` has `seed()`, a small realistic menu in an in-memory provider, plus
  `appWith()` to mount a single router and `createApp()` (from `app.ts`) for the whole stack.
- Client: `renderApp('/some/url')` in `client/test/utils.tsx` renders the real routes, signed in,
  and `mockApi({ 'GET /api/menus': json([...]) })` fakes the server and records every request.
  Canned responses live in `client/test/fixtures.ts`.
