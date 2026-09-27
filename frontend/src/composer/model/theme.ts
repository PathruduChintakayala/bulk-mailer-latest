/** Theme tokens (spec 18.1) plus the built-in theme set. */

export interface HeadingSizes {
  h1: number;
  h2: number;
  h3: number;
  h4: number;
  h5: number;
  h6: number;
}

export interface BrandAssets {
  primaryLogo?: string | null;
  secondaryLogo?: string | null;
  darkLogo?: string | null;
  organizationName?: string | null;
  organizationAddress?: string | null;
  standardLegalText?: string | null;
  defaultFooterHtml?: string | null;
  defaultHeaderHtml?: string | null;
  socialLinks?: { network: string; url: string; label: string }[];
}

export interface ThemeTokens {
  pageBackground: string;
  contentBackground: string;
  primaryColor: string;
  secondaryColor: string;
  headingColor: string;
  bodyTextColor: string;
  mutedTextColor: string;
  linkColor: string;
  buttonBackground: string;
  buttonTextColor: string;
  dividerColor: string;
  bodyFont: string;
  headingFont: string;
  bodyFontSize: number;
  headingSizes: HeadingSizes;
  lineHeight: number;
  contentWidth: number;
  sectionPaddingY: number;
  sectionPaddingX: number;
  buttonRadius: number;
  borderStyle: 'none' | 'solid' | 'dashed' | 'dotted' | 'double';
  brand?: BrandAssets;
}

export interface ThemeRecord {
  public_code: string;
  name: string;
  description: string | null;
  tokens: ThemeTokens;
  is_builtin: boolean;
  is_org_default: boolean;
  is_locked: boolean;
  archived_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Email-safe stacks. Administrators may narrow this list. */
export const EMAIL_SAFE_FONTS: { label: string; stack: string }[] = [
  { label: 'Arial', stack: "Arial, Helvetica, sans-serif" },
  { label: 'Helvetica', stack: "Helvetica, Arial, sans-serif" },
  { label: 'Verdana', stack: "Verdana, Geneva, sans-serif" },
  { label: 'Tahoma', stack: "Tahoma, Verdana, sans-serif" },
  { label: 'Trebuchet MS', stack: "'Trebuchet MS', Tahoma, sans-serif" },
  { label: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
  { label: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
  { label: 'Courier New', stack: "'Courier New', Courier, monospace" },
  { label: 'Lucida Sans', stack: "'Lucida Sans Unicode', 'Lucida Grande', sans-serif" },
  { label: 'Palatino', stack: "'Palatino Linotype', 'Book Antiqua', Palatino, serif" },
  { label: 'System UI', stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" },
];

export const DEFAULT_HEADING_SIZES: HeadingSizes = {
  h1: 32,
  h2: 26,
  h3: 22,
  h4: 19,
  h5: 17,
  h6: 15,
};

export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  pageBackground: '#f4f5f7',
  contentBackground: '#ffffff',
  primaryColor: '#4f46e5',
  secondaryColor: '#6366f1',
  headingColor: '#111827',
  bodyTextColor: '#374151',
  mutedTextColor: '#6b7280',
  linkColor: '#4f46e5',
  buttonBackground: '#4f46e5',
  buttonTextColor: '#ffffff',
  dividerColor: '#e5e7eb',
  bodyFont: "Arial, Helvetica, sans-serif",
  headingFont: "Arial, Helvetica, sans-serif",
  bodyFontSize: 16,
  headingSizes: { ...DEFAULT_HEADING_SIZES },
  lineHeight: 1.5,
  contentWidth: 640,
  sectionPaddingY: 24,
  sectionPaddingX: 24,
  buttonRadius: 6,
  borderStyle: 'solid',
  brand: {},
};

export const BUILTIN_THEMES: { code: string; name: string; description: string; tokens: ThemeTokens }[] = [
  {
    code: 'THM-BASE',
    name: 'Default',
    description: 'Neutral, high-contrast starting point.',
    tokens: { ...DEFAULT_THEME_TOKENS },
  },
  {
    code: 'THM-CLASSIC',
    name: 'Classic serif',
    description: 'Serif headings on a warm paper background.',
    tokens: {
      ...DEFAULT_THEME_TOKENS,
      pageBackground: '#f5f1ea',
      contentBackground: '#fffdf9',
      primaryColor: '#8a5a2b',
      secondaryColor: '#a97142',
      headingColor: '#3b2a1a',
      bodyTextColor: '#40372c',
      mutedTextColor: '#7a6a58',
      linkColor: '#8a5a2b',
      buttonBackground: '#8a5a2b',
      dividerColor: '#e4dacb',
      headingFont: "Georgia, 'Times New Roman', serif",
      buttonRadius: 2,
    },
  },
  {
    code: 'THM-CONTRAST',
    name: 'High contrast',
    description: 'Maximum legibility for accessibility-first sends.',
    tokens: {
      ...DEFAULT_THEME_TOKENS,
      pageBackground: '#ffffff',
      contentBackground: '#ffffff',
      primaryColor: '#0b3d91',
      secondaryColor: '#12509c',
      headingColor: '#000000',
      bodyTextColor: '#1a1a1a',
      mutedTextColor: '#4a4a4a',
      linkColor: '#0b3d91',
      buttonBackground: '#0b3d91',
      dividerColor: '#c9c9c9',
      bodyFontSize: 17,
      lineHeight: 1.6,
      buttonRadius: 4,
    },
  },
  {
    code: 'THM-COMPACT',
    name: 'Compact transactional',
    description: 'Tight spacing for receipts and notifications.',
    tokens: {
      ...DEFAULT_THEME_TOKENS,
      pageBackground: '#eceff3',
      contentBackground: '#ffffff',
      primaryColor: '#1f6feb',
      secondaryColor: '#3b82f6',
      headingColor: '#0f172a',
      bodyTextColor: '#33415c',
      linkColor: '#1f6feb',
      buttonBackground: '#1f6feb',
      bodyFontSize: 15,
      sectionPaddingY: 16,
      sectionPaddingX: 20,
      contentWidth: 600,
      headingSizes: { h1: 26, h2: 22, h3: 19, h4: 17, h5: 15, h6: 14 },
    },
  },
];

export function resolveTokens(
  base: ThemeTokens | null | undefined,
  overrides?: Record<string, unknown> | null
): ThemeTokens {
  const tokens: ThemeTokens = { ...DEFAULT_THEME_TOKENS, ...(base || {}) };
  tokens.headingSizes = { ...DEFAULT_HEADING_SIZES, ...(base?.headingSizes || {}) };
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null || value === undefined) continue;
      if (key === 'headingSizes' && typeof value === 'object') {
        tokens.headingSizes = { ...tokens.headingSizes, ...(value as Partial<HeadingSizes>) };
      } else {
        (tokens as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }
  return tokens;
}

export function headingSizeFor(tokens: ThemeTokens, level: number): number {
  const key = `h${Math.min(6, Math.max(1, level))}` as keyof HeadingSizes;
  return tokens.headingSizes[key] ?? DEFAULT_HEADING_SIZES[key];
}
