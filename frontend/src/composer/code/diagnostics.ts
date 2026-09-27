/**
 * Fast browser-side diagnostics (spec 15).
 *
 * This pass exists purely for responsiveness: it marks the obvious problems while the
 * author types. The backend report is authoritative and replaces these markers as soon
 * as it arrives, so the rules here are deliberately conservative.
 */

import type * as Mon from 'monaco-editor';
import type { MergeFieldDefinitionDto } from '../api/types';
import type { IssueSeverity, ValidationIssue } from '../model/issues';

export type Severity = IssueSeverity;

export interface QuickDiagnostic {
  code: string;
  message: string;
  severity: Severity;
  line: number;
  column: number;
  endColumn?: number;
  suggestion?: string;
}

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
  '!doctype',
]);

const UNSUPPORTED_TAGS = new Set(['script', 'form', 'input', 'select', 'textarea', 'button', 'iframe', 'object', 'embed', 'video', 'audio', 'canvas', 'svg']);

const RISKY_CSS = [
  { pattern: /position\s*:\s*(absolute|fixed|sticky)/i, code: 'css.position', message: 'Absolute, fixed and sticky positioning is ignored or breaks layout in most email clients.' },
  { pattern: /display\s*:\s*(flex|grid)/i, code: 'css.flexgrid', message: 'Flexbox and grid are not supported by Outlook and several mobile clients.' },
  { pattern: /float\s*:\s*(left|right)/i, code: 'css.float', message: 'Floats are unreliable in email. Use table cells or inline-block columns.' },
  { pattern: /transform\s*:/i, code: 'css.transform', message: 'CSS transforms are ignored by most email clients.' },
  { pattern: /animation\s*:|@keyframes/i, code: 'css.animation', message: 'Animations are stripped by many clients; make sure the static state reads well.' },
  { pattern: /expression\s*\(/i, code: 'css.expression', message: 'CSS expressions are treated as script and will be removed.' },
];

interface Tag {
  name: string;
  line: number;
  column: number;
}

/** Line and column for an absolute offset in the source. */
function positionAt(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastBreak = -1;
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1;
      lastBreak = index;
    }
  }
  return { line, column: offset - lastBreak };
}

export function quickDiagnostics(source: string, mergeFields: MergeFieldDefinitionDto[]): QuickDiagnostic[] {
  const out: QuickDiagnostic[] = [];
  const push = (entry: QuickDiagnostic) => {
    if (out.length < 400) out.push(entry);
  };

  // ── tag balance and unsupported elements ────────────────────────────────────
  const stack: Tag[] = [];
  const tagPattern = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/?)>/g;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(source))) {
    const [full, closing, rawName, attrs, selfClose] = match;
    const name = rawName.toLowerCase();
    const at = positionAt(source, match.index);

    if (UNSUPPORTED_TAGS.has(name) && !closing) {
      push({
        code: `html.unsupported.${name}`,
        message:
          name === 'script'
            ? 'Script elements are removed for security and are ignored by every email client.'
            : `<${name}> is not supported in email and will be removed.`,
        severity: name === 'script' || name === 'form' || name === 'iframe' ? 'blocker' : 'error',
        line: at.line,
        column: at.column,
        endColumn: at.column + full.length,
        suggestion: name === 'button' ? 'Use a table-based button instead.' : 'Remove the element or replace it with email-safe markup.',
      });
    }

    if (!closing && /\son[a-z]+\s*=/i.test(attrs)) {
      push({
        code: 'html.event_handler',
        message: 'Inline event handlers are stripped and mark the message as suspicious.',
        severity: 'blocker',
        line: at.line,
        column: at.column,
      });
    }

    if (!closing && /\sid\s*=/i.test(attrs) && name !== 'html') {
      push({
        code: 'html.id_attribute',
        message: 'The id attribute is unreliable in email. Use inline styles or classes instead.',
        severity: 'info',
        line: at.line,
        column: at.column,
      });
    }

    if (!closing && name === 'img') {
      if (!/\salt\s*=/i.test(attrs)) {
        push({
          code: 'a11y.image_alt',
          message: 'This image has no alt text, so it is invisible when images are blocked.',
          severity: 'warning',
          line: at.line,
          column: at.column,
          suggestion: 'Add alt text that describes the image, or alt="" if it is purely decorative.',
        });
      }
      if (!/\swidth\s*=/i.test(attrs)) {
        push({
          code: 'compat.image_dimensions',
          message: 'Images without a width attribute can break the layout in Outlook.',
          severity: 'warning',
          line: at.line,
          column: at.column,
        });
      }
    }

    if (!closing && name === 'a') {
      const href = /\shref\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
      const value = (href?.[2] ?? href?.[3] ?? '').trim();
      if (!href) {
        push({
          code: 'links.missing_href',
          message: 'This link has no destination.',
          severity: 'error',
          line: at.line,
          column: at.column,
        });
      } else if (/^\s*javascript:/i.test(value)) {
        push({
          code: 'security.js_url',
          message: 'JavaScript URLs are blocked.',
          severity: 'blocker',
          line: at.line,
          column: at.column,
        });
      } else if (value && !/^(https?:|mailto:|tel:|#|\{\{)/i.test(value)) {
        push({
          code: 'links.unsupported_protocol',
          message: `“${value.slice(0, 40)}” is not a supported link protocol.`,
          severity: 'error',
          line: at.line,
          column: at.column,
        });
      } else if (/^http:\/\//i.test(value)) {
        push({
          code: 'links.insecure',
          message: 'This link uses plain HTTP. Prefer https so clients do not warn recipients.',
          severity: 'warning',
          line: at.line,
          column: at.column,
        });
      }
    }

    if (closing) {
      const openIndex = [...stack].reverse().findIndex(entry => entry.name === name);
      if (openIndex === -1) {
        push({
          code: 'html.stray_close',
          message: `</${name}> has no matching opening tag.`,
          severity: 'error',
          line: at.line,
          column: at.column,
          endColumn: at.column + full.length,
        });
      } else {
        const removeAt = stack.length - 1 - openIndex;
        for (let index = stack.length - 1; index > removeAt; index -= 1) {
          const unclosed = stack[index];
          push({
            code: 'html.unclosed_tag',
            message: `<${unclosed.name}> is never closed.`,
            severity: 'error',
            line: unclosed.line,
            column: unclosed.column,
          });
        }
        stack.length = removeAt;
      }
    } else if (!selfClose && !VOID_TAGS.has(name)) {
      stack.push({ name, line: at.line, column: at.column });
    }
  }

  stack.forEach(unclosed => {
    push({
      code: 'html.unclosed_tag',
      message: `<${unclosed.name}> is never closed.`,
      severity: 'error',
      line: unclosed.line,
      column: unclosed.column,
      suggestion: 'Add the matching closing tag so clients do not guess the structure.',
    });
  });

  // ── risky CSS ───────────────────────────────────────────────────────────────
  RISKY_CSS.forEach(rule => {
    const pattern = new RegExp(rule.pattern.source, 'gi');
    let cssMatch: RegExpExecArray | null;
    while ((cssMatch = pattern.exec(source))) {
      const at = positionAt(source, cssMatch.index);
      push({
        code: rule.code,
        message: rule.message,
        severity: rule.code === 'css.expression' ? 'blocker' : 'warning',
        line: at.line,
        column: at.column,
        endColumn: at.column + cssMatch[0].length,
      });
    }
  });

  // ── merge fields ────────────────────────────────────────────────────────────
  const known = new Set([
    ...mergeFields.map(field => field.key),
    'unsubscribe_url',
    'view_in_browser_url',
    'preference_center_url',
  ]);
  const mergePattern = /\{\{([^}]*)\}\}/g;
  let mergeMatch: RegExpExecArray | null;
  while ((mergeMatch = mergePattern.exec(source))) {
    const at = positionAt(source, mergeMatch.index);
    const body = mergeMatch[1].trim();
    if (!body) {
      push({
        code: 'merge.empty',
        message: 'Empty merge field.',
        severity: 'error',
        line: at.line,
        column: at.column,
        endColumn: at.column + mergeMatch[0].length,
      });
      continue;
    }
    const [rawKey, ...filters] = body.split('|').map(part => part.trim());
    if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(rawKey)) {
      push({
        code: 'merge.invalid_syntax',
        message: `“${rawKey}” is not a valid merge field name.`,
        severity: 'error',
        line: at.line,
        column: at.column,
        endColumn: at.column + mergeMatch[0].length,
      });
      continue;
    }
    if (!known.has(rawKey)) {
      push({
        code: 'merge.unknown_field',
        message: `“${rawKey}” is not declared, so it renders empty for every recipient.`,
        severity: 'warning',
        line: at.line,
        column: at.column,
        endColumn: at.column + mergeMatch[0].length,
        suggestion: 'Declare the field in the personalization panel or map it to a spreadsheet column.',
      });
    }
    filters.forEach(filter => {
      if (!filter) return;
      const name = filter.split(':')[0].trim();
      if (!['default', 'format', 'upper', 'lower', 'title', 'trim', 'urlencode'].includes(name)) {
        push({
          code: 'merge.unknown_filter',
          message: `“${name}” is not a supported merge filter.`,
          severity: 'error',
          line: at.line,
          column: at.column,
          endColumn: at.column + mergeMatch![0].length,
        });
      }
      if (name === 'default' && !/^default\s*:\s*("[^"]*"|'[^']*')\s*$/.test(filter)) {
        push({
          code: 'merge.invalid_default',
          message: 'A default value must be quoted, for example default: "Customer".',
          severity: 'error',
          line: at.line,
          column: at.column,
          endColumn: at.column + mergeMatch![0].length,
        });
      }
    });
    const required = mergeFields.find(field => field.key === rawKey && field.required);
    if (required && !required.default_value && !filters.some(filter => filter.startsWith('default'))) {
      push({
        code: 'merge.required_no_default',
        message: `“${rawKey}” is required but has no default, so recipients without a value may be skipped.`,
        severity: 'warning',
        line: at.line,
        column: at.column,
        endColumn: at.column + mergeMatch[0].length,
      });
    }
  }

  // ── size ────────────────────────────────────────────────────────────────────
  const bytes = new TextEncoder().encode(source).length;
  if (bytes > 102400) {
    push({
      code: 'delivery.html_size',
      message: `The HTML is ${Math.round(bytes / 1024)}KB. Gmail clips messages over about 102KB.`,
      severity: 'warning',
      line: 1,
      column: 1,
    });
  }

  return out;
}

export function severityToMarker(severity: Severity): Mon.MarkerSeverity {
  // 8 = Error, 4 = Warning, 2 = Info, 1 = Hint in Monaco's enum.
  if (severity === 'blocker' || severity === 'error') return 8 as Mon.MarkerSeverity;
  if (severity === 'warning') return 4 as Mon.MarkerSeverity;
  return 2 as Mon.MarkerSeverity;
}

export function toMarkers(diagnostics: QuickDiagnostic[]): Mon.editor.IMarkerData[] {
  return diagnostics.map(entry => ({
    severity: severityToMarker(entry.severity),
    message: entry.suggestion ? `${entry.message}\n\n${entry.suggestion}` : entry.message,
    startLineNumber: entry.line,
    startColumn: entry.column,
    endLineNumber: entry.line,
    endColumn: entry.endColumn ?? entry.column + 1,
    code: entry.code,
    source: 'Email composer',
  }));
}

/** Backend issues carry their own positions when they came from HTML source. */
export function issuesToMarkers(issues: ValidationIssue[]): Mon.editor.IMarkerData[] {
  return issues
    .filter(issue => typeof issue.line === 'number' && issue.line > 0)
    .map(issue => ({
      severity: severityToMarker(issue.severity),
      message: issue.expected ? `${issue.message}\n\n${issue.expected}` : issue.message,
      startLineNumber: issue.line as number,
      startColumn: issue.column ?? 1,
      endLineNumber: issue.line as number,
      endColumn: (issue.column ?? 1) + 1,
      code: issue.code,
      source: 'Validation',
    }));
}
