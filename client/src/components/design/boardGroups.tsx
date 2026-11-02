import { BoardDesign, MAX_BOARD_LINES, newBoardLine } from '../../boardDesign';
import { FontInfo } from '../../design';
import { Choice, ColorField, NumberField, SwitchRow, TextField } from './controls';
import { Change } from './groups';
import { LineList } from './lines';
import { StyleEditor } from './StyleEditor';

// The sets of controls on the menu board designer, one for each part of the board. Like the print
// designer's they are given the design being edited and say what to change with a path into it.

type GroupProps = { design: BoardDesign; fonts: FontInfo[]; change: Change };

const ALIGNMENTS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
] as const;

// What a bar is filled with when it is first given a fill
const FIRST_FILL = '#2b2b2b';

const PX_HINT = 'Sizes are in pixels of the picture, which is 1080 wide and 1920 tall.';

export function CanvasGroup({ design, change }: GroupProps) {
  return (
    <>
      <ColorField label="Background color" value={design.canvas.background} onChange={(color) => change(['canvas', 'background'], color)} />
      <NumberField label="Safe margin" unit="px" min={0} max={200} value={design.canvas.safeMarginPx} onChange={(px) => change(['canvas', 'safeMarginPx'], px)} />
      <span className="muted-sm">TVs crop and stretch the edges of the picture. Nothing but the background is drawn this close to an edge. {PX_HINT}</span>
    </>
  );
}

export function BoardHeaderGroup({ design, fonts, change }: GroupProps) {
  const { logo, title } = design.header;
  return (
    <>
      <div className="stack-sm">
        <SwitchRow label="Show the logo" hint="The logo is the one set on the menu’s page. Every page of the board has it." checked={logo.show} onChange={(show) => change(['header', 'logo', 'show'], show)} />
        {logo.show && (
          <>
            <NumberField label="Logo size" unit="px" min={20} max={600} value={logo.sizePx} onChange={(px) => change(['header', 'logo', 'sizePx'], px)} />
            <Choice label="Logo position" value={logo.align} options={[...ALIGNMENTS]} onChange={(align) => change(['header', 'logo', 'align'], align)} />
            <Choice
              label="Logo shape"
              value={logo.fit}
              options={[
                { value: 'stretch', label: 'Fill a square' },
                { value: 'contain', label: 'Keep proportions' },
              ]}
              onChange={(fit) => change(['header', 'logo', 'fit'], fit)}
            />
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
              maxLength={100}
              hint="{menu.name} and {date} are filled in."
              onChange={(text) => change(['header', 'title', 'text'], text)}
            />
            <NumberField label="Space above the title" unit="px" min={0} max={200} value={title.gapAbovePx} onChange={(px) => change(['header', 'title', 'gapAbovePx'], px)} />
            <StyleEditor label="Title style" style={title.style} fonts={fonts} onChange={(style) => change(['header', 'title', 'style'], style)} />
          </>
        )}
      </div>

      <NumberField label="Space below the header" unit="px" min={0} max={300} value={design.header.gapBelowPx} onChange={(px) => change(['header', 'gapBelowPx'], px)} />
    </>
  );
}

export function BarsGroup({ design, fonts, change }: GroupProps) {
  const { bar, gapPx } = design.sections;
  return (
    <>
      <StyleEditor label="Style of section names" style={bar.style} fonts={fonts} onChange={(style) => change(['sections', 'bar', 'style'], style)} />

      <div className="stack-sm">
        <div className="eyebrow">Bar</div>
        <SwitchRow
          label="Fill the bar with a color"
          hint="Without one, only the section’s name is drawn."
          checked={bar.background !== null}
          onChange={(on) => change(['sections', 'bar', 'background'], on ? FIRST_FILL : null)}
        />
        {bar.background !== null && (
          <>
            <ColorField label="Bar color" value={bar.background} onChange={(color) => change(['sections', 'bar', 'background'], color)} />
            <NumberField label="Rounded corners" unit="px" min={0} max={100} value={bar.radiusPx} onChange={(px) => change(['sections', 'bar', 'radiusPx'], px)} />
          </>
        )}
        <div className="grid-2">
          <NumberField label="Bar height" unit="px" min={20} max={300} step={0.5} value={bar.heightPx} onChange={(px) => change(['sections', 'bar', 'heightPx'], px)} />
          <NumberField label="Space above the bar" unit="px" min={0} max={100} step={0.5} value={bar.marginTopPx} onChange={(px) => change(['sections', 'bar', 'marginTopPx'], px)} />
          <NumberField label="Name inset" unit="px" min={0} max={100} step={0.5} value={bar.insetPx} onChange={(px) => change(['sections', 'bar', 'insetPx'], px)} />
          <NumberField label="Name from the top" unit="px" min={0} max={100} step={0.5} value={bar.textTopPx} onChange={(px) => change(['sections', 'bar', 'textTopPx'], px)} />
        </div>
        <span className="muted-sm">The name starts this far in from the bar’s left edge, and this far down from its top. {PX_HINT}</span>
      </div>

      <div className="stack-sm">
        <NumberField label="Space between sections" unit="px" min={0} max={200} value={gapPx} onChange={(px) => change(['sections', 'gapPx'], px)} />
        <TextField
          label="Added when a section continues"
          value={bar.continuedSuffix}
          maxLength={30}
          hint="Put after the section’s name on the next page, when its items don’t all fit on one."
          onChange={(text) => change(['sections', 'bar', 'continuedSuffix'], text)}
        />
      </div>
    </>
  );
}

const SOURCES = [
  { value: 'item-then-menu', label: 'The item’s picture, or the menu’s logo' },
  { value: 'item-then-brewery-then-menu', label: 'The item’s, then its brewery’s, then the menu’s' },
] as const;

export function ItemsGroup({ design, fonts, change }: GroupProps) {
  const { items } = design;
  const { logo } = items;
  return (
    <>
      <div className="stack-sm">
        <SwitchRow label="Show a picture beside each item" checked={logo.show} onChange={(show) => change(['items', 'logo', 'show'], show)} />
        {logo.show && (
          <>
            <NumberField label="Picture size" unit="px" min={16} max={300} step={0.5} value={logo.sizePx} onChange={(px) => change(['items', 'logo', 'sizePx'], px)} />
            <Choice
              label="Shape"
              value={logo.shape}
              options={[
                { value: 'circle', label: 'Circle' },
                { value: 'rounded', label: 'Rounded' },
                { value: 'square', label: 'Square' },
              ]}
              onChange={(shape) => change(['items', 'logo', 'shape'], shape)}
            />
            <label className="field-label">
              Picture to use
              <select className="field" value={logo.source} onChange={(e) => change(['items', 'logo', 'source'], e.target.value)}>
                {SOURCES.map((source) => (
                  <option key={source.value} value={source.value}>{source.label}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      <NumberField label="Space around each item" unit="px" min={0} max={100} step={0.5} value={items.gapPx} onChange={(px) => change(['items', 'gapPx'], px)} />

      <LineList
        names={{ title: 'Lines', noun: 'line', hint: 'The text beside each item, one line after another. Prices are not shown on the board.' }}
        lines={items.lines}
        path={['items', 'lines']}
        fonts={fonts}
        change={change}
        min={1}
        max={MAX_BOARD_LINES}
        newLine={() => newBoardLine(items.lines)}
        separator=" · "
        partWithout={['size', 'align']}
      />
      <span className="muted-sm">On the board, the text printed before a part is drawn in that part’s style, so it can match the part it leads into.</span>
    </>
  );
}
