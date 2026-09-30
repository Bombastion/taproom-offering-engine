import { basicAuthHeader, Credentials, getCredentials, signOut } from './auth';

// ---- Shapes returned by the server's /api routes (routes/api.ts) ----

export type MenuSummary = {
  id: string;
  displayName: string;
  internalName: string;
  sectionCount: number;
  itemCount: number;
};

export type SectionSummary = {
  id: string;
  displayName: string;
  internalName: string;
  order: number | null;
  itemCount: number;
  itemNames: string[];
};

export type MenuDetail = {
  id: string;
  displayName: string;
  internalName: string;
  hasLogo: boolean;
  // A data: URL ready for <img src>, or null
  logo: string | null;
  sections: SectionSummary[];
};

export type ItemDetail = {
  id: string;
  displayName: string;
  internalName: string;
  breweryId: string | null;
  breweryName: string | null;
  style: string | null;
  abv: number | null;
  description: string | null;
  category: string | null;
};

export type Pour = {
  containerId: string;
  displayName: string;
  order: number | null;
  price: number;
};

export type SectionEntry = {
  menuItemId: string;
  order: number | null;
  item: ItemDetail | null;
  pours: Pour[];
};

export type SectionDetail = {
  id: string;
  displayName: string;
  internalName: string;
  menu: { id: string; displayName: string };
  items: SectionEntry[];
};

export type MenuItemDetail = {
  menuItemId: string;
  section: { id: string; displayName: string };
  menu: { id: string; displayName: string };
  item: ItemDetail | null;
  pours: Pour[];
  otherPlacementCount: number;
};

export type LibraryItem = {
  id: string;
  displayName: string;
  internalName: string;
  breweryId: string | null;
  breweryName: string | null;
  style: string | null;
  abv: number | null;
};

export type Brewery = { id: string; name: string; location: string | null; hasLogo: boolean };

export type BreweryDetail = {
  id: string;
  name: string;
  location: string | null;
  logo: string | null;
  items: { id: string; displayName: string; style: string | null; abv: number | null }[];
};

export type Container = { id: string; displayName: string; containerName: string; order: number | null };

export type ItemInput = {
  displayName: string;
  internalName: string | null;
  breweryId: string | null;
  style: string | null;
  abv: number | null;
  description: string | null;
};

export type PourInput = { containerId: string; price: number };

// ---- Requests ----

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function friendlyMessage(status: number, body: string): string {
  if (status === 401) return 'Please sign in again.';
  if (status === 429) return body || 'Too many attempts. Please wait a bit and try again.';
  if (status >= 500) return 'Something went wrong on the server. Please try again.';
  return body || `Request failed (${status})`;
}

async function request<T>(method: string, path: string, body?: unknown, credentials?: Credentials): Promise<T> {
  const creds = credentials ?? getCredentials();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (creds) headers.Authorization = basicAuthHeader(creds);
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Couldn't reach the server. Check your connection and try again.");
  }

  if (!response.ok) {
    const text = (await response.text().catch(() => '')).slice(0, 300);
    // Stored credentials stopped working (password changed, etc.): send the user to sign in.
    if (response.status === 401 && !credentials) signOut();
    throw new ApiError(response.status, friendlyMessage(response.status, text));
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  checkCredentials: (credentials: Credentials) => request<{ ok: true }>('GET', '/session', undefined, credentials),

  menus: () => request<MenuSummary[]>('GET', '/menus'),
  createMenu: (displayName: string) => request<MenuSummary>('POST', '/menus', { displayName }),
  menu: (menuId: string) => request<MenuDetail>('GET', `/menus/${encodeURIComponent(menuId)}`),
  renameMenu: (menuId: string, displayName: string) =>
    request<MenuSummary>('PATCH', `/menus/${encodeURIComponent(menuId)}`, { displayName }),
  setMenuLogo: (menuId: string, logo: string) =>
    request<{ logo: string }>('PUT', `/menus/${encodeURIComponent(menuId)}/logo`, { logo }),
  removeMenuLogo: (menuId: string) => request<void>('DELETE', `/menus/${encodeURIComponent(menuId)}/logo`),
  createSection: (menuId: string, displayName: string) =>
    request<SectionSummary>('POST', `/menus/${encodeURIComponent(menuId)}/sections`, { displayName }),
  reorderSections: (menuId: string, sectionIds: string[]) =>
    request<void>('PUT', `/menus/${encodeURIComponent(menuId)}/sections/order`, { sectionIds }),

  section: (sectionId: string) => request<SectionDetail>('GET', `/sections/${encodeURIComponent(sectionId)}`),
  renameSection: (sectionId: string, displayName: string) =>
    request<void>('PATCH', `/sections/${encodeURIComponent(sectionId)}`, { displayName }),
  deleteSection: (sectionId: string) => request<void>('DELETE', `/sections/${encodeURIComponent(sectionId)}`),
  addExistingItem: (sectionId: string, itemId: string) =>
    request<{ menuItemId: string }>('POST', `/sections/${encodeURIComponent(sectionId)}/items`, { itemId }),
  addNewItem: (sectionId: string, item: ItemInput, pours: PourInput[]) =>
    request<{ menuItemId: string }>('POST', `/sections/${encodeURIComponent(sectionId)}/items`, { item, pours }),
  reorderItems: (sectionId: string, menuItemIds: string[]) =>
    request<void>('PUT', `/sections/${encodeURIComponent(sectionId)}/items/order`, { menuItemIds }),

  menuItem: (menuItemId: string) => request<MenuItemDetail>('GET', `/menu-items/${encodeURIComponent(menuItemId)}`),
  saveMenuItem: (menuItemId: string, item: ItemInput, pours: PourInput[]) =>
    request<void>('PUT', `/menu-items/${encodeURIComponent(menuItemId)}`, { item, pours }),
  removeMenuItem: (menuItemId: string) => request<void>('DELETE', `/menu-items/${encodeURIComponent(menuItemId)}`),

  items: () => request<LibraryItem[]>('GET', '/items'),
  breweries: () => request<Brewery[]>('GET', '/breweries'),
  createBrewery: (name: string) => request<Brewery>('POST', '/breweries', { name }),
  brewery: (breweryId: string) => request<BreweryDetail>('GET', `/breweries/${encodeURIComponent(breweryId)}`),
  updateBrewery: (breweryId: string, name: string, location: string | null) =>
    request<BreweryDetail>('PATCH', `/breweries/${encodeURIComponent(breweryId)}`, { name, location }),
  setBreweryLogo: (breweryId: string, logo: string) =>
    request<{ logo: string }>('PUT', `/breweries/${encodeURIComponent(breweryId)}/logo`, { logo }),
  removeBreweryLogo: (breweryId: string) => request<void>('DELETE', `/breweries/${encodeURIComponent(breweryId)}/logo`),
  containers: () => request<Container[]>('GET', '/containers'),
};

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

export function formatPrice(price: number): string {
  return `$${price % 1 === 0 ? price.toFixed(0) : price.toFixed(2)}`;
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}
