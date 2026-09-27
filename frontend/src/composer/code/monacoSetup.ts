/**
 * Monaco configuration for the HTML mode (spec 13, 14).
 *
 * Monaco is bundled with the application rather than loaded from a CDN so the editor
 * works offline and inside restricted networks. Language services get email-specific
 * snippets, merge-field completions and hover documentation on top of the built-in
 * HTML and CSS support.
 */

// Only the editor core plus the HTML, CSS and JSON services are imported: pulling the
// whole `monaco-editor` entry point would add every language grammar to the bundle.
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/editor/editor.all.js';
import 'monaco-editor/esm/vs/language/html/monaco.contribution';
import 'monaco-editor/esm/vs/language/css/monaco.contribution';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution';
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution';
import { loader } from '@monaco-editor/react';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import type { MergeFieldDefinitionDto } from '../api/types';
import type { ThemeTokens } from '../model/theme';

export type Monaco = typeof monaco;

// ── snippets ──────────────────────────────────────────────────────────────────

export interface EmailSnippet {
  label: string;
  detail: string;
  documentation: string;
  body: string;
}

export const EMAIL_SNIPPETS: EmailSnippet[] = [
  {
    label: 'email:document',
    detail: 'Full email document',
    documentation: 'A complete email-safe document skeleton with the meta tags and resets that most clients need.',
    body: [
      '<!DOCTYPE html>',
      '<html lang="${1:en}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">',
      '<head>',
      '  <meta charset="utf-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1">',
      '  <meta http-equiv="X-UA-Compatible" content="IE=edge">',
      '  <title>${2:Email title}</title>',
      '  <!--[if mso]><style>table,td,div,p{font-family:Arial,sans-serif !important}</style><![endif]-->',
      '</head>',
      '<body style="margin:0;padding:0;background-color:${3:#f4f5f7};">',
      '  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
      '    <tr>',
      '      <td align="center" style="padding:24px 12px;">',
      '        <table role="presentation" width="${4:600}" cellpadding="0" cellspacing="0" border="0" style="width:${4:600}px;max-width:100%;background-color:#ffffff;">',
      '          <tr><td style="padding:24px;">$0</td></tr>',
      '        </table>',
      '      </td>',
      '    </tr>',
      '  </table>',
      '</body>',
      '</html>',
    ].join('\n'),
  },
  {
    label: 'email:section',
    detail: 'Single column section',
    documentation: 'One full-width column inside a presentation table.',
    body: [
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
      '  <tr>',
      '    <td style="padding:${1:16px} ${2:24px};font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#334155;">',
      '      $0',
      '    </td>',
      '  </tr>',
      '</table>',
    ].join('\n'),
  },
  {
    label: 'email:two-columns',
    detail: 'Two columns that stack on mobile',
    documentation: 'Uses inline-block columns with an MSO fallback so Outlook keeps them side by side.',
    body: [
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
      '  <tr>',
      '    <td style="padding:0;font-size:0;text-align:left;">',
      '      <!--[if mso]><table role="presentation" width="100%"><tr><td width="50%" valign="top"><![endif]-->',
      '      <div class="col" style="display:inline-block;width:100%;max-width:50%;vertical-align:top;">',
      '        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
      '          <tr><td style="padding:12px;font-family:Arial,sans-serif;font-size:15px;color:#334155;">${1:Left column}</td></tr>',
      '        </table>',
      '      </div>',
      '      <!--[if mso]></td><td width="50%" valign="top"><![endif]-->',
      '      <div class="col" style="display:inline-block;width:100%;max-width:50%;vertical-align:top;">',
      '        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
      '          <tr><td style="padding:12px;font-family:Arial,sans-serif;font-size:15px;color:#334155;">${2:Right column}</td></tr>',
      '        </table>',
      '      </div>',
      '      <!--[if mso]></td></tr></table><![endif]-->',
      '    </td>',
      '  </tr>',
      '</table>',
      '$0',
    ].join('\n'),
  },
  {
    label: 'email:image',
    detail: 'Responsive image',
    documentation: 'An image with explicit dimensions, alt text and the display rules blocked-image clients need.',
    body:
      '<img src="${1:https://example.com/image.png}" alt="${2:Describe the image}" width="${3:600}" height="${4:300}" style="display:block;width:100%;max-width:${3:600}px;height:auto;border:0;outline:none;text-decoration:none;">$0',
  },
  {
    label: 'email:button',
    detail: 'Bulletproof button',
    documentation: 'A table-based button that renders in Outlook without VML.',
    body: [
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">',
      '  <tr>',
      '    <td align="center" bgcolor="${1:#4f46e5}" style="border-radius:${2:6}px;">',
      '      <a href="${3:https://example.com}" style="display:inline-block;padding:12px 24px;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:${2:6}px;">${4:Button text}</a>',
      '    </td>',
      '  </tr>',
      '</table>',
      '$0',
    ].join('\n'),
  },
  {
    label: 'email:divider',
    detail: 'Divider line',
    documentation: 'A horizontal rule built from a table cell, which is more reliable than <hr>.',
    body: [
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
      '  <tr><td style="padding:${1:12px} 0;"><div style="height:1px;line-height:1px;font-size:0;background-color:${2:#e2e8f0};">&nbsp;</div></td></tr>',
      '</table>',
      '$0',
    ].join('\n'),
  },
  {
    label: 'email:header',
    detail: 'Logo header',
    documentation: 'A centred logo row.',
    body: [
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
      '  <tr>',
      '    <td align="center" style="padding:20px 24px;">',
      '      <img src="${1:https://example.com/logo.png}" alt="${2:Organization name}" width="${3:160}" style="display:block;border:0;">',
      '    </td>',
      '  </tr>',
      '</table>',
      '$0',
    ].join('\n'),
  },
  {
    label: 'email:footer',
    detail: 'Compliance footer',
    documentation: 'Postal address, unsubscribe link and view-in-browser link in one block.',
    body: [
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
      '  <tr>',
      '    <td align="center" style="padding:20px 24px;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#64748b;">',
      '      ${1:Organization name} · ${2:Street, City, Postcode}<br>',
      '      <a href="{{unsubscribe_url}}" style="color:#64748b;text-decoration:underline;">Unsubscribe</a> ·',
      '      <a href="{{view_in_browser_url}}" style="color:#64748b;text-decoration:underline;">View in browser</a>',
      '    </td>',
      '  </tr>',
      '</table>',
      '$0',
    ].join('\n'),
  },
  {
    label: 'email:unsubscribe',
    detail: 'Unsubscribe link',
    documentation: 'The unsubscribe URL is generated per recipient at send time.',
    body: '<a href="{{unsubscribe_url}}" style="color:#64748b;text-decoration:underline;">${1:Unsubscribe}</a>$0',
  },
  {
    label: 'email:view-in-browser',
    detail: 'View in browser link',
    documentation: 'Links to the hosted copy of the email.',
    body: '<a href="{{view_in_browser_url}}" style="color:#64748b;text-decoration:underline;">${1:View in browser}</a>$0',
  },
  {
    label: 'email:social',
    detail: 'Social icon row',
    documentation: 'A row of linked icons with accessible labels.',
    body: [
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">',
      '  <tr>',
      '    <td style="padding:0 6px;"><a href="${1:https://linkedin.com/company/example}"><img src="${2:https://example.com/linkedin.png}" alt="LinkedIn" width="24" height="24" style="display:block;border:0;"></a></td>',
      '    <td style="padding:0 6px;"><a href="${3:https://x.com/example}"><img src="${4:https://example.com/x.png}" alt="X" width="24" height="24" style="display:block;border:0;"></a></td>',
      '  </tr>',
      '</table>',
      '$0',
    ].join('\n'),
  },
  {
    label: 'email:outlook-spacer',
    detail: 'Outlook-safe vertical space',
    documentation: 'Empty cells collapse in some clients, so the height is carried by a non-breaking space.',
    body:
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="${1:24}" style="height:${1:24}px;line-height:${1:24}px;font-size:0;">&nbsp;</td></tr></table>$0',
  },
  {
    label: 'email:merge-field',
    detail: 'Merge field with a default',
    documentation: 'Always give a default so recipients with missing data still read naturally.',
    body: '{{ ${1:first_name} | default: "${2:there}" }}$0',
  },
  {
    label: 'email:media-query',
    detail: 'Mobile media query',
    documentation: 'Stacks columns and scales type on narrow screens.',
    body: [
      '<style>',
      '  @media only screen and (max-width:600px) {',
      '    .col { max-width:100% !important; }',
      '    .mobile-hide { display:none !important; }',
      '    .mobile-center { text-align:center !important; }',
      '  }',
      '</style>',
      '$0',
    ].join('\n'),
  },
];

// ── live registry the providers read from ─────────────────────────────────────

interface Registry {
  mergeFields: MergeFieldDefinitionDto[];
  tokens: ThemeTokens | null;
  systemLinks: { key: string; label: string; description: string }[];
  reusable: { label: string; html: string; description: string }[];
}

const registry: Registry = {
  mergeFields: [],
  tokens: null,
  systemLinks: [
    { key: 'unsubscribe_url', label: 'Unsubscribe URL', description: 'Generated per recipient at send time.' },
    { key: 'view_in_browser_url', label: 'View in browser URL', description: 'Hosted copy of this email.' },
    { key: 'preference_center_url', label: 'Preference centre URL', description: 'Where recipients manage their subscriptions.' },
  ],
  reusable: [],
};

export function setCodeIntelContext(next: Partial<Registry>): void {
  Object.assign(registry, next);
}

// ── one-time setup ────────────────────────────────────────────────────────────

let ready = false;

export function setupMonaco(): Monaco {
  if (ready) return monaco;
  ready = true;

  // Workers are bundled by Vite; without this Monaco falls back to the main thread.
  (self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
      if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
      if (label === 'json') return new jsonWorker();
      return new editorWorker();
    },
  };

  loader.config({ monaco });

  monaco.editor.defineTheme('composer-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'tag', foreground: '2563eb' },
      { token: 'attribute.name', foreground: '7c3aed' },
      { token: 'attribute.value', foreground: '047857' },
      { token: 'comment', foreground: '94a3b8', fontStyle: 'italic' },
      { token: 'delimiter.html', foreground: '64748b' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editorLineNumber.foreground': '#cbd5e1',
      'editorLineNumber.activeForeground': '#475569',
      'editor.lineHighlightBackground': '#f8fafc',
      'editor.selectionBackground': '#dbeafe',
      'editorIndentGuide.background': '#eef2f6',
      'editorBracketHighlight.foreground1': '#2563eb',
      'editorBracketHighlight.foreground2': '#c026d3',
      'editorBracketHighlight.foreground3': '#0d9488',
    },
  });

  monaco.editor.defineTheme('composer-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'tag', foreground: '7dd3fc' },
      { token: 'attribute.name', foreground: 'c4b5fd' },
      { token: 'attribute.value', foreground: '86efac' },
      { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': '#0f172a',
      'editor.lineHighlightBackground': '#1e293b',
      'editorLineNumber.foreground': '#475569',
      'editorLineNumber.activeForeground': '#e2e8f0',
    },
  });

  monaco.languages.html.htmlDefaults.setOptions({
    format: {
      tabSize: 2,
      insertSpaces: true,
      wrapLineLength: 120,
      unformatted: 'a,abbr,b,bdo,br,cite,code,dfn,em,i,img,kbd,q,samp,small,span,strong,sub,sup,var',
      contentUnformatted: 'pre,textarea',
      indentInnerHtml: false,
      preserveNewLines: true,
      maxPreserveNewLines: 2,
      indentHandlebars: false,
      endWithNewline: true,
      extraLiners: 'head,body,/html',
      wrapAttributes: 'auto',
    },
    suggest: { html5: true },
  });

  registerCompletions();
  registerHovers();
  return monaco;
}

function mergeExpression(field: MergeFieldDefinitionDto): string {
  const parts = [field.key];
  if (field.default_value) parts.push(`default: "${field.default_value}"`);
  if (field.format) parts.push(`format: ${field.format}`);
  return `{{ ${parts.join(' | ')} }}`;
}

function describeField(field: MergeFieldDefinitionDto): string {
  const lines = [
    `**${field.label || field.key}**`,
    field.description || '',
    '',
    `- Type: \`${field.data_type || 'text'}\``,
    `- Required: ${field.required ? 'yes' : 'no'}`,
  ];
  if (field.default_value) lines.push(`- Template default: \`${field.default_value}\``);
  if (field.example_value) lines.push(`- Example: \`${field.example_value}\``);
  if (field.required && !field.default_value) {
    lines.push('', '⚠ Required with no default. Recipients missing this value may be skipped.');
  }
  return lines.filter(Boolean).join('\n');
}

function registerCompletions(): void {
  monaco.languages.registerCompletionItemProvider('html', {
    triggerCharacters: ['{', ' ', '|', ':', '-'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const lineToCursor = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const suggestions: monaco.languages.CompletionItem[] = [];
      const insideMerge = /\{\{[^}]*$/.test(lineToCursor);

      if (insideMerge) {
        // Inside {{ … }} only fields, filters and defaults make sense.
        const mergeRange: monaco.IRange = { ...range, startColumn: word.startColumn, endColumn: word.endColumn };
        registry.mergeFields.forEach(field => {
          suggestions.push({
            label: field.key,
            kind: monaco.languages.CompletionItemKind.Variable,
            detail: field.label || 'Merge field',
            documentation: { value: describeField(field) },
            insertText: field.default_value ? `${field.key} | default: "${field.default_value}"` : field.key,
            range: mergeRange,
            sortText: field.required ? `0${field.key}` : `1${field.key}`,
          });
        });
        registry.systemLinks.forEach(link => {
          suggestions.push({
            label: link.key,
            kind: monaco.languages.CompletionItemKind.Constant,
            detail: link.label,
            documentation: { value: link.description },
            insertText: link.key,
            range: mergeRange,
          });
        });
        ['default: "${1:value}"', 'format: currency:$', 'format: date:%d %b %Y', 'format: number:2', 'upper', 'lower', 'title'].forEach(
          filter => {
            suggestions.push({
              label: filter.split(':')[0],
              kind: monaco.languages.CompletionItemKind.Operator,
              detail: 'Merge filter',
              insertText: filter,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: mergeRange,
            });
          }
        );
        return { suggestions };
      }

      EMAIL_SNIPPETS.forEach(snippet => {
        suggestions.push({
          label: snippet.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: snippet.detail,
          documentation: { value: snippet.documentation },
          insertText: snippet.body,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        });
      });

      registry.mergeFields.forEach(field => {
        suggestions.push({
          label: `{{ ${field.key} }}`,
          filterText: field.key,
          kind: monaco.languages.CompletionItemKind.Variable,
          detail: field.label || 'Merge field',
          documentation: { value: describeField(field) },
          insertText: mergeExpression(field),
          range,
        });
      });

      if (registry.tokens) {
        Object.entries(registry.tokens).forEach(([key, value]) => {
          if (typeof value !== 'string' && typeof value !== 'number') return;
          suggestions.push({
            label: `theme:${key}`,
            kind: monaco.languages.CompletionItemKind.Color,
            detail: `Theme value: ${value}`,
            documentation: { value: 'Inserts the current theme value. Themes are inlined at compile time.' },
            insertText: String(value),
            range,
          });
        });
      }

      registry.reusable.forEach(entry => {
        suggestions.push({
          label: `snippet:${entry.label}`,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: 'Reusable block',
          documentation: { value: entry.description },
          insertText: entry.html,
          range,
        });
      });

      return { suggestions };
    },
  });
}

function registerHovers(): void {
  monaco.languages.registerHoverProvider('html', {
    provideHover(model, position) {
      const line = model.getLineContent(position.lineNumber);
      const pattern = /\{\{\s*([a-zA-Z0-9_.]+)([^}]*)\}\}/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line))) {
        const start = match.index + 1;
        const end = start + match[0].length;
        if (position.column < start || position.column > end) continue;
        const key = match[1];
        const field = registry.mergeFields.find(entry => entry.key === key);
        const system = registry.systemLinks.find(entry => entry.key === key);
        const contents = field
          ? [{ value: describeField(field) }]
          : system
            ? [{ value: `**${system.label}**\n\n${system.description}` }]
            : [
                {
                  value: `**${key}** is not declared.\n\nAdd it in the personalization panel, or it will render empty for every recipient.`,
                },
              ];
        return {
          range: new monaco.Range(position.lineNumber, start, position.lineNumber, end),
          contents,
        };
      }
      return null;
    },
  });
}

export { monaco };
