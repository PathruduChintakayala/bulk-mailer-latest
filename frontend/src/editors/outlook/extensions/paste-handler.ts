import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Extension } from '@tiptap/react';
import DOMPurify from 'dompurify';

/**
 * Email-safe HTML allowlist for paste sanitization.
 * Strips Word/Outlook XML, unsafe CSS, scripts, forms, iframes.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'span', 'div', 'a',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'img', 'hr',
  'sup', 'sub', 'small',
];

const ALLOWED_ATTRS = [
  'href', 'src', 'alt', 'title', 'width', 'height', 'style',
  'class', 'target', 'rel', 'colspan', 'rowspan', 'align', 'valign',
  'border', 'cellpadding', 'cellspacing',
];

/** CSS properties safe for email */
const SAFE_CSS_PROPS = new Set([
  'color', 'background-color', 'background', 'font-size', 'font-family',
  'font-weight', 'font-style', 'text-decoration', 'text-align',
  'line-height', 'letter-spacing', 'margin', 'margin-top', 'margin-bottom',
  'margin-left', 'margin-right', 'padding', 'padding-top', 'padding-bottom',
  'padding-left', 'padding-right', 'border', 'border-top', 'border-bottom',
  'border-left', 'border-right', 'border-radius', 'border-color',
  'border-style', 'border-width', 'width', 'max-width', 'height',
  'display', 'vertical-align', 'list-style-type', 'list-style',
  'white-space', 'word-wrap', 'overflow-wrap',
]);

/**
 * Sanitize pasted HTML for email safety.
 * Removes Word/Outlook XML, scripts, unsafe CSS, absolute positioning.
 */
export function sanitizeHtmlForEmail(html: string): string {
  // Remove Microsoft Word/Outlook conditional comments and XML
  let cleaned = html
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<!\[if[\s\S]*?<!\[endif\]>/gi, '')
    .replace(/<o:p[\s\S]*?<\/o:p>/gi, '')
    .replace(/<xml[\s\S]*?<\/xml>/gi, '')
    .replace(/class="Mso[^"]*"/gi, '')
    .replace(/mso-[^;"']*/gi, '');

  // Use DOMPurify with strict allowlist
  cleaned = DOMPurify.sanitize(cleaned, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRS,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input', 'button', 'select', 'textarea', 'object', 'embed', 'applet'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus'],
  });

  // Clean up inline styles to only allow email-safe properties
  cleaned = cleaned.replace(/style="([^"]*)"/gi, (_match, styleContent: string) => {
    const safeStyles = styleContent
      .split(';')
      .map(s => s.trim())
      .filter(s => {
        const prop = s.split(':')[0]?.trim().toLowerCase();
        if (!prop) return false;
        // Remove position, float, and other layout-breaking properties
        if (prop === 'position' || prop === 'float' || prop === 'z-index') return false;
        return SAFE_CSS_PROPS.has(prop);
      })
      .join('; ');
    return safeStyles ? `style="${safeStyles}"` : '';
  });

  return cleaned;
}

/**
 * TipTap extension that intercepts paste events and sanitizes content.
 */
export const PasteHandler = Extension.create({
  name: 'pasteHandler',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('pasteHandler'),
        props: {
          handlePaste: (_view, event) => {
            const clipboardData = event.clipboardData;
            if (!clipboardData) return false;

            const html = clipboardData.getData('text/html');
            if (!html) return false; // Let TipTap handle plain text

            // Check if it's rich content (not just a plain wrapper)
            const isRichContent = html.includes('<p') || html.includes('<div') ||
              html.includes('<table') || html.includes('<h') ||
              html.includes('mso-') || html.includes('MsoNormal');

            if (!isRichContent) return false; // Let TipTap handle simple pastes

            event.preventDefault();

            // Sanitize the HTML
            const sanitized = sanitizeHtmlForEmail(html);

            // Use TipTap's insertContent which handles parsing
            const editor = (this as any).editor;
            if (editor) {
              editor.chain().focus().insertContent(sanitized, {
                parseOptions: { preserveWhitespace: false },
              }).run();
            }

            return true;
          },
        },
      }),
    ];
  },
});
