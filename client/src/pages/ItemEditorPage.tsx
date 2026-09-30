import { FormEvent, useId, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Brewery, Container, errorMessage, MenuItemDetail, PourInput, plural } from '../api';
import { PageHeader, Screen, useGoBack } from '../components/Screen';
import { TrashIcon } from '../components/Icons';
import { FieldErrors, initialItemFields, ItemFields, parseNumber, SaveBar, validateItemFields } from '../components/ItemFields';
import { Loading, LoadError } from '../components/QueryState';
import { ConfirmSheet } from '../components/Sheet';
import { useToast } from '../components/Toast';

// Edits an item placed on a section (its details plus this placement's prices), or creates a
// new item straight onto a section when the route is .../items/new.
export function ItemEditorPage() {
  const { menuId, sectionId, menuItemId } = useParams() as { menuId: string; sectionId: string; menuItemId?: string };
  const isNew = !menuItemId;

  const containers = useQuery({ queryKey: ['containers'], queryFn: api.containers });
  const breweries = useQuery({ queryKey: ['breweries'], queryFn: api.breweries });
  const section = useQuery({ queryKey: ['section', sectionId], queryFn: () => api.section(sectionId) });
  const menuItem = useQuery({
    queryKey: ['menuItem', menuItemId],
    queryFn: () => api.menuItem(menuItemId!),
    enabled: !isNew,
    // Always start editing from the latest saved values
    staleTime: 0,
  });

  const queries = isNew ? [containers, breweries, section] : [containers, breweries, section, menuItem];
  const failed = queries.find((q) => q.isError);
  const ready = queries.every((q) => q.isSuccess);

  const basePath = `/menus/${menuId}/sections/${sectionId}`;
  const menuName = section.data?.menu.displayName ?? 'Menu';
  const sectionName = section.data?.displayName ?? 'Section';
  const itemName = isNew ? 'New item' : menuItem.data?.item?.displayName ?? 'Item';

  return (
    <Screen
      barTitle={isNew ? 'New item' : 'Edit item'}
      parent={basePath}
      crumbs={[
        { label: 'Menus', to: '/' },
        { label: menuName, to: `/menus/${menuId}` },
        { label: sectionName, to: basePath },
        { label: itemName, to: isNew ? `${basePath}/items/new` : `${basePath}/items/${menuItemId}` },
      ]}
      tabs={false}
      footer={ready ? <SaveBar formId="item-form" parent={basePath} submitLabel={isNew ? 'Add item' : 'Save item'} /> : undefined}
    >
      <div className="page">
        {!ready && !failed && <Loading />}
        {failed && <LoadError error={failed.error} onRetry={() => queries.forEach((q) => q.refetch())} />}
        {ready && (
          <ItemForm
            key={menuItemId ?? 'new'}
            menuId={menuId}
            sectionId={sectionId}
            sectionName={sectionName}
            existing={isNew ? null : menuItem.data!}
            containers={containers.data!}
            breweries={breweries.data!}
          />
        )}
      </div>
    </Screen>
  );
}

type PourRow = { containerId: string; label: string; detail: string | null; on: boolean; price: string };

type FormProps = {
  menuId: string;
  sectionId: string;
  sectionName: string;
  existing: MenuItemDetail | null;
  containers: Container[];
  breweries: Brewery[];
};

function ItemForm({ menuId, sectionId, sectionName, existing, containers, breweries }: FormProps) {
  const [fields, setFields] = useState(() => initialItemFields(existing?.item, breweries, !existing));
  const [pours, setPours] = useState<PourRow[]>(() =>
    containers.map((container) => {
      const price = existing?.pours.find((p) => p.containerId === container.id)?.price;
      // Several pour sizes can share a display name ("Full Pour" in two different glasses), so
      // show the container name alongside it.
      const detail = container.containerName && container.containerName !== container.displayName ? container.containerName : null;
      return { containerId: container.id, label: container.displayName, detail, on: price !== undefined, price: price !== undefined ? String(price) : '' };
    }),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Saved straight away, separately from the rest of the form
  const [active, setActive] = useState(existing?.active ?? true);
  const [savingActive, setSavingActive] = useState(false);
  const priceInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const ids = useId();

  const queryClient = useQueryClient();
  const toast = useToast();
  const basePath = `/menus/${menuId}/sections/${sectionId}`;
  const goBack = useGoBack(basePath);

  const updatePour = (index: number, patch: Partial<PourRow>) => {
    setPours((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const validate = () => {
    const { item, errors: next } = validateItemFields(fields);
    const pourValues: PourInput[] = [];
    pours.forEach((row) => {
      if (!row.on) return;
      const price = parseNumber(row.price);
      if (!row.price.trim() || !Number.isFinite(price) || price < 0) next[`pour-${row.containerId}`] = `Enter a price for ${row.label}`;
      else pourValues.push({ containerId: row.containerId, price });
    });
    setErrors(next);
    if (!item || Object.keys(next).length) {
      setFormError('Check the highlighted fields.');
      return null;
    }
    return { item, pours: pourValues };
  };

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['section', sectionId] }),
      queryClient.invalidateQueries({ queryKey: ['menu', menuId] }),
      queryClient.invalidateQueries({ queryKey: ['menus'] }),
      queryClient.invalidateQueries({ queryKey: ['items'] }),
      queryClient.invalidateQueries({ queryKey: ['menuItem'] }),
      queryClient.invalidateQueries({ queryKey: ['item'] }),
    ]);

  const toggleActive = async (next: boolean) => {
    if (!existing || savingActive) return;
    const name = existing.item?.displayName ?? 'Item';
    setActive(next);
    setSavingActive(true);
    try {
      await api.setMenuItemActive(existing.menuItemId, next);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['section', sectionId] }),
        queryClient.invalidateQueries({ queryKey: ['menu', menuId] }),
        queryClient.invalidateQueries({ queryKey: ['menuItem', existing.menuItemId] }),
        queryClient.invalidateQueries({ queryKey: ['item'] }),
      ]);
      toast(next ? `${name} is back on the menu` : `${name} marked inactive`);
    } catch (e) {
      setActive(!next);
      toast(`Couldn't update: ${errorMessage(e)}`, 'error');
    } finally {
      setSavingActive(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const values = validate();
    if (!values) return;
    setSaving(true);
    setFormError(null);
    try {
      if (existing) await api.saveMenuItem(existing.menuItemId, values.item, values.pours);
      else await api.addNewItem(sectionId, values.item, values.pours);
      await refresh();
      toast(existing ? `Saved ${values.item.displayName}` : `${values.item.displayName} added to ${sectionName}`);
      goBack();
    } catch (e) {
      setFormError(errorMessage(e));
      setSaving(false);
    }
  };

  const fieldId = (name: string) => `${ids}-${name}`;
  const describedBy = (name: string) => (errors[name] ? fieldId(`${name}-error`) : undefined);

  return (
    <>
      <PageHeader eyebrow={`Item · ${sectionName}`} title={fields.displayName.trim() || (existing ? 'Untitled item' : 'New item')} />

      {existing && existing.otherPlacementCount > 0 && (
        <p className="note">
          This beer also appears in {plural(existing.otherPlacementCount, 'other place')}. Name, brewery, style, ABV and
          description changes show up there too; prices below are just for {sectionName}.
        </p>
      )}

      {existing && (
        <div className={`active-panel${active ? '' : ' active-panel-off'}`}>
          <div className="active-text">
            <span className="active-title">{active ? 'Showing on the menu' : 'Inactive'}</span>
            <span className="muted-sm" id={fieldId('active-detail')}>
              {active
                ? 'Turn off to hide it from the print view, menu board and website without losing its spot or prices.'
                : `Hidden from the published menus. It keeps its spot in ${sectionName} and its prices for when you turn it back on.`}
            </span>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              role="switch"
              aria-describedby={fieldId('active-detail')}
              aria-label="Show on published menus"
              checked={active}
              disabled={savingActive}
              onChange={(e) => toggleActive(e.target.checked)}
            />
            <span className="switch-track" aria-hidden="true" />
          </label>
        </div>
      )}

      <form id="item-form" className="stack" onSubmit={submit} noValidate>
        <ItemFields
          values={fields}
          onChange={(patch) => setFields((current) => ({ ...current, ...patch }))}
          errors={errors}
          breweries={breweries}
          idPrefix={ids}
        />

        <fieldset className="panel">
          <legend className="panel-legend">
            <span>Pours &amp; prices</span>
            <span className="muted-sm">Check the sizes you sell</span>
          </legend>
          {pours.length === 0 && <p className="muted">No pour sizes are set up yet.</p>}
          {pours.map((row, index) => {
            const key = `pour-${row.containerId}`;
            return (
              <div key={row.containerId} className="pour-edit">
                <label className="pour-check">
                  <input
                    type="checkbox"
                    checked={row.on}
                    onChange={(e) => {
                      updatePour(index, { on: e.target.checked });
                      if (e.target.checked) window.setTimeout(() => priceInputs.current[row.containerId]?.focus(), 0);
                    }}
                  />
                  <span className="pour-label">
                    {row.label}
                    {row.detail && <span className="muted-sm">{row.detail}</span>}
                  </span>
                </label>
                <div className="price-wrap">
                  <span className="price-prefix" aria-hidden="true">$</span>
                  <input
                    ref={(el) => {
                      priceInputs.current[row.containerId] = el;
                    }}
                    className="field price-field"
                    inputMode="decimal"
                    aria-label={`Price for ${row.label}${row.detail ? ` (${row.detail})` : ''}`}
                    value={row.price}
                    disabled={!row.on}
                    onChange={(e) => updatePour(index, { price: e.target.value })}
                    aria-invalid={errors[key] ? true : undefined}
                    aria-describedby={describedBy(key)}
                  />
                </div>
                {errors[key] && <span className="field-error pour-error" id={fieldId(`${key}-error`)}>{errors[key]}</span>}
              </div>
            );
          })}
        </fieldset>

        {formError && <p className="form-error" role="alert">{formError}</p>}
      </form>

      {existing && (
        <button type="button" className="btn-text-danger" onClick={() => setConfirmRemove(true)}>
          <TrashIcon />Remove from {sectionName}
        </button>
      )}

      {confirmRemove && existing && (
        <ConfirmSheet
          title={`Remove ${existing.item?.displayName ?? 'this item'}?`}
          message={`It comes off ${sectionName}, along with its prices here. The beer stays in your item library so you can add it back later.`}
          confirmLabel="Remove"
          onClose={() => setConfirmRemove(false)}
          onConfirm={async () => {
            await api.removeMenuItem(existing.menuItemId);
            toast(`${existing.item?.displayName ?? 'Item'} removed from ${sectionName}`);
            goBack();
            // After leaving the editor, so its own (now deleted) menu item isn't refetched
            queryClient.removeQueries({ queryKey: ['menuItem', existing.menuItemId] });
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['section', sectionId] }),
              queryClient.invalidateQueries({ queryKey: ['menu', menuId] }),
              queryClient.invalidateQueries({ queryKey: ['menus'] }),
            ]);
          }}
        />
      )}
    </>
  );
}
