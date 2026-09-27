/**
 * Style derivation for the visual canvas.
 *
 * These helpers mirror backend/app/services/composer/compiler.py so the canvas
 * and the compiled email agree. The compiler stays authoritative; this exists so
 * the author sees an accurate rendering while typing.
 */

import type { CSSProperties } from 'react';
import type {
  Align,
  Background,
  Border,
  LinkSpec,
  Spacing,
  TextStyle,
  Visibility,
} from '../model/document';
import { headingSizeFor, type ThemeTokens } from '../model/theme';

export const SYSTEM_LINK_TOKENS: Record<string, string> = {
  unsubscribe: '{{unsubscribe_url}}',
  preferences: '{{preferences_url}}',
  view_in_browser: '{{view_in_browser_url}}',
};

export function px(value: number | null | undefined): string {
  const number = Number(value) || 0;
  return `${Number.isInteger(number) ? number : Number(number.toFixed(2))}px`;
}

export function spacingCss(spacing: Spacing): string {
  return [spacing.top, spacing.right, spacing.bottom, spacing.left].map(px).join(' ');
}

export function hasSpacing(spacing: Spacing): boolean {
  return !!(spacing.top || spacing.right || spacing.bottom || spacing.left);
}

export function backgroundCss(background: Background, inheritColor?: string): CSSProperties {
  const mode = background?.mode || 'inherit';
  if (mode === 'inherit') return inheritColor ? { backgroundColor: inheritColor } : {};
  if (mode === 'transparent') return { backgroundColor: 'transparent' };
  if (mode === 'color') {
    const color = background.color || inheritColor;
    return color ? { backgroundColor: color } : {};
  }
  const out: CSSProperties = {};
  const fallback = background.fallbackColor || background.color || inheritColor;
  if (fallback) out.backgroundColor = fallback;
  if (background.imageUrl && isSafeUrl(background.imageUrl)) {
    out.backgroundImage = `url('${background.imageUrl}')`;
    out.backgroundPosition = background.imagePosition || 'center center';
    out.backgroundRepeat = background.imageRepeat || 'no-repeat';
    out.backgroundSize = background.imageSize || 'cover';
  }
  return out;
}

export function borderCss(border: Border): CSSProperties {
  if (!border || border.style === 'none') {
    return border?.radius ? { borderRadius: px(border.radius) } : {};
  }
  const color = border.color || '#e5e7eb';
  const out: CSSProperties = {};
  if (border.width.top) out.borderTop = `${px(border.width.top)} ${border.style} ${color}`;
  if (border.width.right) out.borderRight = `${px(border.width.right)} ${border.style} ${color}`;
  if (border.width.bottom) out.borderBottom = `${px(border.width.bottom)} ${border.style} ${color}`;
  if (border.width.left) out.borderLeft = `${px(border.width.left)} ${border.style} ${color}`;
  if (border.radius) out.borderRadius = px(border.radius);
  return out;
}

export function textCss(
  style: TextStyle | null | undefined,
  tokens: ThemeTokens,
  options: { kind?: 'body' | 'heading' | 'muted'; level?: number } = {}
): CSSProperties {
  const kind = options.kind || 'body';
  const level = options.level || 2;
  const source = style || {};

  let family: string;
  let size: number;
  let color: string;
  let weight: number | undefined;

  if (kind === 'heading') {
    family = source.fontFamily || tokens.headingFont;
    size = source.fontSize || headingSizeFor(tokens, level);
    color = source.color || tokens.headingColor;
    weight = source.fontWeight || 700;
  } else if (kind === 'muted') {
    family = source.fontFamily || tokens.bodyFont;
    size = source.fontSize || Math.max(12, tokens.bodyFontSize - 3);
    color = source.color || tokens.mutedTextColor;
    weight = source.fontWeight || undefined;
  } else {
    family = source.fontFamily || tokens.bodyFont;
    size = source.fontSize || tokens.bodyFontSize;
    color = source.color || tokens.bodyTextColor;
    weight = source.fontWeight || undefined;
  }

  const css: CSSProperties = {
    fontFamily: family,
    fontSize: px(size),
    color,
    lineHeight: String(source.lineHeight || tokens.lineHeight),
  };
  if (weight) css.fontWeight = weight;
  if (source.letterSpacing) css.letterSpacing = px(source.letterSpacing);
  if (source.textTransform && source.textTransform !== 'none') css.textTransform = source.textTransform;
  if (source.align) css.textAlign = source.align;
  if (source.direction) css.direction = source.direction;
  return css;
}

/** Frontend mirror of the backend URL allowlist. Backend remains authoritative. */
export function isSafeUrl(url: string): boolean {
  const value = String(url || '').trim();
  if (!value) return false;
  if (/[\u0000-\u001f]/.test(value)) return false;
  const lowered = value.toLowerCase().replace(/\s+/g, '');
  if (lowered.startsWith('javascript:') || lowered.startsWith('vbscript:') || lowered.startsWith('file:')) return false;
  if (lowered.startsWith('data:')) return lowered.startsWith('data:image/');
  if (value.startsWith('{{') || value.startsWith('#') || value.startsWith('/')) return true;
  return /^(https?:|mailto:|tel:)/i.test(value);
}

export function linkHref(link: LinkSpec | null | undefined): string {
  if (!link) return '';
  const value = (link.value || '').trim();
  if (link.type in SYSTEM_LINK_TOKENS) return SYSTEM_LINK_TOKENS[link.type];
  if (link.type === 'email') return value ? `mailto:${value}` : '';
  if (link.type === 'tel') return value ? `tel:${value.replace(/[^0-9+]/g, '')}` : '';
  if (!value) return '';
  if (!isSafeUrl(value)) return '';
  return value;
}

/** Human-readable description of a link for inspector summaries and warnings. */
export function describeLink(link: LinkSpec | null | undefined): string {
  if (!link) return 'No link';
  switch (link.type) {
    case 'unsubscribe':
      return 'Unsubscribe link';
    case 'preferences':
      return 'Preference centre link';
    case 'view_in_browser':
      return 'View in browser link';
    case 'email':
      return link.value ? `Email ${link.value}` : 'Email address not set';
    case 'tel':
      return link.value ? `Call ${link.value}` : 'Phone number not set';
    case 'merge':
      return link.value ? `Merge field ${link.value}` : 'Merge field not set';
    default:
      return link.value || 'URL not set';
  }
}

export function linkWarning(link: LinkSpec | null | undefined): string | null {
  if (!link) return null;
  if (link.type in SYSTEM_LINK_TOKENS) return null;
  const value = (link.value || '').trim();
  if (!value) return 'This link has no destination yet.';
  if (link.type === 'email') return value.includes('@') ? null : 'That does not look like an email address.';
  if (link.type === 'tel') return /\d/.test(value) ? null : 'That does not look like a phone number.';
  if (link.type === 'merge') return /\{\{/.test(value) ? null : 'Merge links should contain a {{field}} expression.';
  if (value !== link.value) return 'The URL has leading or trailing spaces.';
  if (!isSafeUrl(value)) return 'This protocol is not allowed in email links.';
  if (value.toLowerCase().startsWith('http://')) return 'Use https:// so the link is not flagged as insecure.';
  return null;
}

export function mergeExpression(key: string, fallback?: string | null, format?: string | null): string {
  if (!key) return '';
  let expression = key;
  if (fallback) expression += ` | default: "${fallback.replace(/"/g, '\\"')}"`;
  if (format) expression += ` | format: ${format}`;
  return `{{ ${expression} }}`;
}

/** Canvas-only visibility hints; the compiled email uses classes and media queries. */
export function visibilityStyle(visibility: Visibility, surface: 'desktop' | 'mobile'): CSSProperties {
  const visible = surface === 'desktop' ? visibility.desktop : visibility.mobile;
  return visible ? {} : { opacity: 0.35 };
}

export function alignToFlex(align: Align): CSSProperties['justifyContent'] {
  if (align === 'center') return 'center';
  if (align === 'right') return 'flex-end';
  return 'flex-start';
}

export function alignToMargin(align: Align): CSSProperties {
  if (align === 'center') return { marginLeft: 'auto', marginRight: 'auto' };
  if (align === 'right') return { marginLeft: 'auto' };
  return {};
}

/**
 * Highlight merge tokens so authors can see personalization at a glance.
 * Applied to a copy of the HTML for display only; the stored value is untouched.
 */
export function decorateMergeTokens(html: string): string {
  return String(html || '').replace(
    /\{\{\s*([A-Za-z_]\w*)\s*((?:\|[^}]*)?)\}\}/g,
    (_match, key: string, filters: string) => {
      const hasDefault = /\|\s*default\s*:/.test(filters);
      const tone = hasDefault ? '#eef2ff;color:#4338ca' : '#fef3c7;color:#92400e';
      const label = String(key).replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
      return (
        `<span class="cn-merge-chip" data-field="${key}" contenteditable="false" ` +
        `style="background:${tone};border-radius:4px;padding:0 4px;font-weight:600;white-space:nowrap">` +
        `${label}</span>`
      );
    }
  );
}
