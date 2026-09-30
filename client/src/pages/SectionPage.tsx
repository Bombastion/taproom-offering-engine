import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage, formatPrice, plural, SectionDetail } from '../api';
import { PageHeader, Screen, useGoBack } from '../components/Screen';
import { CheckIcon, PencilIcon, PlusIcon, ReorderIcon, SearchIcon, TrashIcon } from '../components/Icons';
import { Loading, LoadError } from '../components/QueryState';
import { ConfirmSheet, NameSheet, Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { moved, MoveButtons } from '../components/Reorder';

export function SectionPage() {
  const { menuId, sectionId } = useParams() as { menuId: string; sectionId: string };
  const queryKey = ['section', sectionId];
  const section = useQuery({ queryKey, queryFn: () => api.section(sectionId) });
  const queryClient = useQueryClient();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sheet, setSheet] = useState<'rename' | 'delete' | null>(null);
  const [reordering, setReordering] = useState(false);
  const goBackToMenu = useGoBack(`/menus/${menuId}`);

  const basePath = `/menus/${menuId}/sections/${sectionId}`;
  const menuName = section.data?.menu.displayName ?? 'Menu';
  const sectionName = section.data?.displayName ?? 'Section';

  // The "add item" sheet lives in the URL (?add=1), so the phone's back gesture closes it
  // instead of leaving the section.
  const adding = searchParams.get('add') === '1';
  const openAdd = () => navigate({ search: '?add=1' }, { state: { sheetPushed: true } });
  const closeAdd = () => {
    if ((location.state as { sheetPushed?: boolean } | null)?.sheetPushed) navigate(-1);
    else setSearchParams({}, { replace: true });
  };

  const refreshAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ['menu', menuId] }),
      queryClient.invalidateQueries({ queryKey: ['menus'] }),
    ]);

  const move = async (from: number, to: number) => {
    const current = queryClient.getQueryData<SectionDetail>(queryKey);
    if (!current) return;
    const items = moved(current.items, from, to);
    queryClient.setQueryData<SectionDetail>(queryKey, { ...current, items });
    try {
      await api.reorderItems(sectionId, items.map((i) => i.menuItemId));
      queryClient.invalidateQueries({ queryKey: ['menu', menuId] });
    } catch (e) {
      queryClient.setQueryData(queryKey, current);
      toast(`Couldn't reorder: ${errorMessage(e)}`, 'error');
    }
  };

  const itemCount = section.data?.items.length ?? 0;

  return (
    <Screen
      barTitle="Section"
      parent={`/menus/${menuId}`}
      crumbs={[
        { label: 'Menus', to: '/' },
        { label: menuName, to: `/menus/${menuId}` },
        { label: sectionName, to: basePath },
      ]}
      fab={
        section.data && !reordering ? (
          <button type="button" className="fab" onClick={openAdd}>
            <PlusIcon size={22} strokeWidth={2.4} />Add item
          </button>
        ) : undefined
      }
    >
      <div className="page">
        {section.isPending && <Loading />}
        {section.isError && <LoadError error={section.error} onRetry={() => section.refetch()} />}
        {section.data && (
          <>
            <PageHeader
              eyebrow={`Section · ${section.data.menu.displayName}`}
              title={section.data.displayName}
              sub={itemCount ? `${plural(itemCount, 'item')} · tap one to edit` : undefined}
            />

            <div className="chip-row">
              <button type="button" className="chip" onClick={() => setSheet('rename')}>
                <PencilIcon />Rename
              </button>
              {itemCount > 1 && (
                <button type="button" className={`chip${reordering ? ' chip-on' : ''}`} aria-pressed={reordering} onClick={() => setReordering((r) => !r)}>
                  <ReorderIcon />{reordering ? 'Done' : 'Reorder'}
                </button>
              )}
              <button type="button" className="chip chip-danger" onClick={() => setSheet('delete')}>
                <TrashIcon />Delete section
              </button>
            </div>

            {itemCount === 0 && (
              <div className="empty">
                <strong>Nothing pouring here yet</strong>
                Add beers from your item library, or create a new one.
              </div>
            )}

            <div className="stack-sm">
              {section.data.items.map((entry, index) => {
                const item = entry.item;
                const title = item?.displayName ?? 'Missing item';
                const meta = [item?.style, item?.breweryName].filter(Boolean).join(' · ');
                const body = (
                  <div className="card-main">
                    <div className="card-title-row spread">
                      <span className="card-title">{title}</span>
                      {item?.abv !== null && item?.abv !== undefined && <span className="abv">{item.abv}% ABV</span>}
                    </div>
                    {meta && <div className="card-meta">{meta}</div>}
                    {!reordering && (
                      <div className="pour-row">
                        {entry.pours.length === 0 && <span className="pour pour-empty">No prices set</span>}
                        {entry.pours.map((pour) => (
                          <span key={pour.containerId} className="pour">
                            {pour.displayName} {formatPrice(pour.price)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
                return reordering ? (
                  <div key={entry.menuItemId} className="card card-static">
                    {body}
                    <MoveButtons label={title} index={index} count={itemCount} onMove={move} />
                  </div>
                ) : (
                  <Link key={entry.menuItemId} to={`${basePath}/items/${entry.menuItemId}`} className="card card-top">
                    {body}
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>

      {adding && section.data && (
        <AddItemSheet
          section={section.data}
          newItemPath={`${basePath}/items/new`}
          onClose={closeAdd}
          onAdded={async (name) => {
            await refreshAll();
            closeAdd();
            toast(`${name} added to ${section.data!.displayName}`);
          }}
        />
      )}
      {sheet === 'rename' && section.data && (
        <NameSheet
          title="Rename section"
          label="Section name"
          initialValue={section.data.displayName}
          submitLabel="Save name"
          onClose={() => setSheet(null)}
          onSubmit={async (name) => {
            await api.renameSection(sectionId, name);
            await refreshAll();
            setSheet(null);
            toast('Section renamed');
          }}
        />
      )}
      {sheet === 'delete' && section.data && (
        <ConfirmSheet
          title={`Delete ${section.data.displayName}?`}
          message={
            itemCount
              ? `This removes the section and its ${plural(itemCount, 'item')} from ${menuName}. The beers stay in your item library.`
              : `This removes the empty section from ${menuName}.`
          }
          confirmLabel="Delete section"
          onClose={() => setSheet(null)}
          onConfirm={async () => {
            await api.deleteSection(sectionId);
            toast(`Deleted ${sectionName}`);
            goBackToMenu();
            // After leaving the screen, so the deleted section isn't refetched
            queryClient.removeQueries({ queryKey });
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['menu', menuId] }),
              queryClient.invalidateQueries({ queryKey: ['menus'] }),
            ]);
          }}
        />
      )}
    </Screen>
  );
}

type AddItemSheetProps = {
  section: SectionDetail;
  newItemPath: string;
  onClose: () => void;
  onAdded: (name: string) => Promise<void>;
};

function AddItemSheet({ section, newItemPath, onClose, onAdded }: AddItemSheetProps) {
  const library = useQuery({ queryKey: ['items'], queryFn: api.items });
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSection = useMemo(() => new Set(section.items.map((entry) => entry.item?.id)), [section.items]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (library.data ?? []).filter(
      (item) => !q || [item.displayName, item.style, item.breweryName].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [library.data, query]);

  const add = async (itemId: string, name: string) => {
    setBusyId(itemId);
    setError(null);
    try {
      await api.addExistingItem(section.id, itemId);
      await onAdded(name);
    } catch (e) {
      setError(errorMessage(e));
      setBusyId(null);
    }
  };

  return (
    <Sheet title={section.displayName} eyebrow="Add to" onClose={onClose} tall>
      <div className="sheet-body stack-sm">
        <div className="search">
          <span className="search-icon"><SearchIcon /></span>
          <input
            className="field"
            type="search"
            aria-label="Search item library"
            placeholder="Search your beers"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Link to={newItemPath} replace className="card card-accent">
          <div className="card-icon card-icon-solid"><PlusIcon /></div>
          <div className="card-main">
            <div className="card-title accent-text">Create a new item</div>
            <div className="card-meta">Name, style, ABV and prices</div>
          </div>
        </Link>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <div className="eyebrow sheet-label">From your item library</div>
      <div className="sheet-scroll">
        {library.isPending && <Loading />}
        {library.isError && <LoadError error={library.error} onRetry={() => library.refetch()} />}
        {matches.map((item) => {
          const already = onSection.has(item.id);
          const meta = [item.style, item.abv !== null ? `${item.abv}%` : null, item.breweryName].filter(Boolean).join(' · ');
          return (
            <div key={item.id} className="lib-row">
              <div className="lib-main">
                <div className="lib-name">{item.displayName}</div>
                {meta && <div className="card-meta truncate">{meta}</div>}
              </div>
              {already ? (
                <span className="on-menu"><CheckIcon />On menu</span>
              ) : (
                <button
                  type="button"
                  className="chip chip-accent"
                  aria-label={`Add ${item.displayName}`}
                  disabled={busyId !== null}
                  onClick={() => add(item.id, item.displayName)}
                >
                  {busyId === item.id ? 'Adding…' : 'Add'}
                </button>
              )}
            </div>
          );
        })}
        {library.data && matches.length === 0 && (
          <p className="muted lib-empty">
            {query ? `No beers match "${query}". Create it as a new item instead.` : 'Your item library is empty. Create a new item above.'}
          </p>
        )}
      </div>
    </Sheet>
  );
}
