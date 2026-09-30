import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/fraunces/index.css';
import '@fontsource/instrument-sans/400.css';
import '@fontsource/instrument-sans/500.css';
import '@fontsource/instrument-sans/600.css';
import '@fontsource/instrument-sans/700.css';
import './styles.css';
import { useCredentials } from './auth';
import { ApiError } from './api';
import { ToastProvider } from './components/Toast';
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Don't retry requests the server has clearly answered (bad login, not found, etc.)
      retry: (failureCount, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2,
    },
  },
});

// Every screen except sign-in needs the admin login
function RequireSignIn() {
  const credentials = useCredentials();
  const location = useLocation();
  if (!credentials) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

const router = createBrowserRouter(
  [
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
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
