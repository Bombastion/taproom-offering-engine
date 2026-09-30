import { Navigate, Outlet, RouteObject, useLocation } from 'react-router';
import { QueryClient } from '@tanstack/react-query';
import { useCredentials } from './auth';
import { ApiError } from './api';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { MenuPage } from './pages/MenuPage';
import { SectionPage } from './pages/SectionPage';
import { ItemEditorPage } from './pages/ItemEditorPage';
import { ItemsPage } from './pages/ItemsPage';
import { BreweriesPage } from './pages/BreweriesPage';
import { BreweryPage } from './pages/BreweryPage';
import { PourSizesPage } from './pages/PourSizesPage';
import { NotFoundPage } from './pages/NotFoundPage';

// The app's routes and data-fetching defaults, kept apart from main.tsx (which mounts them into
// the page) so the tests can render the same routes in a memory router.

// Don't retry requests the server has clearly answered (bad login, not found, etc.)
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
      },
    },
  });
}

// Every screen except sign-in needs the admin login
export function RequireSignIn() {
  const credentials = useCredentials();
  const location = useLocation();
  if (!credentials) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireSignIn />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/menus/:menuId', element: <MenuPage /> },
      { path: '/menus/:menuId/sections/:sectionId', element: <SectionPage /> },
      { path: '/menus/:menuId/sections/:sectionId/items/new', element: <ItemEditorPage /> },
      { path: '/menus/:menuId/sections/:sectionId/items/:menuItemId', element: <ItemEditorPage /> },
      { path: '/items', element: <ItemsPage /> },
      { path: '/breweries', element: <BreweriesPage /> },
      { path: '/breweries/:breweryId', element: <BreweryPage /> },
      { path: '/pour-sizes', element: <PourSizesPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
