/**
 * Smart paste pipeline (spec 5.5).
 *
 * Pasted content is reduced to constructs email clients render reliably: scripts
 * and event handlers are removed, unsupported layout CSS is dropped, fonts are
 * normalized to the email-safe set and structural elements are converted to
 * their nearest supported equivalent. The author is told what changed.
 */

import DOMPurify from 'dompurify';
import { EMAIL_SAFE_FONTS } from '../model/theme';

export interface PasteResult {
  html: string;
  /** Plain-language notes describing what was changed, for a transient notice. */
  notes: string[];
}

const ALLOWED_TAGS = [
  'p', 'br', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'sub', 'sup', 'code',
  'a', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'img', 'hr', 'div', 'pre',
];

const ALLOWED_ATTRS = ['href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height', 'colspan', 'rowspan', 'style', 'align'];

/** Declarations email clients handle poorly; kept out of pasted content. */
const DISALLOWED_PROPERTIES = [
  'position', 'float', 'z-index', 'transform', 'transition', 'animation', 'filter',
  'flex', 'flex-direction', 'flex-wrap', 'grid', 'grid-template-columns', 'grid-template-rows',
  'display', 'box-shadow', 'clip-path', 'backdrop-filter', 'overflow', 'inset',
  'top', 'right', 'bottom', 'left', 'max-height', 'min-height', 'writing-mode',
];

const KEEP_PROPERTIES = [
  'color', 'background-color', 'font-weight', 'font-style', 'font-size', 'font-family',
  'text-align', 'text-decoration', 'text-transform', 'line-height', 'letter-spacing',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-radius', 'border-collapse', 'width', 'vertical-align',
];

const SAFE_FONT_STACKS = EMAIL_SAFE_FONTS.map(font => font.stack.toLowerCase());

/** Map a pasted font family onto the closest email-safe stack. */
function normalizeFontFamily(value: string): string | null {
  const lowered = value.toLowerCase().replace(/["']/g, '');
  const exact = SAFE_FONT_STACKS.find(stack => stack.replace(/["']/g, '') === lowered);
  if (exact) return EMAIL_SAFE_FONTS[SAFE_FONT_STACKS.indexOf(exact)].stack;
  const first = lowered.split(',')[0].trim();
  const named = EMAIL_SAFE_FONTS.find(font => font.label.toLowerCase() === first);
  if (named) return named.stack;
  if (/mono|courier|consolas|menlo/.test(lowered)) return "'Courier New', Courier, monospace";
  if (/serif|georgia|times|garamond|cambria/.test(lowered)) return "Georgia, 'Times New Roman', serif";
  if (first) return 'Arial, Helvetica, sans-serif';
  return null;
}

function filterStyle(raw: string, notes: Set<string>): string {
  const kept: string[] = [];
  for (const declaration of raw.split(';')) {
    const [rawProperty, ...rest] = declaration.split(':');
    if (!rawProperty || !rest.length) continue;
    const property = rawProperty.trim().toLowerCase();
    let value = rest.join(':').trim();
    if (!property || !value) continue;

    if (DISALLOWED_PROPERTIES.includes(property)) {
      notes.add('Removed layout styles that email clients do not support.');
      continue;
    }
    if (!KEEP_PROPERTIES.includes(property)) {
      notes.add('Removed styles that are not supported in email.');
      continue;
    }
    if (/url\s*\(/i.test(value) && !/^url\(['"]?https:/i.test(value)) {
      notes.add('Removed a background image that was not loaded over HTTPS.');
      continue;
    }
    if (/expression\s*\(|javascript:/i.test(value)) {
      notes.add('Removed an unsafe style value.');
      continue;
    }
    if (property === 'font-family') {
      const normalized = normalizeFontFamily(value);
      if (!normalized) continue;
      if (normalized.toLowerCase() !== value.toLowerCase().replace(/["']/g, '')) {
        notes.add('Replaced fonts with email-safe equivalents.');
      }
      value = normalized;
    }
    if (property === 'font-size') {
      const size = parseFloat(value);
      if (Number.isFinite(size)) {
        if (/pt$/i.test(value)) value = `${Math.round(size * 1.333)}px`;
        else if (/r?em$/i.test(value)) value = `${Math.round(size * 16)}px`;
        else if (/%$/.test(value)) value = `${Math.round((size / 100) * 16)}px`;
      }
    }
    kept.push(`${property}:${value}`);
  }
  return kept.join(';');
}

export function sanitizePaste(input: string, options: { plainTextFallback?: string } = {}): PasteResult {
  const notes = new Set<string>();
  const source = String(input || '');

  if (/<(script|iframe|object|embed|form|input|button|select|textarea|link|meta|style)\b/i.test(source)) {
    notes.add('Removed scripts, forms and embedded content.');
  }
  if (/\son[a-z]+\s*=/i.test(source)) {
    notes.add('Removed event handlers.');
  }
  if (/\bclass\s*=|\bid\s*=/i.test(source)) {
    notes.add('Removed class and id attributes, which some clients strip.');
  }

  const clean = DOMPurify.sanitize(source, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRS,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'link', 'meta', 'svg', 'math'],
    FORBID_ATTR: ['class', 'id', 'onerror', 'onload', 'onclick'],
    ALLOW_DATA_ATTR: false,
    RETURN_DOM_FRAGMENT: false,
  });

  if (typeof document === 'undefined') {
    return { html: clean, notes: [...notes] };
  }

  const container = document.createElement('div');
  container.innerHTML = clean;

  // Word and Google Docs wrappers add noise that breaks inline layout.
  container.querySelectorAll('o\\:p, w\\:sdt, [style*="mso-"]').forEach(node => {
    if (node.tagName.toLowerCase().includes(':')) node.remove();
  });

  container.querySelectorAll('*').forEach(node => {
    const element = node as HTMLElement;

    const style = element.getAttribute('style');
    if (style) {
      const filtered = filterStyle(style, notes);
      if (filtered) element.setAttribute('style', filtered);
      else element.removeAttribute('style');
    }

    if (element.tagName === 'A') {
      const href = element.getAttribute('href') || '';
      const lowered = href.trim().toLowerCase();
      if (lowered.startsWith('javascript:') || lowered.startsWith('vbscript:') || lowered.startsWith('data:')) {
        element.removeAttribute('href');
        notes.add('Removed an unsafe link.');
      } else if (href) {
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
      }
    }

    if (element.tagName === 'IMG') {
      const src = element.getAttribute('src') || '';
      if (src.startsWith('data:') && src.length > 40000) {
        element.remove();
        notes.add('Removed a large embedded image. Upload it to the asset library instead.');
        return;
      }
      if (src.toLowerCase().startsWith('http://')) {
        notes.add('An image is loaded over plain HTTP and may be blocked.');
      }
      if (!element.getAttribute('alt')) element.setAttribute('alt', '');
    }

    // Unsupported structural elements become their nearest supported equivalent.
    if (element.tagName === 'PRE') {
      const replacement = document.createElement('p');
      replacement.setAttribute('style', "font-family:'Courier New', Courier, monospace");
      replacement.textContent = element.textContent || '';
      element.replaceWith(replacement);
      notes.add('Converted preformatted text to a paragraph.');
      return;
    }
    if (element.tagName === 'DIV') {
      const replacement = document.createElement('p');
      const inlineStyle = element.getAttribute('style');
      if (inlineStyle) replacement.setAttribute('style', inlineStyle);
      replacement.innerHTML = element.innerHTML;
      element.replaceWith(replacement);
      return;
    }
    if (element.tagName === 'STRIKE') {
      const replacement = document.createElement('s');
      replacement.innerHTML = element.innerHTML;
      element.replaceWith(replacement);
    }
  });

  // Empty paragraphs left behind by editors add stray vertical space.
  let removedEmpty = 0;
  container.querySelectorAll('p').forEach(node => {
    if (!node.textContent?.trim() && !node.querySelector('img, br')) {
      node.remove();
      removedEmpty += 1;
    }
  });
  if (removedEmpty > 2) notes.add('Removed excessive blank paragraphs.');

  let html = container.innerHTML.trim();
  if (!html && options.plainTextFallback) {
    html = options.plainTextFallback
      .split(/\n{2,}/)
      .map(part => `<p>${part.replace(/\n/g, '<br>').replace(/</g, '&lt;')}</p>`)
      .join('');
    notes.add('Pasted as plain text because no supported formatting was found.');
  }

  return { html, notes: [...notes] };
}

/** Strip all formatting, keeping line structure. Used by "Paste as plain text". */
export function pasteAsPlainText(input: string): string {
  const text = String(input || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  return text
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => `<p>${part.replace(/\n/g, '<br>')}</p>`)
    .join('');
}
