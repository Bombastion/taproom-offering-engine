import { SessionUser, setSignedOut } from './auth';

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
  // Every item on the section, active or not
  itemCount: number;
  // How many of those are inactive (left off the published menus)
  inactiveCount: number;
  // Names of the active items only
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
  // Inactive items keep their place and prices, but don't show on the published menus
  active: boolean;
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

// Where the website widget gets this item's image when it has none of its own
export type LogoFallback = 'brewery' | 'menu' | 'none';

export type MenuItemDetail = {
  menuItemId: string;
  active: boolean;
  // This item's own image (a data: URL), or null
  logo: string | null;
  logoFallback: LogoFallback;
  section: { id: string; displayName: string };
  menu: { id: string; displayName: string };
  item: ItemDetail | null;
  pours: Pour[];
  otherPlacementCount: number;
};

// Where an item sits on a menu, for linking to it in the item editor
export type Placement = { menuItemId: string; active: boolean; menuId: string; menuName: string; sectionId: string; sectionName: string };

// An item on its own, from the library, with the menu sections it's on
export type LibraryItemDetail = ItemDetail & { placementCount: number; placements: Placement[] };

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

// priceCount: how many item prices use this pour size. It can only be deleted at 0.
export type Container = { id: string; displayName: string; containerName: string; order: number | null; priceCount: number };

// An item priced in a given pour size
export type ContainerUse = Placement & { itemName: string; price: number };

export type ItemInput = {
  displayName: string;
  internalName: string | null;
  breweryId: string | null;
  style: string | null;
  abv: number | null;
  description: string | null;
};

export type PourInput = { containerId: string; price: number };

// An account as an admin sees it on the Users screen
export type UserStatus = 'PENDING' | 'ACTIVE' | 'DISABLED';
export type AdminUser = SessionUser & { status: UserStatus; createdAt: string; approvedAt: string | null };
export type UserCounts = Record<UserStatus, number>;
export type UserList = { users: AdminUser[]; counts: UserCounts };

// ---- Requests ----

export class ApiError extends Error {
  status: number;
  // A machine-readable reason, for the few errors the server explains that way (e.g. a sign-in
  // refused because the account is "pending" approval or "disabled")
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function friendlyMessage(status: number, body: string): string {
  if (status === 401) return 'Please sign in again.';
  if (status === 429) return body || 'Too many attempts. Please wait a bit and try again.';
  if (status >= 500) return 'Something went wrong on the server. Please try again.';
  return body || `Request failed (${status})`;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // The session cookie rides along on its own; it's never readable from this code
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, "Couldn't reach the server. Check your connection and try again.");
  }

  if (!response.ok) {
    let text = (await response.text().catch(() => '')).slice(0, 300);
    let code: string | undefined;
    // Most errors are plain text, but a few come as { code, message }
    if (response.headers.get('Content-Type')?.includes('application/json')) {
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed?.message === 'string') text = parsed.message;
        if (typeof parsed?.code === 'string') code = parsed.code;
      } catch {
        // Not JSON after all; use the text as it came
      }
    }
    // The session ended (signed out elsewhere, expired, account disabled): back to sign-in. A
    // refused sign-in attempt is a 401 too, but there's no session to end.
    if (response.status === 401 && path !== '/auth/login') setSignedOut();
    throw new ApiError(response.status, friendlyMessage(response.status, text), code);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  login: (email: string, password: string, remember: boolean) =>
    request<{ user: SessionUser }>('POST', '/auth/login', { email, password, remember }),
  logout: () => request<void>('POST', '/auth/logout'),
  // Asks for an account; an admin has to approve it before it can sign in. The answer is the same
  // whether or not the email already has one.
  signup: (email: string, password: string, displayName: string | null) =>
    request<{ status: 'pending' }>('POST', '/auth/signup', { email, password, displayName }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('POST', '/auth/password', { currentPassword, newPassword }),

  // Admins only
  adminUsers: () => request<UserList>('GET', '/admin/users'),
  approveUser: (userId: string) => request<AdminUser>('POST', `/admin/users/${encodeURIComponent(userId)}/approve`),
  rejectUser: (userId: string) => request<AdminUser>('POST', `/admin/users/${encodeURIComponent(userId)}/reject`),
  disableUser: (userId: string) => request<AdminUser>('POST', `/admin/users/${encodeURIComponent(userId)}/disable`),
  enableUser: (userId: string) => request<AdminUser>('POST', `/admin/users/${encodeURIComponent(userId)}/enable`),
  setUserRole: (userId: string, role: 'USER' | 'ADMIN') =>
    request<AdminUser>('PATCH', `/admin/users/${encodeURIComponent(userId)}/role`, { role }),
  // Who the browser's session cookie belongs to; a 401 means nobody
  me: () => request<{ user: SessionUser }>('GET', '/auth/me'),

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
  setMenuItemActive: (menuItemId: string, active: boolean) =>
    request<{ menuItemId: string; active: boolean }>('PUT', `/menu-items/${encodeURIComponent(menuItemId)}/active`, { active }),
  removeMenuItem: (menuItemId: string) => request<void>('DELETE', `/menu-items/${encodeURIComponent(menuItemId)}`),

  items: () => request<LibraryItem[]>('GET', '/items'),
  createItem: (item: ItemInput) => request<ItemDetail>('POST', '/items', item),
  item: (itemId: string) => request<LibraryItemDetail>('GET', `/items/${encodeURIComponent(itemId)}`),
  saveItem: (itemId: string, item: ItemInput) => request<ItemDetail>('PUT', `/items/${encodeURIComponent(itemId)}`, item),
  deleteItem: (itemId: string) => request<void>('DELETE', `/items/${encodeURIComponent(itemId)}`),
  breweries: () => request<Brewery[]>('GET', '/breweries'),
  createBrewery: (name: string) => request<Brewery>('POST', '/breweries', { name }),
  brewery: (breweryId: string) => request<BreweryDetail>('GET', `/breweries/${encodeURIComponent(breweryId)}`),
  updateBrewery: (breweryId: string, name: string, location: string | null) =>
    request<BreweryDetail>('PATCH', `/breweries/${encodeURIComponent(breweryId)}`, { name, location }),
  setMenuItemLogo: (menuItemId: string, logo: string) =>
    request<{ logo: string }>('PUT', `/menu-items/${encodeURIComponent(menuItemId)}/logo`, { logo }),
  removeMenuItemLogo: (menuItemId: string) =>
    request<void>('DELETE', `/menu-items/${encodeURIComponent(menuItemId)}/logo`),
  setBreweryLogo: (breweryId: string, logo: string) =>
    request<{ logo: string }>('PUT', `/breweries/${encodeURIComponent(breweryId)}/logo`, { logo }),
  removeBreweryLogo: (breweryId: string) => request<void>('DELETE', `/breweries/${encodeURIComponent(breweryId)}/logo`),
  containers: () => request<Container[]>('GET', '/containers'),
  createContainer: (displayName: string, containerName: string | null) =>
    request<Container>('POST', '/containers', { displayName, containerName }),
  updateContainer: (containerId: string, displayName: string, containerName: string | null) =>
    request<Container>('PATCH', `/containers/${encodeURIComponent(containerId)}`, { displayName, containerName }),
  reorderContainers: (containerIds: string[]) => request<void>('PUT', '/containers/order', { containerIds }),
  containerUses: (containerId: string) => request<ContainerUse[]>('GET', `/containers/${encodeURIComponent(containerId)}/uses`),
  deleteContainer: (containerId: string) => request<void>('DELETE', `/containers/${encodeURIComponent(containerId)}`),
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
