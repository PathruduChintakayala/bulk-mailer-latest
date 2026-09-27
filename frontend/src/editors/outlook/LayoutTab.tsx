import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { ThemeConfig } from '../../types';

interface Props {
  editor?: any;
  themeConfig: ThemeConfig | null;
  onThemeChange: (theme: ThemeConfig | null) => void;
}

const DEFAULTS: Required<ThemeConfig> = {
  backgroundColor: '#ffffff',
  textColor: '#1f2937',
  headingColor: '#111827',
  linkColor: '#4f46e5',
  primaryColor: '#4f46e5',
  secondaryColor: '#6366f1',
  accentColor: '#818cf8',
  buttonColor: '#4f46e5',
  buttonTextColor: '#ffffff',
};

type ColorKey = 'backgroundColor' | 'textColor' | 'linkColor' | 'buttonColor';

function ColorSwatch({
  label,
  colorKey,
  displayDefault,
  themeConfig,
  onThemeChange,
}: {
  label: string;
  colorKey: ColorKey;
  displayDefault: string;
  themeConfig: ThemeConfig | null;
  onThemeChange: (theme: ThemeConfig | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const value = themeConfig?.[colorKey];
  const display = value || displayDefault;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const ensureTheme = (): ThemeConfig => ({ ...DEFAULTS, ...(themeConfig || {}) });

  return (
    <div className="flex items-center gap-2 relative" ref={ref}>
      <span className="text-[11px] text-gray-500 font-medium">{label}:</span>
      <button
        type="button"
        title={`${label} color`}
        aria-label={`${label} color`}
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="w-6 h-6 rounded border border-gray-300 cursor-pointer hover:ring-2 hover:ring-brand-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-all"
        style={{
          backgroundColor: value ? display : 'transparent',
          backgroundImage: !value
            ? 'linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%), linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%)'
            : undefined,
          backgroundSize: !value ? '6px 6px' : undefined,
          backgroundPosition: !value ? '0 0, 3px 3px' : undefined,
        }}
      />
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-[170px]">
          <button
            type="button"
            className="w-full text-left px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 rounded-md cursor-pointer mb-1"
            onClick={() => {
              if (!themeConfig) {
                onThemeChange(null);
              } else {
                const next = { ...themeConfig };
                delete (next as any)[colorKey];
                const hasAny = Object.values(next).some(v => v);
                onThemeChange(hasAny ? next : null);
              }
              setOpen(false);
            }}
          >
            Automatic
          </button>
          <label className="flex items-center gap-2 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 rounded-md cursor-pointer">
            <span className="w-4 h-4 rounded border border-gray-300 flex-shrink-0" style={{ backgroundColor: display }} />
            Custom color…
            <input
              type="color"
              className="sr-only"
              value={display}
              onChange={e => {
                onThemeChange({ ...ensureTheme(), [colorKey]: e.target.value });
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}

export default function LayoutTab({ themeConfig, onThemeChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2">
      <ColorSwatch
        label="Body"
        colorKey="backgroundColor"
        displayDefault={DEFAULTS.backgroundColor}
        themeConfig={themeConfig}
        onThemeChange={onThemeChange}
      />
      <ColorSwatch
        label="Text"
        colorKey="textColor"
        displayDefault={DEFAULTS.textColor}
        themeConfig={themeConfig}
        onThemeChange={onThemeChange}
      />
      <ColorSwatch
        label="Link"
        colorKey="linkColor"
        displayDefault={DEFAULTS.linkColor}
        themeConfig={themeConfig}
        onThemeChange={onThemeChange}
      />
      <ColorSwatch
        label="Button"
        colorKey="buttonColor"
        displayDefault={DEFAULTS.buttonColor}
        themeConfig={themeConfig}
        onThemeChange={onThemeChange}
      />

      <div className="w-px h-7 bg-gray-200" />

      <button
        type="button"
        onClick={() => onThemeChange(null)}
        className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors cursor-pointer"
        title="Reset theme to defaults"
        aria-label="Reset theme"
      >
        <RotateCcw size={12} /> Reset
      </button>
    </div>
  );
}
