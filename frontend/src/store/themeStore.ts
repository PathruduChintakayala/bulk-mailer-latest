import { create } from 'zustand';
import api from '../services/api';
import { assetUrl } from '../constants/assets';

export interface PaletteColors {
  50: string; 100: string; 200: string; 300: string; 400: string;
  500: string; 600: string; 700: string; 800: string; 900: string; 950: string;
  rgb500: string;
  /** Second colour scale; violet when a palette does not define its own. */
  accent?: ShadeScale;
  /** Small highlight colour; amber when a palette does not define its own. */
  highlight?: string;
}

export type ShadeScale = Record<typeof SHADES[number], string>;

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;

const DEFAULT_ACCENT: ShadeScale = {
  50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6',
  600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95', 950: '#2e1065',
};
const DEFAULT_HIGHLIGHT = '#f59e0b';

export const DEFAULT_APP_NAME = 'BulkMailer';
export const DEFAULT_PALETTE = 'ysrcp';
export const DEFAULT_LOGO_URL = '/brand/logo.png';
export const DEFAULT_ICON_URL = '/brand/icon.png';
export const DEFAULT_FAVICON_URL = '/brand/favicon.png';

export interface ThemePalette {
  name: string;
  label: string;
  colors: PaletteColors;
}

export const PALETTES: ThemePalette[] = [
  {
    // Colours of the logo: blue and green lettering, orange signature, navy portrait.
    name: 'ysrcp', label: 'YSRCP',
    colors: {
      50: '#eef5fc', 100: '#d8e8f8', 200: '#b0d0f0', 300: '#7bafe3', 400: '#3f86d0', 500: '#1463b8',
      600: '#034ea2', 700: '#044187', 800: '#06376b', 900: '#062f4d', 950: '#032b3c', rgb500: '20, 99, 184',
      accent: {
        50: '#ecf8f1', 100: '#d0eedd', 200: '#a3dcbc', 300: '#6cc595', 400: '#33a96b', 500: '#00994b',
        600: '#008c45', 700: '#007038', 800: '#00592d', 900: '#004725', 950: '#002914',
      },
      highlight: '#f87c1c',
    },
  },
  {
    name: 'indigo', label: 'Indigo',
    colors: { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81', 950: '#1e1b4b', rgb500: '99, 102, 241' },
  },
  {
    name: 'blue', label: 'Blue',
    colors: { 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a', 950: '#172554', rgb500: '59, 130, 246' },
  },
  {
    name: 'violet', label: 'Violet',
    colors: { 50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95', 950: '#2e1065', rgb500: '139, 92, 246' },
  },
  {
    name: 'emerald', label: 'Emerald',
    colors: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b', 950: '#022c22', rgb500: '16, 185, 129' },
  },
  {
    name: 'rose', label: 'Rose',
    colors: { 50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337', 950: '#4c0519', rgb500: '244, 63, 94' },
  },
  {
    name: 'amber', label: 'Amber',
    colors: { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f', 950: '#451a03', rgb500: '245, 158, 11' },
  },
  {
    name: 'teal', label: 'Teal',
    colors: { 50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a', 950: '#042f2e', rgb500: '20, 184, 166' },
  },
  {
    name: 'slate', label: 'Slate',
    colors: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a', 950: '#020617', rgb500: '100, 116, 139' },
  },
];

function clamp(n: number, min = 0, max = 255) {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  return {
    r: parseInt(cleaned.slice(0, 2), 16),
    g: parseInt(cleaned.slice(2, 4), 16),
    b: parseInt(cleaned.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Derive a Tailwind-like shade scale from a primary (≈500) hex. */
export function generatePaletteFromPrimary(hex: string): PaletteColors {
  const rgb = hexToRgb(hex) || { r: 99, g: 102, b: 241 };
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 15, g: 23, b: 42 };

  const shade = (towardWhite: number, towardBlack: number) => {
    const base = towardWhite > 0
      ? {
          r: mix(rgb.r, white.r, towardWhite),
          g: mix(rgb.g, white.g, towardWhite),
          b: mix(rgb.b, white.b, towardWhite),
        }
      : {
          r: mix(rgb.r, black.r, towardBlack),
          g: mix(rgb.g, black.g, towardBlack),
          b: mix(rgb.b, black.b, towardBlack),
        };
    return rgbToHex(base.r, base.g, base.b);
  };

  return {
    50: shade(0.92, 0),
    100: shade(0.84, 0),
    200: shade(0.68, 0),
    300: shade(0.48, 0),
    400: shade(0.24, 0),
    500: rgbToHex(rgb.r, rgb.g, rgb.b),
    600: shade(0, 0.18),
    700: shade(0, 0.34),
    800: shade(0, 0.48),
    900: shade(0, 0.62),
    950: shade(0, 0.78),
    rgb500: `${rgb.r}, ${rgb.g}, ${rgb.b}`,
  };
}

function getPalette(name: string, customPrimary?: string | null): PaletteColors {
  if (name === 'custom' && customPrimary) {
    return generatePaletteFromPrimary(customPrimary);
  }
  return PALETTES.find(p => p.name === name)?.colors ?? PALETTES[0].colors;
}

export function applyPaletteToDOM(colors: PaletteColors) {
  const root = document.documentElement;
  const accent = colors.accent ?? DEFAULT_ACCENT;
  SHADES.forEach(shade => {
    root.style.setProperty(`--brand-${shade}`, colors[shade]);
    root.style.setProperty(`--accent-${shade}`, accent[shade]);
  });
  root.style.setProperty('--brand-rgb-500', colors.rgb500);
  root.style.setProperty('--brand-highlight', colors.highlight ?? DEFAULT_HIGHLIGHT);
}

function applyFavicon(url: string) {
  const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']") || document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/png';
  link.href = assetUrl(url);
  if (!link.parentNode) document.head.appendChild(link);
}

interface ThemeState {
  appName: string;
  /** Wide logo, shown where there is room for the wordmark. */
  logoUrl: string;
  /** Square mark, shown in tight spots such as the collapsed sidebar. */
  iconUrl: string;
  faviconUrl: string;
  timezone: string;
  paletteName: string;
  customPrimary: string;
  loaded: boolean;
  loadSettings: () => Promise<void>;
  setPalette: (name: string, customPrimary?: string) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  appName: DEFAULT_APP_NAME,
  logoUrl: DEFAULT_LOGO_URL,
  iconUrl: DEFAULT_ICON_URL,
  faviconUrl: DEFAULT_FAVICON_URL,
  timezone: 'UTC',
  paletteName: DEFAULT_PALETTE,
  customPrimary: '#034ea2',
  loaded: false,

  loadSettings: async () => {
    try {
      const res = await api.get('/settings/general');
      const data = res.data;
      const paletteName = data.theme_palette || DEFAULT_PALETTE;
      const customPrimary = data.theme_custom_primary || '#034ea2';
      const colors = getPalette(paletteName, customPrimary);
      applyPaletteToDOM(colors);

      const appName = data.app_name || DEFAULT_APP_NAME;
      const faviconUrl = data.favicon_url || DEFAULT_FAVICON_URL;
      set({
        appName,
        logoUrl: data.logo_url || DEFAULT_LOGO_URL,
        // An uploaded favicon doubles as the square mark
        iconUrl: data.favicon_url || DEFAULT_ICON_URL,
        faviconUrl,
        timezone: data.timezone || 'UTC',
        paletteName,
        customPrimary,
        loaded: true,
      });

      document.title = appName;
      applyFavicon(faviconUrl);
    } catch {
      set({ loaded: true });
    }
  },

  setPalette: (name: string, customPrimary?: string) => {
    set(state => {
      const primary = customPrimary ?? state.customPrimary;
      const colors = getPalette(name, primary);
      applyPaletteToDOM(colors);
      return {
        paletteName: name,
        ...(customPrimary ? { customPrimary } : {}),
      };
    });
  },
}));
