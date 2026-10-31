import { FontInfo, styleForFont, TextStyle, WEIGHT_NAMES } from '../../design';
import { Choice, ColorField, NumberField } from './controls';

const CATEGORY_LABELS: Record<FontInfo['category'], string> = {
  system: 'Browser',
  sans: 'Sans-serif',
  serif: 'Serif',
  display: 'Display',
  script: 'Script',
};

type Props = {
  style: TextStyle;
  fonts: FontInfo[];
  onChange: (style: TextStyle) => void;
  // Names the controls as a group, for when a screen has more than one editor
  label?: string;
};

// What a line of text gets when it is given a line height of its own
const FIRST_LINE_HEIGHT = 1.2;

// Everything about how a piece of text looks, in one place: font, size, weight, color, alignment, spacing
export function StyleEditor({ style, fonts, onChange, label }: Props) {
  const font = fonts.find((f) => f.id === style.font);
  // Only the weights the font really has (others the browser would fake); the current one stays in the list either way
  const weights = font ? (font.weights.includes(style.weight) ? font.weights : [...font.weights, style.weight].sort((a, b) => a - b)) : [style.weight];
  const patch = (changes: Partial<TextStyle>) => onChange({ ...style, ...changes });

  return (
    <div className="stack-sm" role={label ? 'group' : undefined} aria-label={label}>
      <label className="field-label">
        Font
        <select
          className="field"
          value={style.font}
          onChange={(e) => {
            const next = fonts.find((f) => f.id === e.target.value);
            if (next) onChange(styleForFont(style, next));
          }}
        >
          {(Object.keys(CATEGORY_LABELS) as FontInfo['category'][]).map((category) => {
            const inCategory = fonts.filter((f) => f.category === category);
            return (
              inCategory.length > 0 && (
                <optgroup key={category} label={CATEGORY_LABELS[category]}>
                  {inCategory.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </optgroup>
              )
            );
          })}
        </select>
      </label>

      <div className="grid-2">
        <NumberField label="Size" unit="pt" min={4} max={96} step={0.5} value={style.sizePt} onChange={(sizePt) => patch({ sizePt })} />
        <label className="field-label">
          Weight
          <select className="field" value={style.weight} onChange={(e) => patch({ weight: Number(e.target.value) })}>
            {weights.map((weight) => (
              <option key={weight} value={weight}>{WEIGHT_NAMES[weight] ?? weight} ({weight})</option>
            ))}
          </select>
        </label>
      </div>

      <ColorField label="Color" value={style.color} onChange={(color) => patch({ color })} />

      <Choice
        label="Alignment"
        value={style.align}
        options={[
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' },
        ]}
        onChange={(align) => patch({ align })}
      />

      <div className="grid-2">
        {(font?.italic ?? true) && (
          <label className="check-row">
            <input type="checkbox" checked={style.italic} onChange={(e) => patch({ italic: e.target.checked })} />
            Italic
          </label>
        )}
        <label className="check-row">
          <input type="checkbox" checked={style.transform === 'uppercase'} onChange={(e) => patch({ transform: e.target.checked ? 'uppercase' : 'none' })} />
          Uppercase
        </label>
      </div>

      {/* Open to begin with when the text has spacing of its own, so it isn't hidden */}
      <details className="design-more" open={style.letterSpacingEm !== 0 || style.lineHeight !== null}>
        <summary>Spacing</summary>
        <div className="stack-sm">
          <NumberField
            label="Letter spacing"
            unit="em"
            min={-0.2}
            max={1}
            step={0.01}
            value={style.letterSpacingEm}
            onChange={(letterSpacingEm) => patch({ letterSpacingEm })}
          />
          <label className="check-row">
            <input
              type="checkbox"
              checked={style.lineHeight !== null}
              onChange={(e) => patch({ lineHeight: e.target.checked ? FIRST_LINE_HEIGHT : null })}
            />
            Set the line height
          </label>
          {style.lineHeight !== null && (
            <NumberField label="Line height" min={0.8} max={3} step={0.05} value={style.lineHeight} onChange={(lineHeight) => patch({ lineHeight })} />
          )}
        </div>
      </details>
    </div>
  );
}
