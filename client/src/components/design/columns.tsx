import { useEffect, useState } from 'react';
import { Container } from '../../api';
import {
  Column,
  columnTitle,
  columnWidth,
  describeColumn,
  FieldsColumn,
  FontInfo,
  MAX_COLUMNS,
  MAX_LINES,
  newColumn,
  newLine,
  PricesColumn,
  PrintDesign,
  ThumbnailColumn,
  widthLeft,
} from '../../design';
import { MoveButtons, moved } from '../Reorder';
import { LineList } from './lines';
import { PlusIcon, TrashIcon } from '../Icons';
import { Choice, NumberField, SwitchRow, TextField } from './controls';
import { Change } from './groups';
import { Fold } from './Fold';
import { StyleEditor } from './StyleEditor';

// The columns of each item row, and what is in them. Like the other groups it is handed the design and
// says what to change by path; the only state here is which entries are open.

type Props = {
  design: PrintDesign;
  fonts: FontInfo[];
  containers: { data?: Container[]; failed: boolean };
  change: Change;
  // A column to open (the ID of one, and a number that changes with each request), and what to call once that is done
  focus?: { id: string; n: number } | null;
  onFocused?: () => void;
};

// Columns of the same kind are told apart by number ("Prices 2")
function columnLabel(columns: Column[], index: number): string {
  const column = columns[index];
  const same = columns.filter((other) => other.type === column.type);
  return same.length > 1 ? `${columnTitle(column)} ${same.indexOf(column) + 1}` : columnTitle(column);
}

export function ColumnsGroup({ design, fonts, containers, change, focus, onFocused }: Props) {
  const { columns } = design;
  const [open, setOpen] = useState<string | null>(null);

  // Asked to show one column (it was clicked in the preview): open it, once
  useEffect(() => {
    if (!focus) return;
    if (columns.some((column) => column.id === focus.id)) setOpen(focus.id);
    onFocused?.();
    // Only a new request matters, not the columns changing after it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const total = columns.reduce((sum, column) => sum + columnWidth(column), 0);

  const add = (type: Column['type']) => {
    const column = newColumn(type, columns);
    change(['columns'], [...columns, column]);
    setOpen(column.id);
  };

  return (
    <>
      <p className="muted-sm">
        Every item is a row, and each column is a part of it, from left to right. Use the arrows to change the order.
      </p>
      {total > 100 && <span className="field-error" role="alert">Column widths add up to {total}%; they can be at most 100%.</span>}

      <div className="stack-sm">
        {columns.map((column, index) => {
          const label = columnLabel(columns, index);
          return (
            <Fold
              key={column.id}
              title={label}
              summary={describeColumn(column)}
              open={open === column.id}
              onToggle={() => setOpen(open === column.id ? null : column.id)}
              actions={
                <>
                  <MoveButtons label={label} index={index} count={columns.length} onMove={(from, to) => change(['columns'], moved(columns, from, to))} />
                  <button
                    type="button"
                    className="icon-btn icon-btn-sm"
                    aria-label={`Remove ${label}`}
                    disabled={columns.length === 1}
                    onClick={() => change(['columns'], columns.filter((_, i) => i !== index))}
                  >
                    <TrashIcon />
                  </button>
                </>
              }
            >
              {column.type === 'fields' && <FieldsEditor column={column} index={index} columns={columns} fonts={fonts} change={change} />}
              {column.type === 'prices' && <PricesEditor column={column} index={index} columns={columns} fonts={fonts} containers={containers} change={change} />}
              {column.type === 'thumbnail' && <ThumbnailEditor column={column} index={index} change={change} />}
            </Fold>
          );
        })}
      </div>

      <div className="btn-wrap">
        <button type="button" className="btn-secondary" disabled={columns.length >= MAX_COLUMNS} onClick={() => add('fields')}>
          <PlusIcon /> Add item details
        </button>
        <button type="button" className="btn-secondary" disabled={columns.length >= MAX_COLUMNS} onClick={() => add('prices')}>
          <PlusIcon /> Add prices
        </button>
        <button type="button" className="btn-secondary" disabled={columns.length >= MAX_COLUMNS} onClick={() => add('thumbnail')}>
          <PlusIcon /> Add a picture
        </button>
      </div>
      {columns.length >= MAX_COLUMNS && <span className="muted-sm">A row can have at most {MAX_COLUMNS} columns.</span>}
    </>
  );
}

// ---- Width ----

function WidthControl({ columns, index, change }: { columns: Column[]; index: number; change: Change }) {
  const column = columns[index] as FieldsColumn | PricesColumn;
  const room = widthLeft(columns, index);
  const sharing = column.widthPct === null;
  return (
    <div className="stack-sm">
      <label className="check-row">
        <input
          type="checkbox"
          checked={sharing}
          // With nothing left to give, a column can only share what the others leave
          disabled={sharing && room < 5}
          onChange={(e) => change(['columns', index, 'widthPct'], e.target.checked ? null : Math.min(room, 30))}
        />
        Use the width the other columns leave
      </label>
      {!sharing && <NumberField label="Column width" unit="%" min={5} max={Math.max(5, Math.min(100, room))} value={column.widthPct!} onChange={(pct) => change(['columns', index, 'widthPct'], pct)} />}
      {sharing && room < 5 && <span className="muted-sm">The other columns use all the width, so this one has none to share.</span>}
    </div>
  );
}

// ---- Item details ----

type ListKey = 'lines' | 'belowLines';

const LIST_NAMES: Record<ListKey, { title: string; noun: string; hint: string }> = {
  lines: { title: 'Lines', noun: 'line', hint: 'Printed next to the other columns.' },
  belowLines: { title: 'Lines below', noun: 'line below', hint: 'Printed on a second row under the item, so a long description doesn’t push the prices off-center.' },
};

function FieldsEditor({ column, index, columns, fonts, change }: { column: FieldsColumn; index: number; columns: Column[]; fonts: FontInfo[]; change: Change }) {
  return (
    <>
      <WidthControl columns={columns} index={index} change={change} />
      {(['lines', 'belowLines'] as ListKey[]).map((list) => (
        <LineList
          key={list}
          names={LIST_NAMES[list]}
          lines={column[list]}
          path={['columns', index, list]}
          fonts={fonts}
          change={change}
          max={MAX_LINES}
          newLine={() => newLine(column, list === 'belowLines')}
        />
      ))}
    </>
  );
}

// ---- Prices ----

function PricesEditor({
  column,
  index,
  columns,
  fonts,
  containers,
  change,
}: {
  column: PricesColumn;
  index: number;
  columns: Column[];
  fonts: FontInfo[];
  containers: Props['containers'];
  change: Change;
}) {
  const chosen = column.sizes === 'all' ? null : column.sizes;
  const toggle = (id: string, on: boolean) => change(['columns', index, 'sizes'], on ? [...(chosen ?? []), id] : (chosen ?? []).filter((other) => other !== id));

  return (
    <>
      <WidthControl columns={columns} index={index} change={change} />
      <NumberField label="Width of each size" unit="%" min={5} max={100} value={column.sizeWidthPct} onChange={(pct) => change(['columns', index, 'sizeWidthPct'], pct)} />

      <div className="stack-sm">
        <Choice
          label="Pour sizes shown"
          value={chosen === null ? 'all' : 'some'}
          options={[
            { value: 'all', label: 'All of them' },
            { value: 'some', label: 'Only some' },
          ]}
          onChange={(choice) => change(['columns', index, 'sizes'], choice === 'all' ? 'all' : (containers.data ?? []).map((size) => size.id))}
        />
        {chosen !== null && (
          <div className="stack-sm" role="group" aria-label="Pour sizes to show">
            {containers.data ? (
              containers.data.map((size) => (
                <label key={size.id} className="check-row">
                  <input type="checkbox" checked={chosen.includes(size.id)} onChange={(e) => toggle(size.id, e.target.checked)} />
                  {size.displayName}
                </label>
              ))
            ) : (
              <span className="muted-sm">{containers.failed ? 'The pour sizes couldn’t be loaded.' : 'Loading pour sizes…'}</span>
            )}
            {chosen.length === 0 && containers.data && <span className="field-error">No sizes are ticked, so this column prints no prices.</span>}
          </div>
        )}
      </div>

      <SwitchRow
        label="Show pour size names above the prices"
        checked={column.heading.show}
        onChange={(show) => change(['columns', index, 'heading', 'show'], show)}
      />
      {column.heading.show && (
        <StyleEditor label="Style of size names" style={column.heading.style} fonts={fonts} onChange={(style) => change(['columns', index, 'heading', 'style'], style)} />
      )}

      <TextField
        label="Price format"
        value={column.cell.format}
        maxLength={30}
        hint="{value} is the price."
        validate={(v) => (v.includes('{value}') ? null : 'Include {value} where the price goes')}
        onChange={(format) => change(['columns', index, 'cell', 'format'], format)}
      />
      <StyleEditor label="Style of prices" style={column.cell.style} fonts={fonts} onChange={(style) => change(['columns', index, 'cell', 'style'], style)} />
    </>
  );
}

// ---- Pictures ----

const SOURCES = [
  { value: 'item-then-menu', label: 'The item’s picture, or the menu’s logo' },
  { value: 'item-then-brewery-then-menu', label: 'The item’s, then its brewery’s, then the menu’s' },
] as const;

function ThumbnailEditor({ column, index, change }: { column: ThumbnailColumn; index: number; change: Change }) {
  return (
    <>
      <NumberField label="Picture size" unit="px" min={16} max={200} value={column.sizePx} onChange={(px) => change(['columns', index, 'sizePx'], px)} />
      <Choice
        label="Shape"
        value={column.shape}
        options={[
          { value: 'circle', label: 'Circle' },
          { value: 'rounded', label: 'Rounded' },
          { value: 'square', label: 'Square' },
        ]}
        onChange={(shape) => change(['columns', index, 'shape'], shape)}
      />
      <label className="field-label">
        Picture to use
        <select className="field" value={column.source} onChange={(e) => change(['columns', index, 'source'], e.target.value)}>
          {SOURCES.map((source) => (
            <option key={source.value} value={source.value}>{source.label}</option>
          ))}
        </select>
      </label>
    </>
  );
}
