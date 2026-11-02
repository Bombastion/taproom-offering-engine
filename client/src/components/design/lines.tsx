import { useState } from 'react';
import { BoardTextStyle } from '../../boardDesign';
import { describeLine, FontInfo, ITEM_FIELDS, ItemField, Line, MAX_PARTS, newPart, Part, styleDifferences, TextStyle } from '../../design';
import { MoveButtons, moved } from '../Reorder';
import { PlusIcon, TrashIcon } from '../Icons';
import { TextField } from './controls';
import { Change } from './groups';
import { Fold } from './Fold';
import { StyleEditor } from './StyleEditor';

// Lines of text built from an item's fields, as the print menu's item columns and the menu board's
// item rows both have them. Handed the lines and where they are in the design, and saying what to
// change by path; the only state here is which entry is open.

type AnyStyle = TextStyle | BoardTextStyle;

// Where an open entry is after `from` has been moved to `to`
export function followMove(open: number | null, from: number, to: number): number | null {
  if (open === null) return null;
  if (open === from) return to;
  if (from < to && open > from && open <= to) return open - 1;
  if (from > to && open >= to && open < from) return open + 1;
  return open;
}

export type ListNames = { title: string; noun: string; hint: string };

type ListProps<S extends AnyStyle> = {
  names: ListNames;
  lines: Line<S>[];
  // Where the list is in the design
  path: (string | number)[];
  fonts: FontInfo[];
  change: Change;
  // The fewest and the most lines there can be
  min?: number;
  max: number;
  // A new line, given the lines there are
  newLine: () => Line<S>;
  // What printed before a part added to a line is
  separator?: string;
  // Settings a part of a line can't change (the board draws a line at one size and aligns it as a whole)
  partWithout?: ('size' | 'align')[];
};

export function LineList<S extends AnyStyle>({ names, lines, path, fonts, change, min = 0, max, newLine, separator, partWithout }: ListProps<S>) {
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
                    change(path, moved(lines, from, to));
                    setOpen(followMove(open, from, to));
                  }}
                />
                <button
                  type="button"
                  className="icon-btn icon-btn-sm"
                  aria-label={`Remove ${label}`}
                  disabled={lines.length <= min}
                  onClick={() => {
                    change(path, lines.filter((_, i) => i !== lineIndex));
                    setOpen(null);
                  }}
                >
                  <TrashIcon />
                </button>
              </>
            }
          >
            <LineEditor label={label} line={line} path={[...path, lineIndex]} fonts={fonts} change={change} separator={separator} partWithout={partWithout} />
          </Fold>
        );
      })}
      <div>
        <button
          type="button"
          className="btn-secondary"
          disabled={lines.length >= max}
          onClick={() => {
            change(path, [...lines, newLine()]);
            setOpen(lines.length);
          }}
        >
          <PlusIcon /> Add a {names.noun}
        </button>
      </div>
    </div>
  );
}

type LineEditorProps<S extends AnyStyle> = {
  label: string;
  line: Line<S>;
  path: (string | number)[];
  fonts: FontInfo[];
  change: Change;
  separator?: string;
  partWithout?: ('size' | 'align')[];
};

export function LineEditor<S extends AnyStyle>({ label, line, path, fonts, change, separator, partWithout }: LineEditorProps<S>) {
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
            without={partWithout}
            onMove={(to) => change([...path, 'parts'], moved(line.parts, partIndex, to))}
            onRemove={() => change([...path, 'parts'], line.parts.filter((_, i) => i !== partIndex))}
            change={change}
          />
        ))}
        <div>
          <button
            type="button"
            className="btn-secondary"
            disabled={line.parts.length >= MAX_PARTS}
            onClick={() => change([...path, 'parts'], [...line.parts, newPart(line, separator)])}
          >
            <PlusIcon /> Add to this line
          </button>
        </div>
      </div>
    </>
  );
}

function PartEditor<S extends AnyStyle>(props: {
  number: number;
  part: Part<S>;
  line: Line<S>;
  count: number;
  path: (string | number)[];
  fonts: FontInfo[];
  without?: ('size' | 'align')[];
  onMove: (to: number) => void;
  onRemove: () => void;
  change: Change;
}) {
  const { number, part, line, count, path, fonts, without, onMove, onRemove, change } = props;
  const set = (changes: Partial<Part<S>>) => change(path, { ...part, ...changes });
  const label = `Part ${number}`;

  const setField = (field: ItemField) => {
    const next: Part<S> = { ...part, field };
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
            const next: Part<S> = { ...part };
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
          style={{ ...line.style, ...part.style } as S}
          fonts={fonts}
          without={without}
          onChange={(style) => set({ style: styleDifferences(line.style, style) })}
        />
      )}
    </div>
  );
}
