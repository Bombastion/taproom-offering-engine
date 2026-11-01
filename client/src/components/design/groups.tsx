import { useId } from 'react';
import { BorderStyle, FontInfo, PrintDesign } from '../../design';
import { Choice, ColorField, NumberField, SwitchRow, TextField } from './controls';
import { StyleEditor } from './StyleEditor';

// The sets of controls on the print menu designer, one for each part of the menu. Each is given the
// design being edited and says what to change with a path into it (see setIn), so it holds no state
// of its own beyond which of its parts is being looked at.

export type Change = (path: (string | number)[], value: unknown) => void;

type GroupProps = { design: PrintDesign; fonts: FontInfo[]; change: Change };

const BORDER_STYLES: { value: BorderStyle; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'double', label: 'Double' },
];

const SIDES = [
  { key: 'top', label: 'Top' },
  { key: 'right', label: 'Right' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'left', label: 'Left' },
] as const;

const ALIGNMENTS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
] as const;

// What a heading is filled with when it is first given a fill
const FIRST_FILL = '#eeeeee';

// How many pages a menu is shrunk to fit when it is first made to shrink
const FIRST_PAGE_LIMIT = 2;

const REM_HINT = '1 rem is about the height of a line of the menu’s normal text, and shrinks with the menu.';

export function PageGroup({ design, change }: GroupProps) {
  const { page } = design;
  // A menu that is allowed to shrink but has no page limit has nothing to shrink to
  const shrinking = page.fit === 'shrink-to-pages' && page.maxPages !== null;
  return (
    <>
      <div className="stack-sm">
        <div className="eyebrow">Margins</div>
        <div className="grid-2">
          {SIDES.map(({ key, label }) => (
            <NumberField
              key={key}
              label={`${label} margin`}
              unit="in"
              min={0}
              max={2}
              step={0.05}
              value={page.marginsIn[key]}
              onChange={(inches) => change(['page', 'marginsIn', key], inches)}
            />
          ))}
        </div>
      </div>

      <div className="stack-sm">
        <Choice
          label="If the menu is too long for its pages"
          value={shrinking ? 'shrink' : 'exact'}
          options={[
            { value: 'shrink', label: 'Shrink to fit' },
            { value: 'exact', label: 'Keep sizes' },
          ]}
          onChange={(choice) =>
            change(['page'], choice === 'shrink' ? { ...page, fit: 'shrink-to-pages', maxPages: page.maxPages ?? FIRST_PAGE_LIMIT } : { ...page, fit: 'none' })
          }
        />
        {shrinking ? (
          <>
            <NumberField label="Fit within" unit="pages" integer min={1} max={20} value={page.maxPages!} onChange={(pages) => change(['page', 'maxPages'], pages)} />
            <span className="muted-sm">Text gets smaller, never bigger, until the menu fits.</span>
          </>
        ) : (
          <span className="muted-sm">Sizes are used as you set them. A long menu continues onto more pages than the preview shows.</span>
        )}
      </div>

      <ColorField label="Page color" value={page.background} onChange={(color) => change(['page', 'background'], color)} />
    </>
  );
}

export function HeaderGroup({ design, fonts, change }: GroupProps) {
  const { logo, title } = design.header;
  return (
    <>
      <div className="stack-sm">
        <SwitchRow label="Show the logo" hint="The logo is the one set on the menu’s page." checked={logo.show} onChange={(show) => change(['header', 'logo', 'show'], show)} />
        {logo.show && (
          <>
            <div className="grid-2">
              <NumberField
                label="Largest width"
                unit="%"
                min={1}
                max={100}
                value={logo.maxWidthPct}
                onChange={(pct) => change(['header', 'logo', 'maxWidthPct'], pct)}
              />
              <NumberField
                label="Space below the logo"
                unit="rem"
                min={0}
                max={5}
                step={0.25}
                value={logo.spaceBelowRem}
                onChange={(rem) => change(['header', 'logo', 'spaceBelowRem'], rem)}
              />
            </div>
            <Choice label="Logo position" value={logo.align} options={[...ALIGNMENTS]} onChange={(align) => change(['header', 'logo', 'align'], align)} />
            <span className="muted-sm">{REM_HINT}</span>
          </>
        )}
      </div>

      <div className="stack-sm">
        <SwitchRow label="Show a title" checked={title.show} onChange={(show) => change(['header', 'title', 'show'], show)} />
        {title.show && (
          <>
            <TextField
              label="Title text"
              value={title.text}
              maxLength={200}
              hint="{menu.name} and {date} are filled in."
              onChange={(text) => change(['header', 'title', 'text'], text)}
            />
            <StyleEditor label="Title style" style={title.style} fonts={fonts} onChange={(style) => change(['header', 'title', 'style'], style)} />
          </>
        )}
      </div>
    </>
  );
}

export function HeadingsGroup({ design, fonts, change }: GroupProps) {
  const { sections } = design;
  const { box } = sections.heading;
  return (
    <>
      <StyleEditor style={sections.heading.style} fonts={fonts} onChange={(style) => change(['sections', 'heading', 'style'], style)} />

      <div className="stack-sm">
        <div className="eyebrow">Layout</div>
        <div className="grid-2">
          <NumberField label="Section width" unit="%" min={30} max={100} value={sections.widthPct} onChange={(pct) => change(['sections', 'widthPct'], pct)} />
          <NumberField
            label="Space above"
            unit="rem"
            min={0}
            max={5}
            step={0.25}
            value={sections.gapAboveRem}
            onChange={(rem) => change(['sections', 'gapAboveRem'], rem)}
          />
        </div>
        <div className="grid-2">
          {SIDES.map(({ key, label }) => (
            <NumberField
              key={key}
              label={`${label} padding`}
              unit="rem"
              min={0}
              max={5}
              step={0.125}
              value={box.paddingRem[key]}
              onChange={(rem) => change(['sections', 'heading', 'box', 'paddingRem', key], rem)}
            />
          ))}
        </div>
        <span className="muted-sm">{REM_HINT}</span>
      </div>

      <div className="stack-sm">
        <div className="eyebrow">Border</div>
        <div className="grid-2">
          <NumberField
            label="Border width"
            unit="px"
            min={0}
            max={20}
            step={1}
            value={box.border.widthPx}
            onChange={(widthPx) => change(['sections', 'heading', 'box', 'border', 'widthPx'], widthPx)}
          />
          <label className="field-label">
            Border style
            <select className="field" value={box.border.style} onChange={(e) => change(['sections', 'heading', 'box', 'border', 'style'], e.target.value)}>
              {BORDER_STYLES.map((style) => (
                <option key={style.value} value={style.value}>{style.label}</option>
              ))}
            </select>
          </label>
        </div>
        <ColorField label="Border color" value={box.border.color} onChange={(color) => change(['sections', 'heading', 'box', 'border', 'color'], color)} />
        <NumberField
          label="Rounded corners"
          unit="px"
          min={0}
          max={50}
          value={box.radiusPx}
          onChange={(radiusPx) => change(['sections', 'heading', 'box', 'radiusPx'], radiusPx)}
        />
        <SwitchRow
          label="Fill the heading with a color"
          checked={box.background !== null}
          onChange={(on) => change(['sections', 'heading', 'box', 'background'], on ? FIRST_FILL : null)}
        />
        {box.background !== null && (
          <ColorField label="Fill color" value={box.background} onChange={(color) => change(['sections', 'heading', 'box', 'background'], color)} />
        )}
      </div>
    </>
  );
}

const DIVIDER_STYLES = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
] as const;

// The space and the line between one item and the next
export function RowsGroup({ design, change }: GroupProps) {
  const { rows } = design;
  return (
    <>
      <NumberField label="Space under each item" unit="rem" min={0} max={3} step={0.125} value={rows.gapRem} onChange={(rem) => change(['rows', 'gapRem'], rem)} />
      <span className="muted-sm">{REM_HINT}</span>
      <SwitchRow label="Line between items" checked={rows.divider.show} onChange={(show) => change(['rows', 'divider', 'show'], show)} />
      {rows.divider.show && (
        <>
          <ColorField label="Divider color" value={rows.divider.color} onChange={(color) => change(['rows', 'divider', 'color'], color)} />
          <NumberField label="Divider thickness" unit="px" min={1} max={10} value={rows.divider.widthPx} onChange={(px) => change(['rows', 'divider', 'widthPx'], px)} />
          <Choice label="Divider style" value={rows.divider.style} options={[...DIVIDER_STYLES]} onChange={(style) => change(['rows', 'divider', 'style'], style)} />
        </>
      )}
    </>
  );
}

const FOOTER_LINES = 4;

function FooterText({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  const tooLong = value.split('\n').length > FOOTER_LINES;
  return (
    <div className="field-label">
      <label htmlFor={id}>Footer text</label>
      <textarea
        id={id}
        className="field"
        rows={3}
        maxLength={400}
        value={value}
        aria-invalid={tooLong}
        aria-describedby={`${id}-hint`}
        onChange={(e) => onChange(e.target.value)}
      />
      <span id={`${id}-hint`} className={tooLong ? 'field-error' : 'muted-sm'}>
        {tooLong ? `Use at most ${FOOTER_LINES} lines.` : 'Each line is printed on its own line. {menu.name} and {date} are filled in.'}
      </span>
    </div>
  );
}

export function FooterGroup({ design, fonts, change }: GroupProps) {
  const { footer } = design;
  return (
    <>
      <SwitchRow label="Show a footer on every page" checked={footer.show} onChange={(show) => change(['footer', 'show'], show)} />
      {footer.show && (
        <>
          <FooterText value={footer.text} onChange={(text) => change(['footer', 'text'], text)} />
          <StyleEditor style={footer.style} fonts={fonts} onChange={(style) => change(['footer', 'style'], style)} />
          <NumberField
            label="Distance from the bottom edge"
            unit="in"
            min={0}
            max={3}
            step={0.05}
            value={footer.bottomIn}
            onChange={(inches) => change(['footer', 'bottomIn'], inches)}
          />
          <SwitchRow label="Line above the footer" checked={footer.rule.show} onChange={(show) => change(['footer', 'rule', 'show'], show)} />
          {footer.rule.show && (
            <div className="grid-2">
              <ColorField label="Line color" value={footer.rule.color} onChange={(color) => change(['footer', 'rule', 'color'], color)} />
              <NumberField
                label="Line thickness"
                unit="px"
                min={1}
                max={10}
                value={footer.rule.widthPx}
                onChange={(px) => change(['footer', 'rule', 'widthPx'], px)}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
