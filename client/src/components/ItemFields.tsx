import { Brewery, ItemDetail, ItemInput } from '../api';
import { useGoBack } from './Screen';

// The details of an item (name, brewery, style, ABV, description), shared by the item editor on a
// section and the item screen in the library. Values are kept as the text typed into each field.
export type ItemFieldValues = {
  displayName: string;
  internalName: string;
  breweryId: string;
  style: string;
  abv: string;
  description: string;
};

export type FieldErrors = Record<string, string>;

// New items start on the first brewery, since most items are beers
export function initialItemFields(item: ItemDetail | null | undefined, breweries: Brewery[], isNew: boolean): ItemFieldValues {
  return {
    displayName: item?.displayName ?? '',
    internalName: item?.internalName ?? '',
    breweryId: item?.breweryId ?? (isNew ? breweries[0]?.id ?? '' : ''),
    style: item?.style ?? '',
    abv: item?.abv !== null && item?.abv !== undefined ? String(item.abv) : '',
    description: item?.description ?? '',
  };
}

// Accepts "5,4" and a leading "$" as well as plain numbers
export function parseNumber(text: string): number {
  return parseFloat(text.trim().replace(',', '.').replace(/^\$/, ''));
}

// Returns the item to send to the server, or null along with the errors to show
export function validateItemFields(values: ItemFieldValues): { item: ItemInput | null; errors: FieldErrors } {
  const errors: FieldErrors = {};
  if (!values.displayName.trim()) errors.displayName = 'Give the item a name guests will see.';
  let abv: number | null = null;
  if (values.abv.trim()) {
    abv = parseNumber(values.abv);
    if (!Number.isFinite(abv) || abv < 0 || abv > 100) errors.abv = 'Enter a percentage like 5.4';
  }
  if (Object.keys(errors).length) return { item: null, errors };
  return {
    item: {
      displayName: values.displayName.trim(),
      internalName: values.internalName.trim() || null,
      breweryId: values.breweryId || null,
      style: values.style.trim() || null,
      abv,
      description: values.description.trim() || null,
    },
    errors,
  };
}

type ItemFieldsProps = {
  values: ItemFieldValues;
  onChange: (patch: Partial<ItemFieldValues>) => void;
  errors: FieldErrors;
  breweries: Brewery[];
  // Prefix for the ids tying error messages to their fields
  idPrefix: string;
};

export function ItemFields({ values, onChange, errors, breweries, idPrefix }: ItemFieldsProps) {
  const errorId = (name: string) => `${idPrefix}-${name}-error`;
  const errorFor = (name: string) => (errors[name] ? <span className="field-error" id={errorId(name)}>{errors[name]}</span> : null);
  const describedBy = (name: string) => (errors[name] ? errorId(name) : undefined);

  return (
    <fieldset className="panel stack">
      <legend className="sr-only">Details</legend>
      <label className="field-label">
        Display name
        <input
          className="field"
          value={values.displayName}
          onChange={(e) => onChange({ displayName: e.target.value })}
          placeholder="What guests see"
          maxLength={200}
          aria-invalid={errors.displayName ? true : undefined}
          aria-describedby={describedBy('displayName')}
        />
        {errorFor('displayName')}
      </label>
      <label className="field-label">
        Internal name
        <input
          className="field"
          value={values.internalName}
          onChange={(e) => onChange({ internalName: e.target.value })}
          placeholder="Optional — for your team only"
          maxLength={200}
          autoCapitalize="none"
        />
      </label>
      <label className="field-label">
        Brewery
        <select className="field" value={values.breweryId} onChange={(e) => onChange({ breweryId: e.target.value })}>
          <option value="">No brewery</option>
          {breweries.map((brewery) => (
            <option key={brewery.id} value={brewery.id}>{brewery.name}</option>
          ))}
        </select>
      </label>
      <div className="grid-2">
        <label className="field-label">
          Style
          <input className="field" value={values.style} onChange={(e) => onChange({ style: e.target.value })} placeholder="e.g. Pilsner" maxLength={200} />
        </label>
        <label className="field-label">
          ABV (%)
          <input
            className="field"
            inputMode="decimal"
            value={values.abv}
            onChange={(e) => onChange({ abv: e.target.value })}
            placeholder="0.0"
            aria-invalid={errors.abv ? true : undefined}
            aria-describedby={describedBy('abv')}
          />
          {errorFor('abv')}
        </label>
      </div>
      <label className="field-label">
        Description
        <textarea
          className="field"
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Tasting notes, hops, anything worth a line"
          maxLength={2000}
        />
      </label>
    </fieldset>
  );
}

// The Cancel / Save bar pinned to the bottom of an editor screen. The save button submits the
// form with the given id.
export function SaveBar({ formId, parent, submitLabel }: { formId: string; parent: string; submitLabel: string }) {
  const goBack = useGoBack(parent);
  return (
    <div className="save-bar">
      <button type="button" className="btn-secondary" onClick={goBack}>Cancel</button>
      <button type="submit" form={formId} className="btn-primary save-btn">{submitLabel}</button>
    </div>
  );
}
