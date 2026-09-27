/**
 * Property controls used by the inspector panels.
 *
 * Every control is label-bound, keyboard operable and reports changes on commit
 * rather than per keystroke where that would create excessive undo steps.
 */

import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Link2,
  Lock,
  Pipette,
  RotateCcw,
  Unlock,
} from 'lucide-react';
import type { Align, Background, Border, BorderStyle, Spacing, VAlign } from '../model/document';
import { Popover, Segmented, ToolButton, usePopoverContext } from './primitives';

// ── Field wrapper ─────────────────────────────────────────────────────────────

export function Field({
  label,
  children,
  hint,
  htmlFor,
  inline = false,
  action,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  htmlFor?: string;
  inline?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className={clsx(inline ? 'flex items-center justify-between gap-3' : 'space-y-1.5')}>
      <div className="flex items-center gap-1.5">
        <label
          htmlFor={htmlFor}
          className={clsx('text-[11px] font-medium text-gray-600', inline && 'shrink-0')}
        >
          {label}
        </label>
        {action}
      </div>
      <div className={clsx(inline && 'min-w-0 flex-1')}>{children}</div>
      {hint && !inline && <p className="text-[10.5px] leading-snug text-gray-500">{hint}</p>}
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[13px] text-gray-900 ' +
  'placeholder:text-gray-400 transition-colors focus:border-brand-400 focus:outline-none ' +
  'focus:ring-2 focus:ring-brand-500/20 disabled:bg-gray-50 disabled:text-gray-400';

// ── Text ──────────────────────────────────────────────────────────────────────

export function TextInput({
  value,
  onChange,
  placeholder,
  label,
  hint,
  disabled,
  mono,
  /** Commit on blur/Enter instead of on every keystroke. */
  commitOnBlur = false,
  inline = false,
  action,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  mono?: boolean;
  commitOnBlur?: boolean;
  inline?: boolean;
  action?: ReactNode;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Field label={label} hint={hint} htmlFor={id} inline={inline} action={action}>
      <input
        id={id}
        type="text"
        value={commitOnBlur ? draft : value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={event => (commitOnBlur ? setDraft(event.target.value) : onChange(event.target.value))}
        onBlur={() => commitOnBlur && draft !== value && onChange(draft)}
        onKeyDown={event => {
          if (commitOnBlur && event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
        className={clsx(inputClass, mono && 'font-mono text-xs')}
      />
    </Field>
  );
}

export function TextArea({
  value,
  onChange,
  label,
  rows = 3,
  placeholder,
  hint,
  mono,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  rows?: number;
  placeholder?: string;
  hint?: string;
  mono?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
        className={clsx(inputClass, 'resize-y', mono && 'font-mono text-xs')}
      />
    </Field>
  );
}

// ── Number ────────────────────────────────────────────────────────────────────

export function NumberInput({
  value,
  onChange,
  label,
  min,
  max,
  step = 1,
  suffix,
  placeholder = 'Auto',
  allowEmpty = false,
  hint,
  inline = false,
  disabled,
}: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  hint?: string;
  inline?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value === null || value === undefined ? '' : String(value));
  useEffect(() => {
    setDraft(value === null || value === undefined ? '' : String(value));
  }, [value]);

  const commit = (raw: string) => {
    if (!raw.trim()) {
      if (allowEmpty) onChange(null);
      else setDraft(value === null || value === undefined ? '' : String(value));
      return;
    }
    let parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      setDraft(value === null || value === undefined ? '' : String(value));
      return;
    }
    if (min !== undefined) parsed = Math.max(min, parsed);
    if (max !== undefined) parsed = Math.min(max, parsed);
    onChange(parsed);
    setDraft(String(parsed));
  };

  return (
    <Field label={label} hint={hint} htmlFor={id} inline={inline}>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          value={draft}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          placeholder={placeholder}
          onChange={event => setDraft(event.target.value)}
          onBlur={event => commit(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          className={clsx(inputClass, suffix && 'pr-8')}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">
            {suffix}
          </span>
        )}
      </div>
    </Field>
  );
}

export function SliderInput({
  value,
  onChange,
  label,
  min,
  max,
  step = 1,
  suffix,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  const id = useId();
  return (
    <Field
      label={label}
      htmlFor={id}
      action={
        <span className="text-[11px] font-normal tabular-nums text-gray-500">
          {value}
          {suffix}
        </span>
      }
    >
      <input
        id={id}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={event => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-brand-600"
      />
    </Field>
  );
}

// ── Select ────────────────────────────────────────────────────────────────────

export function SelectInput<T extends string>({
  value,
  onChange,
  label,
  options,
  hint,
  inline = false,
  disabled,
}: {
  value: T;
  onChange: (value: T) => void;
  label: string;
  options: { value: T; label: string; group?: string }[];
  hint?: string;
  inline?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const groups = options.reduce<Record<string, typeof options>>((acc, option) => {
    const key = option.group || '';
    acc[key] = acc[key] || [];
    acc[key].push(option);
    return acc;
  }, {});
  const groupNames = Object.keys(groups);

  return (
    <Field label={label} hint={hint} htmlFor={id} inline={inline}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value as T)}
        className={clsx(inputClass, 'cursor-pointer pr-7')}
      >
        {groupNames.length === 1 && groupNames[0] === ''
          ? options.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))
          : groupNames.map(name =>
              name ? (
                <optgroup key={name} label={name}>
                  {groups[name].map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ) : (
                groups[name].map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))
              )
            )}
      </select>
    </Field>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────

export function ToggleInput({
  value,
  onChange,
  label,
  hint,
  disabled,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-[11px] font-medium text-gray-600">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-[10.5px] leading-snug text-gray-500">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={clsx(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
          disabled && 'opacity-40',
          value ? 'bg-brand-600' : 'bg-gray-300'
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
            value ? 'translate-x-[18px]' : 'translate-x-0.5'
          )}
        />
      </button>
    </div>
  );
}

// ── Alignment ─────────────────────────────────────────────────────────────────

export function AlignInput({
  value,
  onChange,
  label = 'Alignment',
  includeJustify = false,
}: {
  value: Align;
  onChange: (value: Align) => void;
  label?: string;
  includeJustify?: boolean;
}) {
  const options: { value: Align; label: string; icon: ReactNode }[] = [
    { value: 'left', label: 'Left', icon: <AlignLeft size={13} /> },
    { value: 'center', label: 'Center', icon: <AlignCenter size={13} /> },
    { value: 'right', label: 'Right', icon: <AlignRight size={13} /> },
  ];
  if (includeJustify) options.push({ value: 'justify', label: 'Justify', icon: <AlignJustify size={13} /> });
  return (
    <Field label={label}>
      <div role="radiogroup" aria-label={label} className="inline-flex gap-0.5 rounded-lg bg-gray-100 p-0.5">
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.value)}
            className={clsx(
              'inline-flex h-7 w-8 items-center justify-center rounded-[7px] transition-all',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              value === option.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            )}
          >
            {option.icon}
          </button>
        ))}
      </div>
    </Field>
  );
}

export function VAlignInput({ value, onChange }: { value: VAlign; onChange: (value: VAlign) => void }) {
  return (
    <Field label="Vertical alignment">
      <Segmented
        label="Vertical alignment"
        value={value}
        size="sm"
        fullWidth
        onChange={onChange}
        options={[
          { value: 'top', label: 'Top' },
          { value: 'middle', label: 'Middle' },
          { value: 'bottom', label: 'Bottom' },
        ]}
      />
    </Field>
  );
}

// ── Colour ────────────────────────────────────────────────────────────────────

export interface ColorPalette {
  theme: { label: string; value: string }[];
  brand: string[];
  recent: string[];
  saved: string[];
}

const RECENT_KEY = 'composer2:recent-colors';

export function readRecentColors(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function pushRecentColor(color: string): void {
  if (!color || !/^#[0-9a-f]{3,8}$/i.test(color)) return;
  try {
    const current = readRecentColors().filter(entry => entry.toLowerCase() !== color.toLowerCase());
    localStorage.setItem(RECENT_KEY, JSON.stringify([color, ...current].slice(0, 12)));
  } catch {
    /* ignore */
  }
}

function Swatch({
  color,
  selected,
  title,
  onClick,
}: {
  color: string;
  selected?: boolean;
  title: string;
  onClick: () => void;
}) {
  const transparent = !color || color === 'transparent';
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={selected}
      onClick={onClick}
      className={clsx(
        'h-6 w-6 rounded-md border transition-transform hover:scale-110',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
        selected ? 'border-brand-500 ring-1 ring-brand-500' : 'border-gray-200'
      )}
      style={
        transparent
          ? {
              backgroundImage:
                'linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%),linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%)',
              backgroundSize: '8px 8px',
              backgroundPosition: '0 0, 4px 4px',
            }
          : { backgroundColor: color }
      }
    />
  );
}

/**
 * Colour control with the full menu from spec 5.4: automatic, theme, brand,
 * recent, saved and a custom picker with hex entry.
 */
export function ColorInput({
  value,
  onChange,
  label,
  palette,
  allowAutomatic = true,
  automaticLabel = 'Automatic',
  allowTransparent = false,
  hint,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  label: string;
  palette: ColorPalette;
  allowAutomatic?: boolean;
  automaticLabel?: string;
  allowTransparent?: boolean;
  hint?: string;
}) {
  const isAuto = value === null || value === undefined || value === '';
  const swatchColor = isAuto ? '#ffffff' : value;

  return (
    <Field label={label} hint={hint}>
      <Popover
        label={`${label} colour`}
        width={252}
        trigger={({ toggle, ref, open }) => (
          <button
            type="button"
            ref={node => ref(node)}
            onClick={toggle}
            aria-expanded={open}
            className={clsx(
              'flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-left',
              'transition-colors hover:border-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
            )}
          >
            <span
              className="h-5 w-5 shrink-0 rounded border border-gray-200"
              style={
                isAuto
                  ? {
                      backgroundImage:
                        'linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%),linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%)',
                      backgroundSize: '8px 8px',
                      backgroundPosition: '0 0, 4px 4px',
                    }
                  : { backgroundColor: swatchColor as string }
              }
            />
            <span className="min-w-0 flex-1 truncate text-[12px] text-gray-700">
              {isAuto ? automaticLabel : value}
            </span>
          </button>
        )}
      >
        <ColorMenu
          value={value ?? null}
          onChange={onChange}
          palette={palette}
          allowAutomatic={allowAutomatic}
          automaticLabel={automaticLabel}
          allowTransparent={allowTransparent}
        />
      </Popover>
    </Field>
  );
}

export function ColorMenu({
  value,
  onChange,
  palette,
  allowAutomatic,
  automaticLabel,
  allowTransparent,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  palette: ColorPalette;
  allowAutomatic?: boolean;
  automaticLabel?: string;
  allowTransparent?: boolean;
}) {
  const { close } = usePopoverContext();
  const [hex, setHex] = useState(value && value.startsWith('#') ? value : '#000000');

  const pick = (color: string | null) => {
    if (color) pushRecentColor(color);
    onChange(color);
    close();
  };

  return (
    <div className="space-y-3">
      {(allowAutomatic || allowTransparent) && (
        <div className="flex flex-wrap gap-1.5">
          {allowAutomatic && (
            <button
              type="button"
              onClick={() => pick(null)}
              className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-200"
            >
              {automaticLabel || 'Automatic'}
            </button>
          )}
          {allowTransparent && (
            <button
              type="button"
              onClick={() => pick('transparent')}
              className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-200"
            >
              Transparent
            </button>
          )}
        </div>
      )}

      {palette.theme.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Theme</p>
          <div className="flex flex-wrap gap-1.5">
            {palette.theme.map(entry => (
              <Swatch
                key={`${entry.label}-${entry.value}`}
                color={entry.value}
                title={entry.label}
                selected={value?.toLowerCase() === entry.value.toLowerCase()}
                onClick={() => pick(entry.value)}
              />
            ))}
          </div>
        </div>
      )}

      {palette.brand.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Organization</p>
          <div className="flex flex-wrap gap-1.5">
            {palette.brand.map(color => (
              <Swatch
                key={color}
                color={color}
                title={color}
                selected={value?.toLowerCase() === color.toLowerCase()}
                onClick={() => pick(color)}
              />
            ))}
          </div>
        </div>
      )}

      {palette.saved.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Saved</p>
          <div className="flex flex-wrap gap-1.5">
            {palette.saved.map(color => (
              <Swatch key={color} color={color} title={color} onClick={() => pick(color)} />
            ))}
          </div>
        </div>
      )}

      {palette.recent.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Recent</p>
          <div className="flex flex-wrap gap-1.5">
            {palette.recent.map(color => (
              <Swatch key={color} color={color} title={color} onClick={() => pick(color)} />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2 border-t border-gray-100 pt-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Custom</p>
        <div className="flex items-center gap-2">
          <label className="relative h-7 w-9 shrink-0 cursor-pointer overflow-hidden rounded-md border border-gray-200">
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#000000'}
              onChange={event => setHex(event.target.value)}
              className="absolute -left-2 -top-2 h-12 w-14 cursor-pointer border-0 p-0"
              aria-label="Pick a colour"
            />
          </label>
          <input
            type="text"
            value={hex}
            onChange={event => setHex(event.target.value)}
            placeholder="#4f46e5 or rgb(79,70,229)"
            aria-label="Colour value"
            className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-[11px] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <ToolButton
            icon={<Pipette size={13} />}
            label="Apply colour"
            onClick={() => {
              const normalized = normalizeColor(hex);
              if (normalized) pick(normalized);
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** Accepts hex or rgb() and returns a hex string the compiler can inline. */
export function normalizeColor(input: string): string | null {
  const raw = input.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)) return raw.toLowerCase();
  const rgb = raw.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgb) {
    const toHex = (value: string) => Math.max(0, Math.min(255, Number(value))).toString(16).padStart(2, '0');
    return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`;
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toLowerCase()}`;
  return null;
}

// ── Spacing ───────────────────────────────────────────────────────────────────

export function SpacingInput({
  value,
  onChange,
  label = 'Padding',
  max = 120,
}: {
  value: Spacing;
  onChange: (value: Spacing) => void;
  label?: string;
  max?: number;
}) {
  const uniform = value.top === value.right && value.right === value.bottom && value.bottom === value.left;
  const [linked, setLinked] = useState(uniform);
  useEffect(() => {
    if (uniform) setLinked(true);
  }, [uniform]);

  const setSide = (side: keyof Spacing, next: number) => {
    const clamped = Math.max(0, Math.min(max, next));
    onChange(linked ? { top: clamped, right: clamped, bottom: clamped, left: clamped } : { ...value, [side]: clamped });
  };

  return (
    <Field
      label={label}
      action={
        <ToolButton
          size="sm"
          tone="subtle"
          icon={linked ? <Lock size={11} /> : <Unlock size={11} />}
          label={linked ? 'Unlink sides' : 'Link all sides'}
          active={linked}
          onClick={() => setLinked(current => !current)}
        />
      }
    >
      {linked ? (
        <div className="relative">
          <input
            type="number"
            min={0}
            max={max}
            value={value.top}
            aria-label={`${label} on all sides`}
            onChange={event => setSide('top', Number(event.target.value))}
            className={clsx(inputClass, 'pr-8')}
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">
            px
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {(['top', 'right', 'bottom', 'left'] as (keyof Spacing)[]).map(side => (
            <div key={side}>
              <input
                type="number"
                min={0}
                max={max}
                value={value[side]}
                aria-label={`${label} ${side}`}
                onChange={event => setSide(side, Number(event.target.value))}
                className="w-full rounded-lg border border-gray-200 px-1.5 py-1 text-center text-[12px] tabular-nums focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
              <p className="mt-0.5 text-center text-[9.5px] uppercase text-gray-400">{side.slice(0, 1)}</p>
            </div>
          ))}
        </div>
      )}
    </Field>
  );
}

// ── Border ────────────────────────────────────────────────────────────────────

export function BorderInput({
  value,
  onChange,
  palette,
  showRadius = true,
}: {
  value: Border;
  onChange: (value: Border) => void;
  palette: ColorPalette;
  showRadius?: boolean;
}) {
  const styles: { value: BorderStyle; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
    { value: 'double', label: 'Double' },
  ];
  return (
    <div className="space-y-3">
      <SelectInput
        label="Border style"
        value={value.style}
        options={styles}
        onChange={style =>
          onChange({
            ...value,
            style,
            width: style !== 'none' && value.width.top === 0 ? { top: 1, right: 1, bottom: 1, left: 1 } : value.width,
          })
        }
      />
      {value.style !== 'none' && (
        <>
          <SpacingInput label="Border width" max={12} value={value.width} onChange={width => onChange({ ...value, width })} />
          <ColorInput
            label="Border colour"
            palette={palette}
            value={value.color}
            allowAutomatic={false}
            onChange={color => onChange({ ...value, color: color || '#e5e7eb' })}
          />
        </>
      )}
      {showRadius && (
        <NumberInput
          label="Corner radius"
          suffix="px"
          min={0}
          max={40}
          value={value.radius}
          onChange={radius => onChange({ ...value, radius: radius ?? 0 })}
          hint="Rounded corners are ignored by Outlook on Windows."
        />
      )}
    </div>
  );
}

// ── Background ────────────────────────────────────────────────────────────────

export function BackgroundInput({
  value,
  onChange,
  palette,
  label = 'Background',
  allowImage = true,
  onPickImage,
}: {
  value: Background;
  onChange: (value: Background) => void;
  palette: ColorPalette;
  label?: string;
  allowImage?: boolean;
  onPickImage?: () => void;
}) {
  const modes: { value: Background['mode']; label: string }[] = [
    { value: 'inherit', label: 'Inherit' },
    { value: 'transparent', label: 'None' },
    { value: 'color', label: 'Colour' },
  ];
  if (allowImage) modes.push({ value: 'image', label: 'Image' });

  return (
    <div className="space-y-3">
      <Field label={label}>
        <Segmented
          label={label}
          size="sm"
          fullWidth
          value={value.mode}
          onChange={mode => onChange({ ...value, mode })}
          options={modes}
        />
      </Field>

      {value.mode === 'color' && (
        <ColorInput
          label="Colour"
          palette={palette}
          allowAutomatic={false}
          value={value.color || '#ffffff'}
          onChange={color => onChange({ ...value, color: color || '#ffffff' })}
        />
      )}

      {value.mode === 'image' && (
        <>
          <TextInput
            label="Image URL"
            value={value.imageUrl || ''}
            commitOnBlur
            placeholder="https://…"
            onChange={imageUrl => onChange({ ...value, imageUrl })}
            action={
              onPickImage ? (
                <ToolButton size="sm" tone="subtle" icon={<Link2 size={11} />} label="Choose from assets" onClick={onPickImage} />
              ) : undefined
            }
          />
          <SelectInput
            label="Size"
            value={value.imageSize || 'cover'}
            options={[
              { value: 'cover', label: 'Cover' },
              { value: 'contain', label: 'Contain' },
              { value: 'auto', label: 'Original size' },
            ]}
            onChange={imageSize => onChange({ ...value, imageSize })}
          />
          <SelectInput
            label="Repeat"
            value={value.imageRepeat || 'no-repeat'}
            options={[
              { value: 'no-repeat', label: 'No repeat' },
              { value: 'repeat', label: 'Tile' },
              { value: 'repeat-x', label: 'Tile horizontally' },
              { value: 'repeat-y', label: 'Tile vertically' },
            ]}
            onChange={imageRepeat => onChange({ ...value, imageRepeat })}
          />
          <TextInput
            label="Position"
            value={value.imagePosition || 'center center'}
            commitOnBlur
            placeholder="center center"
            onChange={imagePosition => onChange({ ...value, imagePosition })}
          />
          <ColorInput
            label="Fallback colour"
            palette={palette}
            value={value.fallbackColor}
            automaticLabel="None"
            hint="Shown by clients that drop background images, including Outlook."
            onChange={fallbackColor => onChange({ ...value, fallbackColor: fallbackColor || undefined })}
          />
        </>
      )}
    </div>
  );
}

// ── Reset row ─────────────────────────────────────────────────────────────────

export function ResetRow({ label, onReset }: { label: string; onReset: () => void }) {
  return (
    <button
      type="button"
      onClick={onReset}
      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 transition-colors hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <RotateCcw size={11} />
      {label}
    </button>
  );
}

/** Marks a value that comes from the theme rather than an explicit override. */
export function InheritedNote({ children }: { children: ReactNode }) {
  return <p className="text-[10.5px] italic leading-snug text-gray-400">{children}</p>;
}

export function useDebouncedCallback<T extends (...args: never[]) => void>(callback: T, delay: number): T {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  return ((...args: never[]) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(...args), delay);
  }) as T;
}
