import { FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Container, errorMessage, formatPrice, plural } from '../api';
import { PageHeader, Screen } from '../components/Screen';
import { ChevronRight, PlusIcon, ReorderIcon, TrashIcon } from '../components/Icons';
import { Loading, LoadError } from '../components/QueryState';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { moved, MoveButtons } from '../components/Reorder';

// Pour sizes are the server's "containers": the ways an item is sold (10 oz, crowler, ...),
// shown on menus in this order.
export function PourSizesPage() {
  const queryKey = ['containers'];
  // Always refetched on arrival, since prices set elsewhere change which sizes are in use
  const containers = useQuery({ queryKey, queryFn: api.containers, staleTime: 0 });
  const queryClient = useQueryClient();
  const toast = useToast();
  // null: no sheet; 'new': adding one; otherwise the pour size being edited
  const [editing, setEditing] = useState<Container | 'new' | null>(null);
  const [reordering, setReordering] = useState(false);
  const count = containers.data?.length ?? 0;

  // Pour size names and order show up in the item editor and on every section
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ['section'] }),
      queryClient.invalidateQueries({ queryKey: ['menuItem'] }),
    ]);

  const move = async (from: number, to: number) => {
    const current = queryClient.getQueryData<Container[]>(queryKey);
    if (!current) return;
    const next = moved(current, from, to);
    queryClient.setQueryData<Container[]>(queryKey, next);
    try {
      await api.reorderContainers(next.map((c) => c.id));
      await refresh();
    } catch (e) {
      queryClient.setQueryData(queryKey, current);
      toast(`Couldn't reorder: ${errorMessage(e)}`, 'error');
    }
  };

  return (
    <Screen barTitle="Pour sizes">
      <div className="page">
        <PageHeader eyebrow="Library" title="Pour sizes" sub={containers.data ? `${plural(count, 'size')}, in menu order` : undefined} />
        {containers.isPending && <Loading />}
        {containers.isError && <LoadError error={containers.error} onRetry={() => containers.refetch()} />}
        {containers.data && (
          <>
            {count > 1 && (
              <div className="chip-row">
                <button type="button" className={`chip${reordering ? ' chip-on' : ''}`} aria-pressed={reordering} onClick={() => setReordering((r) => !r)}>
                  <ReorderIcon />{reordering ? 'Done' : 'Reorder'}
                </button>
              </div>
            )}
            <div className="list-panel">
              {containers.data.map((container, index) => {
                const main = (
                  <div className="lib-main">
                    <div className="lib-name">{container.displayName}</div>
                    <div className="card-meta">
                      {container.containerName} · {container.priceCount ? plural(container.priceCount, 'price') : 'Not used yet'}
                    </div>
                  </div>
                );
                return reordering ? (
                  <div key={container.id} className="lib-row">
                    {main}
                    <MoveButtons label={container.displayName} index={index} count={count} onMove={move} />
                  </div>
                ) : (
                  <button
                    key={container.id}
                    type="button"
                    className="lib-row lib-link lib-button"
                    onClick={() => setEditing(container)}
                  >
                    {main}
                    <span className="card-chevron"><ChevronRight /></span>
                  </button>
                );
              })}
              {count === 0 && <p className="muted lib-empty">No pour sizes yet.</p>}
            </div>
          </>
        )}
        {!reordering && (
          <button type="button" className="btn-dashed" onClick={() => setEditing('new')}>
            <PlusIcon />New pour size
          </button>
        )}
      </div>

      {editing && (
        <PourSizeSheet
          existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSubmit={async (displayName, containerName) => {
            if (editing === 'new') await api.createContainer(displayName, containerName);
            else await api.updateContainer(editing.id, displayName, containerName);
            await refresh();
            setEditing(null);
            toast(editing === 'new' ? `Added ${displayName}` : `Saved ${displayName}`);
          }}
          onDelete={async (container) => {
            await api.deleteContainer(container.id);
            await refresh();
            setEditing(null);
            toast(`Deleted ${container.displayName}`);
          }}
        />
      )}
    </Screen>
  );
}

type PourSizeSheetProps = {
  existing: Container | null;
  onClose: () => void;
  onSubmit: (displayName: string, containerName: string | null) => Promise<void>;
  onDelete: (container: Container) => Promise<void>;
};

function PourSizeSheet({ existing, onClose, onSubmit, onDelete }: PourSizeSheetProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [displayName, setDisplayName] = useState(existing?.displayName ?? '');
  // A container name that matches the display name was most likely left blank, so start it blank
  const [containerName, setContainerName] = useState(
    existing && existing.containerName !== existing.displayName ? existing.containerName : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const deleteIt = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDelete(existing!);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  if (existing && confirmingDelete) {
    return (
      <Sheet title={`Delete ${existing.displayName}?`} onClose={onClose}>
        <div className="sheet-body stack">
          <p className="muted">No item prices use it, so no menus change.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="btn-row">
            <button type="button" className="btn-secondary" onClick={() => setConfirmingDelete(false)} data-autofocus>
              Cancel
            </button>
            <button type="button" className="btn-danger" onClick={deleteIt} disabled={busy}>
              {busy ? 'Working…' : 'Delete'}
            </button>
          </div>
        </div>
      </Sheet>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!displayName.trim()) {
      setError('Give the pour size a name guests will see.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(displayName.trim(), containerName.trim() || null);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Sheet title={existing ? 'Edit pour size' : 'New pour size'} onClose={onClose}>
      <form className="sheet-body stack" onSubmit={submit} noValidate>
        <label className="field-label">
          Display name
          <input
            className="field"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Full Pour"
            maxLength={200}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
          />
        </label>
        <label className="field-label">
          Glass or container
          <input
            className="field"
            value={containerName}
            onChange={(e) => setContainerName(e.target.value)}
            placeholder="Optional, e.g. 16 oz pint glass"
            maxLength={200}
            autoComplete="off"
          />
        </label>
        {!existing && <p className="muted-sm">New pour sizes go at the end of the list. Menus show them in this order.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : existing ? 'Save pour size' : 'Add pour size'}
        </button>
        {existing && existing.priceCount === 0 && (
          <button type="button" className="btn-text-danger" onClick={() => { setError(null); setConfirmingDelete(true); }}>
            <TrashIcon />Delete pour size
          </button>
        )}
      </form>
      {existing && existing.priceCount > 0 && <PourSizeUses container={existing} />}
    </Sheet>
  );
}

// The items priced in a pour size, which have to drop it before it can be deleted
function PourSizeUses({ container }: { container: Container }) {
  const uses = useQuery({ queryKey: ['containerUses', container.id], queryFn: () => api.containerUses(container.id), staleTime: 0 });
  return (
    <div className="sheet-body stack">
      <p className="muted-sm">
        Used by {plural(container.priceCount, 'price')}. To delete it, remove it from {container.priceCount === 1 ? 'that item' : 'these items'} first.
      </p>
      {uses.isPending && <Loading />}
      {uses.isError && <LoadError error={uses.error} onRetry={() => uses.refetch()} />}
      {uses.data && (
        <div className="list-panel">
          {uses.data.map((use) => (
            <Link
              key={use.menuItemId}
              to={`/menus/${use.menuId}/sections/${use.sectionId}/items/${use.menuItemId}`}
              className="lib-row lib-link"
            >
              <div className="lib-main">
                <div className="lib-name">{use.itemName}</div>
                <div className="card-meta truncate">{use.menuName} · {use.sectionName} · {formatPrice(use.price)}</div>
              </div>
              <span className="card-chevron"><ChevronRight /></span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
