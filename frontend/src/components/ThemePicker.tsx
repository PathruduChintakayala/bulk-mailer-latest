import type { ThemeConfig } from '../types';

const PRESET_THEMES: Array<{ name: string; config: ThemeConfig }> = [
  {
    name: 'Indigo Professional',
    config: { primaryColor: '#4f46e5', secondaryColor: '#818cf8', accentColor: '#c7d2fe', backgroundColor: '#ffffff', textColor: '#1f2937', headingColor: '#111827', linkColor: '#4f46e5', buttonColor: '#4f46e5', buttonTextColor: '#ffffff' },
  },
  {
    name: 'Ocean Blue',
    config: { primaryColor: '#0284c7', secondaryColor: '#38bdf8', accentColor: '#bae6fd', backgroundColor: '#f0f9ff', textColor: '#0c4a6e', headingColor: '#075985', linkColor: '#0284c7', buttonColor: '#0284c7', buttonTextColor: '#ffffff' },
  },
  {
    name: 'Forest Green',
    config: { primaryColor: '#059669', secondaryColor: '#34d399', accentColor: '#a7f3d0', backgroundColor: '#f0fdf4', textColor: '#064e3b', headingColor: '#065f46', linkColor: '#059669', buttonColor: '#059669', buttonTextColor: '#ffffff' },
  },
  {
    name: 'Sunset Orange',
    config: { primaryColor: '#ea580c', secondaryColor: '#fb923c', accentColor: '#fed7aa', backgroundColor: '#fff7ed', textColor: '#7c2d12', headingColor: '#9a3412', linkColor: '#ea580c', buttonColor: '#ea580c', buttonTextColor: '#ffffff' },
  },
  {
    name: 'Royal Purple',
    config: { primaryColor: '#7c3aed', secondaryColor: '#a78bfa', accentColor: '#ddd6fe', backgroundColor: '#faf5ff', textColor: '#3b0764', headingColor: '#5b21b6', linkColor: '#7c3aed', buttonColor: '#7c3aed', buttonTextColor: '#ffffff' },
  },
  {
    name: 'Rose Pink',
    config: { primaryColor: '#e11d48', secondaryColor: '#fb7185', accentColor: '#fecdd3', backgroundColor: '#fff1f2', textColor: '#881337', headingColor: '#9f1239', linkColor: '#e11d48', buttonColor: '#e11d48', buttonTextColor: '#ffffff' },
  },
  {
    name: 'Slate Modern',
    config: { primaryColor: '#475569', secondaryColor: '#94a3b8', accentColor: '#e2e8f0', backgroundColor: '#f8fafc', textColor: '#334155', headingColor: '#1e293b', linkColor: '#475569', buttonColor: '#1e293b', buttonTextColor: '#ffffff' },
  },
  {
    name: 'Teal Fresh',
    config: { primaryColor: '#0d9488', secondaryColor: '#2dd4bf', accentColor: '#99f6e4', backgroundColor: '#f0fdfa', textColor: '#134e4a', headingColor: '#115e59', linkColor: '#0d9488', buttonColor: '#0d9488', buttonTextColor: '#ffffff' },
  },
  {
    name: 'Amber Warm',
    config: { primaryColor: '#d97706', secondaryColor: '#fbbf24', accentColor: '#fde68a', backgroundColor: '#fffbeb', textColor: '#78350f', headingColor: '#92400e', linkColor: '#d97706', buttonColor: '#d97706', buttonTextColor: '#ffffff' },
  },
  {
    name: 'Dark Elegance',
    config: { primaryColor: '#f59e0b', secondaryColor: '#fbbf24', accentColor: '#292524', backgroundColor: '#1c1917', textColor: '#e7e5e4', headingColor: '#fafaf9', linkColor: '#f59e0b', buttonColor: '#f59e0b', buttonTextColor: '#1c1917' },
  },
];

interface Props {
  value: ThemeConfig | null;
  onChange: (theme: ThemeConfig | null) => void;
}

export default function ThemePicker({ value, onChange }: Props) {
  return (
    <div className="relative group">
      <button className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
        <div className="flex gap-1">
          {value ? (
            <>
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: value.primaryColor }} />
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: value.secondaryColor }} />
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: value.accentColor }} />
            </>
          ) : (
            <div className="w-3 h-3 rounded-full bg-gray-300" />
          )}
        </div>
        Theme
      </button>

      <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-3 hidden group-hover:block z-50">
        <div className="text-xs font-medium text-gray-500 mb-2">Color Themes</div>
        <button
          onClick={() => onChange(null)}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-50 ${!value ? 'bg-gray-100' : ''}`}
        >
          No Theme (Default)
        </button>
        <div className="space-y-1 mt-1 max-h-64 overflow-y-auto">
          {PRESET_THEMES.map((theme) => (
            <button
              key={theme.name}
              onClick={() => onChange(theme.config)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-3 ${
                value?.primaryColor === theme.config.primaryColor ? 'bg-brand-50 ring-1 ring-brand-200' : ''
              }`}
            >
              <div className="flex gap-1 flex-shrink-0">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.config.primaryColor }} />
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.config.secondaryColor }} />
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.config.backgroundColor }} />
              </div>
              <span>{theme.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
