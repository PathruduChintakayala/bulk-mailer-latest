/**
 * Merge field as a protected inline node (spec 12.3).
 *
 * Rendering the token as a single atomic chip prevents partial deletion such as
 * turning `{{first_name}}` into `{{first_nam}}`, which would silently break
 * personalization. Serialization always round-trips to the canonical
 * `{{ key | default: "…" | format: … }}` source form.
 */

import { Node, mergeAttributes } from '@tiptap/core';

export interface MergeFieldAttributes {
  field: string;
  fallback: string | null;
  format: string | null;
  label: string | null;
}

export const MERGE_TOKEN_PATTERN = /\{\{\s*([A-Za-z_]\w*)\s*((?:\|[^}]*)?)\}\}/g;

export function humanizeFieldKey(key: string): string {
  return String(key || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
    .trim();
}

export function parseFilters(raw: string): { fallback: string | null; format: string | null } {
  let fallback: string | null = null;
  let format: string | null = null;
  if (!raw) return { fallback, format };
  for (const piece of raw.replace(/^\|/, '').split('|')) {
    const match = piece.match(/^\s*(\w+)\s*(?::\s*([\s\S]*?))?\s*$/);
    if (!match) continue;
    const name = match[1].toLowerCase();
    let argument = (match[2] || '').trim();
    if (argument.length >= 2 && argument[0] === argument[argument.length - 1] && (argument[0] === '"' || argument[0] === "'")) {
      argument = argument.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
    }
    if (name === 'default') fallback = argument;
    else if (name === 'format') format = argument;
  }
  return { fallback, format };
}

export function buildMergeToken(attrs: Partial<MergeFieldAttributes>): string {
  if (!attrs.field) return '';
  let expression = attrs.field;
  if (attrs.fallback) expression += ` | default: "${String(attrs.fallback).replace(/"/g, '\\"')}"`;
  if (attrs.format) expression += ` | format: ${attrs.format}`;
  return `{{ ${expression} }}`;
}

export const MergeFieldNode = Node.create({
  name: 'mergeField',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      field: { default: '' },
      fallback: { default: null },
      format: { default: null },
      label: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-merge-field]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const field = String(node.attrs.field || '');
    const hasFallback = !!node.attrs.fallback;
    const label = node.attrs.label || humanizeFieldKey(field);
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-merge-field': field,
        'data-fallback': node.attrs.fallback ?? undefined,
        'data-format': node.attrs.format ?? undefined,
        class: `cn-chip${hasFallback ? '' : ' cn-chip-nodefault'}`,
        title: hasFallback
          ? `${label} — falls back to "${node.attrs.fallback}"`
          : `${label} — no default value set`,
        contenteditable: 'false',
      }),
      label,
    ];
  },

  renderText({ node }) {
    return buildMergeToken(node.attrs as MergeFieldAttributes);
  },

  addCommands() {
    return {
      insertMergeField:
        (attrs: Partial<MergeFieldAttributes>) =>
        ({ commands }: { commands: { insertContent: (value: unknown) => boolean } }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              field: attrs.field || '',
              fallback: attrs.fallback ?? null,
              format: attrs.format ?? null,
              label: attrs.label ?? humanizeFieldKey(attrs.field || ''),
            },
          }),
      updateMergeField:
        (attrs: Partial<MergeFieldAttributes>) =>
        ({ commands }: { commands: { updateAttributes: (name: string, value: unknown) => boolean } }) =>
          commands.updateAttributes(this.name, attrs),
    } as never;
  },
});

/**
 * Convert stored `{{ … }}` source text into chip markup so TipTap parses it as
 * protected nodes. Text outside tags only, so attributes such as href keep their
 * raw tokens.
 */
export function tokensToChips(html: string): string {
  const source = String(html || '');
  let out = '';
  let index = 0;
  const tagPattern = /<[^>]+>/g;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(source)) !== null) {
    out += replaceTokens(source.slice(index, match.index));
    out += match[0];
    index = match.index + match[0].length;
  }
  out += replaceTokens(source.slice(index));
  return out;
}

function replaceTokens(text: string): string {
  return text.replace(MERGE_TOKEN_PATTERN, (_full, key: string, filters: string) => {
    const { fallback, format } = parseFilters(filters || '');
    const label = humanizeFieldKey(key);
    const attributes = [
      `data-merge-field="${escapeAttribute(key)}"`,
      fallback !== null ? `data-fallback="${escapeAttribute(fallback)}"` : '',
      format ? `data-format="${escapeAttribute(format)}"` : '',
      'contenteditable="false"',
    ]
      .filter(Boolean)
      .join(' ');
    return `<span ${attributes}>${escapeText(label)}</span>`;
  });
}

/** Convert chip markup back to the canonical source form for storage. */
export function chipsToTokens(html: string): string {
  return String(html || '').replace(
    /<span\b([^>]*?)data-merge-field="([^"]*)"([^>]*)>.*?<\/span>/gi,
    (full, before: string, field: string, after: string) => {
      const attrs = `${before} ${after}`;
      const fallbackMatch = attrs.match(/data-fallback="([^"]*)"/i);
      const formatMatch = attrs.match(/data-format="([^"]*)"/i);
      const token = buildMergeToken({
        field: unescapeAttribute(field),
        fallback: fallbackMatch ? unescapeAttribute(fallbackMatch[1]) : null,
        format: formatMatch ? unescapeAttribute(formatMatch[1]) : null,
      });
      return token || full;
    }
  );
}

function escapeAttribute(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function unescapeAttribute(value: string): string {
  return String(value).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

function escapeText(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
