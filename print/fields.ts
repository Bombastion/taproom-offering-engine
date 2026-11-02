import { ItemField } from '../models/menuDesign';
import { PrintItem } from './model';

// What a design part prints for an item: the field's value, trimmed, or null when there is nothing to
// print (so the part, and any separator before it, is left out). Shared by the print menu and the
// menu board.
export function fieldValue(item: PrintItem, field: ItemField, fixedText: string | undefined): string | null {
  let value: string | null;
  switch (field) {
    case 'breweryName': value = item.breweryName; break;
    case 'breweryLocation': value = item.breweryLocation; break;
    case 'displayName': value = item.displayName; break;
    case 'style': value = item.style; break;
    // An ABV of 0 is a real value and is shown
    case 'abv': value = item.abv === null || item.abv === undefined ? null : String(item.abv); break;
    case 'description': value = item.description; break;
    case 'category': value = item.category; break;
    case 'text': value = fixedText ?? null; break;
  }
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

// A part's format with its {value} filled in. Split and join rather than replace, so a value with
// "$&" in it stays as it is.
export function applyFormat(format: string, value: string): string {
  return format.split('{value}').join(value);
}
