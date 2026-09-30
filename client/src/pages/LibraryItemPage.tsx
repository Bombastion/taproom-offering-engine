import { FormEvent, useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Brewery, errorMessage, LibraryItemDetail, plural } from '../api';
import { PageHeader, Screen, useGoBack } from '../components/Screen';
import { FieldErrors, initialItemFields, ItemFields, SaveBar, validateItemFields } from '../components/ItemFields';
import { Loading, LoadError } from '../components/QueryState';
import { useToast } from '../components/Toast';
import { ChevronRight, TrashIcon } from '../components/Icons';
import { ConfirmSheet } from '../components/Sheet';

// Creates an item in the library (/items/new) or edits one (/items/:itemId), without touching
// any menu. Prices belong to an item's place on a section, so they're set from the section.
export function LibraryItemPage() {
  const itemId = useParams().itemId;
  const isNew = !itemId;

  const breweries = useQuery({ queryKey: ['breweries'], queryFn: api.breweries });
  const item = useQuery({
    queryKey: ['item', itemId],
    queryFn: () => api.item(itemId!),
    enabled: !isNew,
    // Always start editing from the latest saved values
    staleTime: 0,
  });

  const queries = isNew ? [breweries] : [breweries, item];
  const failed = queries.find((q) => q.isError);
  const ready = queries.every((q) => q.isSuccess);
  const name = isNew ? 'New item' : item.data?.displayName ?? 'Item';

  return (
    <Screen
      barTitle={isNew ? 'New item' : 'Edit item'}
      parent="/items"
      crumbs={[
        { label: 'Items', to: '/items' },
        { label: name, to: isNew ? '/items/new' : `/items/${itemId}` },
      ]}
      tabs={false}
      footer={ready ? <SaveBar formId="library-item-form" parent="/items" submitLabel={isNew ? 'Add item' : 'Save item'} /> : undefined}
    >
      <div className="page">
        {!ready && !failed && <Loading />}
        {failed && <LoadError error={failed.error} onRetry={() => queries.forEach((q) => q.refetch())} />}
        {ready && <LibraryItemForm key={itemId ?? 'new'} existing={isNew ? null : item.data!} breweries={breweries.data!} />}
      </div>
    </Screen>
  );
}

function LibraryItemForm({ existing, breweries }: { existing: LibraryItemDetail | null; breweries: Brewery[] }) {
  const [fields, setFields] = useState(() => initialItemFields(existing, breweries, !existing));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ids = useId();

  const queryClient = useQueryClient();
  const toast = useToast();
  const goBack = useGoBack('/items');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const { item, errors: next } = validateItemFields(fields);
    setErrors(next);
    if (!item) {
      setFormError('Check the highlighted fields.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (existing) await api.saveItem(existing.id, item);
      else await api.createItem(item);
      // Item details show up on the library lists and on every section the item is on
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['items'] }),
        queryClient.invalidateQueries({ queryKey: ['item'] }),
        queryClient.invalidateQueries({ queryKey: ['brewery'] }),
        queryClient.invalidateQueries({ queryKey: ['section'] }),
        queryClient.invalidateQueries({ queryKey: ['menuItem'] }),
        queryClient.invalidateQueries({ queryKey: ['menu'] }),
      ]);
      toast(existing ? `Saved ${item.displayName}` : `${item.displayName} added to your items`);
      goBack();
    } catch (e) {
      setFormError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Library item" title={fields.displayName.trim() || (existing ? 'Untitled item' : 'New item')} />

      {existing && existing.placementCount > 0 ? (
        <p className="note">
          This item is on {plural(existing.placementCount, 'menu section')}; changes here show up there too. Prices are set on each section.
        </p>
      ) : existing ? (
        <p className="note">This item isn't on any menu. Add it to a menu from any section. Prices are set there.</p>
      ) : (
        <p className="note">Once it's saved, add it to a menu from any section. Prices are set there.</p>
      )}

      <form id="library-item-form" className="stack" onSubmit={submit} noValidate>
        <ItemFields
          values={fields}
          onChange={(patch) => setFields((current) => ({ ...current, ...patch }))}
          errors={errors}
          breweries={breweries}
          idPrefix={ids}
        />
        {formError && <p className="form-error" role="alert">{formError}</p>}
      </form>

      {existing && existing.placements.length > 0 && (
        <>
          <div className="section-head">
            <h2>On menus</h2>
            <span className="muted-sm">{plural(existing.placements.length, 'section')}</span>
          </div>
          <div className="list-panel">
            {existing.placements.map((placement) => (
              <Link
                key={placement.menuItemId}
                to={`/menus/${placement.menuId}/sections/${placement.sectionId}/items/${placement.menuItemId}`}
                className="lib-row lib-link"
              >
                <div className="lib-main">
                  <div className="lib-name">{placement.sectionName}</div>
                  <div className="card-meta">{placement.menuName}</div>
                </div>
                <span className="card-chevron"><ChevronRight /></span>
              </Link>
            ))}
          </div>
          <p className="muted-sm">To delete this item, take it off {existing.placements.length === 1 ? 'that section' : 'these sections'} first.</p>
        </>
      )}

      {existing && existing.placements.length === 0 && (
        <button type="button" className="btn-text-danger" onClick={() => setConfirmDelete(true)}>
          <TrashIcon />Delete item
        </button>
      )}

      {confirmDelete && existing && (
        <ConfirmSheet
          title={`Delete ${existing.displayName}?`}
          message="It's removed from your item library for good. It isn't on any menu, so no menus change."
          confirmLabel="Delete"
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await api.deleteItem(existing.id);
            toast(`Deleted ${existing.displayName}`);
            goBack();
            // After leaving, so the deleted item isn't refetched
            queryClient.removeQueries({ queryKey: ['item', existing.id] });
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['items'] }),
              queryClient.invalidateQueries({ queryKey: ['brewery'] }),
            ]);
          }}
        />
      )}
    </>
  );
}
