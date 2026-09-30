import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { signOut } from '../auth';
import { useQueryClient } from '@tanstack/react-query';
import { BackIcon, BreweryIcon, ChevronRight, ExternalIcon, GlassIcon, HomeIcon, ListIcon, MoreIcon, MugIcon, PourIcon } from './Icons';

export type Crumb = { label: string; to: string };

// Goes back one step in the app's own history when there is one (so Back returns to exactly
// the screen you came from), otherwise up to the given parent screen (e.g. after opening a
// deep link directly, or signing in).
export function useGoBack(parent: string) {
  const navigate = useNavigate();
  return useCallback(() => {
    if (hasInAppHistory()) navigate(-1);
    else navigate(parent, { replace: true });
  }, [navigate, parent]);
}

// React Router numbers the history entries it creates (history.state.idx), starting at 0 for
// the entry the app was opened on; anything above 0 means there's an in-app screen to go back to.
function hasInAppHistory(): boolean {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return typeof idx === 'number' && idx > 0;
}

type ScreenProps = {
  barTitle: string;
  // Where Back goes when there's no in-app history. Omit on top-level screens (no Back button).
  parent?: string;
  crumbs?: Crumb[];
  tabs?: boolean;
  footer?: ReactNode;
  fab?: ReactNode;
  children: ReactNode;
};

export function Screen({ barTitle, parent, crumbs, tabs = true, footer, fab, children }: ScreenProps) {
  const goBack = useGoBack(parent ?? '/');
  const location = useLocation();
  const main = useRef<HTMLElement>(null);

  // Each screen starts scrolled to the top
  useEffect(() => {
    main.current?.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="screen">
      <header className="topbar">
        {parent !== undefined ? (
          <button type="button" className="icon-btn" aria-label="Back" onClick={goBack}>
            <BackIcon />
          </button>
        ) : (
          <div className="brand-mark" aria-hidden="true"><MugIcon /></div>
        )}
        <div className="topbar-title">{barTitle}</div>
        {parent !== undefined && (
          <Link to="/" className="icon-btn" aria-label="Home">
            <HomeIcon />
          </Link>
        )}
        <MoreMenu />
      </header>

      {crumbs && crumbs.length > 0 && (
        <nav className="crumbs" aria-label="Breadcrumb">
          <ol>
            {crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1;
              return (
                <li key={crumb.to}>
                  {index > 0 && <span className="crumb-sep"><ChevronRight size={14} strokeWidth={2.5} /></span>}
                  {last ? (
                    <span className="crumb crumb-current" aria-current="page">{crumb.label}</span>
                  ) : (
                    <Link className="crumb" to={crumb.to}>{crumb.label}</Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <main ref={main} className={`screen-main${fab ? ' has-fab' : ''}`}>{children}</main>

      {fab}
      {footer}
      {tabs && !footer && <TabBar />}
    </div>
  );
}

function TabBar() {
  const location = useLocation();
  const menusActive = location.pathname === '/' || location.pathname.startsWith('/menus');
  return (
    <nav className="tabbar" aria-label="Main">
      <NavLink to="/" className={() => `tab${menusActive ? ' active' : ''}`} aria-current={menusActive ? 'page' : undefined} end>
        <ListIcon />Menus
      </NavLink>
      <NavLink to="/items" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
        <GlassIcon />Items
      </NavLink>
      <NavLink to="/breweries" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
        <BreweryIcon />Breweries
      </NavLink>
      <NavLink to="/pour-sizes" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
        <PourIcon />Pour sizes
      </NavLink>
    </nav>
  );
}

function MoreMenu() {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="more" ref={wrapper}>
      <button type="button" className="icon-btn" aria-label="More options" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        <MoreIcon />
      </button>
      {open && (
        <div className="more-menu">
          <a href="/" className="more-item" target="_blank" rel="noopener">
            Classic editor <ExternalIcon />
          </a>
          <button
            type="button"
            className="more-item"
            onClick={() => {
              queryClient.clear();
              signOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// Page heading block used at the top of each screen
export function PageHeader({ eyebrow, title, sub, mono }: { eyebrow?: string; title: string; sub?: ReactNode; mono?: string }) {
  return (
    <div className="page-header">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1 className="page-title">{title}</h1>
      {mono && <div className="mono muted-sm">{mono}</div>}
      {sub && <div className="muted">{sub}</div>}
    </div>
  );
}
