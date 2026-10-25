import { vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routes } from '../src/app';
import { resetSession, SessionUser, setSignedIn, setSignedOut } from '../src/auth';
import { ToastProvider } from '../src/components/Toast';

export type RecordedRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
};

type Reply = { status?: number; body?: unknown; text?: string };
type Handler = Reply | ((request: RecordedRequest) => Reply | Promise<Reply>);

export function json(body: unknown, status = 200): Reply {
  return { status, body };
}

export function status(code: number, text = ''): Reply {
  return { status: code, text };
}

/*
Replaces fetch with a fake server. Handlers are keyed by "METHOD /api/path" (no query string),
and either give a canned reply or compute one from the request. Anything unhandled fails the
request with a 599 and is listed in `unhandled`, so a test notices calls it didn't expect.
*/
export function mockApi(handlers: Record<string, Handler>) {
  // Admins' screens ask for the user list to show the "waiting for approval" badge; most tests
  // aren't about that, so by default nobody is waiting
  handlers = {
    'GET /api/admin/users': json({ users: [], counts: { PENDING: 0, ACTIVE: 0, DISABLED: 0 } }),
    // The sign-in screens ask whether to offer "Request an account"
    'GET /api/auth/config': json({ signupEnabled: true }),
    ...handlers,
  };
  const requests: RecordedRequest[] = [];
  const unhandled: string[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const recorded = { method, path: url.pathname, headers, body };
    requests.push(recorded);

    const handler = handlers[`${method} ${url.pathname}`];
    if (!handler) {
      unhandled.push(`${method} ${url.pathname}`);
      return new Response('No mock for this request', { status: 599 });
    }
    const reply = typeof handler === 'function' ? await handler(recorded) : handler;
    const code = reply.status ?? 200;
    if (reply.body !== undefined) {
      return new Response(JSON.stringify(reply.body), { status: code, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(code === 204 ? null : reply.text ?? '', { status: code });
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    fetch: fetchMock,
    requests,
    unhandled,
    // Requests matching a method and path
    calls: (method: string, path: string) => requests.filter((r) => r.method === method && r.path === path),
  };
}

export const ADMIN: SessionUser = { id: 'u1', email: 'admin@example.com', displayName: 'Admin', role: 'ADMIN' };
export const MEMBER: SessionUser = { id: 'u2', email: 'member@example.com', displayName: null, role: 'USER' };

// Renders the real app routes at a URL, signed in by default. `signedIn: 'unknown'` leaves the
// app not yet knowing, so it asks the server (GET /api/auth/me) like it does on a fresh page load.
export function renderApp(path: string, { signedIn = true as boolean | 'unknown', as: who = ADMIN }: { signedIn?: boolean | 'unknown'; as?: SessionUser } = {}) {
  if (signedIn === 'unknown') resetSession();
  else if (signedIn) setSignedIn(who);
  else setSignedOut();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...utils, router, user, queryClient, location: () => router.state.location };
}
