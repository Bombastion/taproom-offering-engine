import { ReactNode, useEffect, useId, useState } from 'react';
import { HEX_COLOR } from '../../design';

// The small inputs the designer is made of. Each takes a value and says when it changes, and only
// says so for a value the server would accept, so the design being edited stays valid; what is
// typed in the meantime (half a number, say) stays in the box.

type NumberFieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  // Only whole numbers are accepted
  integer?: boolean;
  onChange: (value: number) => void;
};

export function NumberField({ label, value, min, max, step = 1, unit, integer = false, onChange }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(String(value));

  // Follow the value when it changes from elsewhere (revert, reset, a different font's weight)
  useEffect(() => {
    setText((current) => (current.trim() !== '' && Number(current) === value ? current : String(value)));
  }, [value]);

  const usable = (text: string) => {
    const number = text.trim() === '' ? NaN : Number(text);
    return number >= min && number <= max && (!integer || Number.isInteger(number));
  };
  const valid = usable(text);

  return (
    <div className="field-label">
      <label htmlFor={id}>{label}</label>
      <div className={`field-unit${unit && unit.length > 2 ? ' field-unit-wide' : ''}`}>
        <input
          id={id}
          className="field"
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={text}
          aria-invalid={!valid}
          aria-describedby={valid ? undefined : `${id}-error`}
          onChange={(e) => {
            setText(e.target.value);
            if (usable(e.target.value)) onChange(Number(e.target.value));
          }}
          // Leaving the box with something unusable in it puts the real value back
          onBlur={() => setText(String(value))}
        />
        {unit && <span className="field-suffix" aria-hidden="true">{unit}</span>}
      </div>
      {!valid && <span className="field-error" id={`${id}-error`}>Use {integer ? 'a whole number, ' : ''}{min} to {max}</span>}
    </div>
  );
}

type ColorFieldProps = { label: string; value: string; onChange: (value: string) => void };

export function ColorField({ label, value, onChange }: ColorFieldProps) {
  const id = useId();
  const [text, setText] = useState(value);

  useEffect(() => {
    setText((current) => (current.toLowerCase() === value.toLowerCase() ? current : value));
  }, [value]);

  const valid = HEX_COLOR.test(text);

  return (
    <div className="field-label">
      <label htmlFor={id}>{label}</label>
      <div className="color-field">
        {/* The picker only does #rrggbb; a color with transparency in it keeps its own until another is picked */}
        <input
          type="color"
          className="color-swatch"
          aria-label={`Pick ${label.toLowerCase()}`}
          value={HEX_COLOR.test(value) ? value.slice(0, 7).toLowerCase() : '#000000'}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          id={id}
          className="field mono"
          type="text"
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          maxLength={9}
          value={text}
          aria-invalid={!valid}
          aria-describedby={valid ? undefined : `${id}-error`}
          onChange={(e) => {
            setText(e.target.value);
            if (HEX_COLOR.test(e.target.value)) onChange(e.target.value.toLowerCase());
          }}
          onBlur={() => setText(value)}
        />
      </div>
      {!valid && <span className="field-error" id={`${id}-error`}>Use a color like #3f3f3f</span>}
    </div>
  );
}

type SwitchRowProps = { label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: ReactNode };

export function SwitchRow({ label, checked, onChange, hint }: SwitchRowProps) {
  return (
    <div className="views-row">
      <span className="active-text">
        <span>{label}</span>
        {hint && <span className="muted-sm">{hint}</span>}
      </span>
      <label className="switch">
        <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch-track" aria-hidden="true" />
      </label>
    </div>
  );
}

type ChoiceProps<T extends string> = {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
};

// A few options side by side, one chosen
export function Choice<T extends string>({ label, value, options, onChange }: ChoiceProps<T>) {
  return (
    <div className="field-label">
      <span>{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            className={`seg-option${option.value === value ? ' seg-on' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type TextFieldProps = {
  label: string;
  value: string;
  maxLength: number;
  hint?: ReactNode;
  // Says what is wrong with a value, or nothing; only a value that is fine is passed on, and the
  // real one comes back when the box is left with something that isn't
  validate?: (value: string) => string | null;
  onChange: (value: string) => void;
};

// One line of text
export function TextField({ label, value, maxLength, hint, validate, onChange }: TextFieldProps) {
  const id = useId();
  const [text, setText] = useState(value);

  useEffect(() => {
    setText((current) => (current === value || validate?.(current) ? current : value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const problem = validate?.(text) ?? null;
  const describedBy = [problem ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field-label">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="field"
        type="text"
        maxLength={maxLength}
        value={text}
        aria-invalid={problem !== null}
        aria-describedby={describedBy}
        onChange={(e) => {
          setText(e.target.value);
          if (!validate?.(e.target.value)) onChange(e.target.value);
        }}
        onBlur={() => setText(value)}
      />
      {problem && <span className="field-error" id={`${id}-error`}>{problem}</span>}
      {hint && <span id={`${id}-hint`} className="muted-sm">{hint}</span>}
    </div>
  );
}
