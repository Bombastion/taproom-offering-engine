import { useState } from 'react';
import { Container } from '../../api';
import {
  Column,
  columnTitle,
  columnWidth,
  describeColumn,
  describeLine,
  FieldsColumn,
  FontInfo,
  ITEM_FIELDS,
  ItemField,
  Line,
  MAX_COLUMNS,
  MAX_LINES,
  MAX_PARTS,
  newColumn,
  newLine,
  newPart,
  Part,
  PricesColumn,
  PrintDesign,
  styleDifferences,
  ThumbnailColumn,
  widthLeft,
} from '../../design';
import { MoveButtons, moved } from '../Reorder';
import { PlusIcon, TrashIcon } from '../Icons';
import { Choice, NumberField, SwitchRow, TextField } from './controls';
import { Change } from './groups';
import { Fold } from './Fold';
import { StyleEditor } from './StyleEditor';

// The columns of each item row, and what is in them. Like the other groups it is handed the design and
// says what to change by path; the only state here is which entries are open.

type Props = { design: PrintDesign; fonts: FontInfo[]; containers: { data?: Container[]; failed: boolean }; change: Change };

// Columns of the same kind are told apart by number ("Prices 2")
function columnLabel(columns: Column[], index: number): string {
  const column = columns[index];
  const same = columns.filter((other) => other.type === column.type);
  return same.length > 1 ? `${columnTitle(column)} ${same.indexOf(column) + 1}` : columnTitle(column);
}

// Where an open entry is after `from` has been moved to `to`
function followMove(open: number | null, from: number, to: number): number | null {
  if (open === null) return null;
  if (open === from) return to;
  if (from < to && open > from && open <= to) return open - 1;
  if (from > to && open >= to && open < from) return open + 1;
  return open;
}

export function ColumnsGroup({ design, fonts, containers, change }: Props) {
  const { columns } = design;
  const [open, setOpen] = useState<string | null>(null);
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
        <LineList key={list} list={list} column={column} index={index} fonts={fonts} change={change} />
      ))}
    </>
  );
}

function LineList({ list, column, index, fonts, change }: { list: ListKey; column: FieldsColumn; index: number; fonts: FontInfo[]; change: Change }) {
  const lines = column[list];
  const names = LIST_NAMES[list];
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="stack-sm">
      <div className="eyebrow">{names.title}</div>
      <span className="muted-sm">{names.hint}</span>
      {lines.map((line, lineIndex) => {
        const label = `${names.noun} ${lineIndex + 1}`;
        return (
          <Fold
            key={lineIndex}
            title={`${names.noun[0].toUpperCase()}${names.noun.slice(1)} ${lineIndex + 1}`}
            summary={describeLine(line)}
            open={open === lineIndex}
            onToggle={() => setOpen(open === lineIndex ? null : lineIndex)}
            actions={
              <>
                <MoveButtons
                  label={label}
                  index={lineIndex}
                  count={lines.length}
                  onMove={(from, to) => {
                    change(['columns', index, list], moved(lines, from, to));
                    setOpen(followMove(open, from, to));
                  }}
                />
                <button
                  type="button"
                  className="icon-btn icon-btn-sm"
                  aria-label={`Remove ${label}`}
                  onClick={() => {
                    change(['columns', index, list], lines.filter((_, i) => i !== lineIndex));
                    setOpen(null);
                  }}
                >
                  <TrashIcon />
                </button>
              </>
            }
          >
            <LineEditor label={label} line={line} path={['columns', index, list, lineIndex]} fonts={fonts} change={change} />
          </Fold>
        );
      })}
      <div>
        <button
          type="button"
          className="btn-secondary"
          disabled={lines.length >= MAX_LINES}
          onClick={() => {
            change(['columns', index, list], [...lines, newLine(column, list === 'belowLines')]);
            setOpen(lines.length);
          }}
        >
          <PlusIcon /> Add a {names.noun}
        </button>
      </div>
    </div>
  );
}

function LineEditor({ label, line, path, fonts, change }: { label: string; line: Line; path: (string | number)[]; fonts: FontInfo[]; change: Change }) {
  return (
    <>
      <StyleEditor label={`Style of ${label}`} style={line.style} fonts={fonts} onChange={(style) => change([...path, 'style'], style)} />
      <div className="stack-sm">
        <div className="eyebrow">What it prints</div>
        <span className="muted-sm">A line is left out for an item that has nothing to print on it. Text before a part is only printed when the part has something to show and something comes first.</span>
        {line.parts.map((part, partIndex) => (
          <PartEditor
            key={partIndex}
            number={partIndex + 1}
            part={part}
            line={line}
            count={line.parts.length}
            path={[...path, 'parts', partIndex]}
            fonts={fonts}
            onMove={(to) => change([...path, 'parts'], moved(line.parts, partIndex, to))}
            onRemove={() => change([...path, 'parts'], line.parts.filter((_, i) => i !== partIndex))}
            change={change}
          />
        ))}
        <div>
          <button type="button" className="btn-secondary" disabled={line.parts.length >= MAX_PARTS} onClick={() => change([...path, 'parts'], [...line.parts, newPart(line)])}>
            <PlusIcon /> Add to this line
          </button>
        </div>
      </div>
    </>
  );
}

function PartEditor(props: {
  number: number;
  part: Part;
  line: Line;
  count: number;
  path: (string | number)[];
  fonts: FontInfo[];
  onMove: (to: number) => void;
  onRemove: () => void;
  change: Change;
}) {
  const { number, part, line, count, path, fonts, onMove, onRemove, change } = props;
  const set = (changes: Partial<Part>) => change(path, { ...part, ...changes });
  const label = `Part ${number}`;

  const setField = (field: ItemField) => {
    const next: Part = { ...part, field };
    if (field === 'text') next.text = part.text || 'Text';
    else delete next.text;
    change(path, next);
  };

  return (
    <div className="part" role="group" aria-label={label}>
      <div className="part-head">
        <strong>{label}</strong>
        <div className="fold-actions">
          <MoveButtons label={label.toLowerCase()} index={number - 1} count={count} onMove={(_from, to) => onMove(to)} />
          <button type="button" className="icon-btn icon-btn-sm" aria-label={`Remove ${label.toLowerCase()}`} disabled={count === 1} onClick={onRemove}>
            <TrashIcon />
          </button>
        </div>
      </div>

      <label className="field-label">
        Field
        <select className="field" value={part.field} onChange={(e) => setField(e.target.value as ItemField)}>
          {ITEM_FIELDS.map((field) => (
            <option key={field.value} value={field.value}>{field.label}</option>
          ))}
        </select>
      </label>
      {part.field === 'text' && (
        <TextField label="Text" value={part.text ?? ''} maxLength={100} validate={(v) => (v.trim() === '' ? 'Type the text to print' : null)} onChange={(text) => set({ text })} />
      )}
      <div className="grid-2">
        <TextField label="Printed before" value={part.before} maxLength={20} onChange={(before) => set({ before })} />
        <TextField
          label="Format"
          value={part.format}
          maxLength={60}
          validate={(v) => (v.includes('{value}') ? null : 'Include {value} where the value goes')}
          onChange={(format) => set({ format })}
        />
      </div>

      <label className="check-row">
        <input
          type="checkbox"
          checked={part.style !== undefined}
          onChange={(e) => {
            const next: Part = { ...part };
            if (e.target.checked) next.style = {};
            else delete next.style;
            change(path, next);
          }}
        />
        Style this part differently
      </label>
      {part.style !== undefined && (
        <StyleEditor
          label={`Style of ${label.toLowerCase()}`}
          style={{ ...line.style, ...part.style }}
          fonts={fonts}
          onChange={(style) => set({ style: styleDifferences(line.style, style) })}
        />
      )}
    </div>
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
