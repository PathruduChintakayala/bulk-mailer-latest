/**
 * Coerce untrusted/partial JSON into a valid EmailDocument.
 *
 * Documents arrive from the API, from localStorage recovery copies, and from
 * imported templates, so every field is treated as optional and repaired.
 * Mirrors backend/app/services/composer/document.py::normalize_document.
 */

import {
  Align,
  Background,
  Block,
  BlockType,
  Border,
  Column,
  DOCUMENT_VERSION,
  Direction,
  DocumentSettings,
  EmailDocument,
  Row,
  Section,
  SectionRole,
  Spacing,
  TextStyle,
  VAlign,
  Visibility,
} from './document';
import { createBlock, newId, noBorder, spacing, visibleEverywhere } from './defaults';
import { normalizeColumnWidths } from './mutations';

const ALIGNS: Align[] = ['left', 'center', 'right', 'justify'];
const VALIGNS: VAlign[] = ['top', 'middle', 'bottom'];
const BORDER_STYLES = ['none', 'solid', 'dashed', 'dotted', 'double'] as const;
const BG_MODES = ['inherit', 'transparent', 'color', 'image'] as const;
const SECTION_ROLES: SectionRole[] = ['header', 'body', 'footer'];

const KNOWN_BLOCK_TYPES = new Set<BlockType>([
  'text', 'heading', 'image', 'button', 'divider', 'spacer', 'quote', 'list', 'table',
  'signature', 'rawHtml', 'preformatted', 'social', 'navLinks', 'logo', 'contactInfo',
  'viewInBrowser', 'unsubscribe', 'preferenceCenter', 'orgFooter', 'legal', 'videoThumb',
  'mergeField', 'reusable', 'conditional',
]);

type Dict = Record<string, unknown>;

function asDict(value: unknown): Dict {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Dict) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function optStr(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function normSpacing(value: unknown, fallback = 0): Spacing {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return spacing(value);
  }
  const dict = asDict(value);
  return {
    top: num(dict.top, fallback),
    right: num(dict.right, fallback),
    bottom: num(dict.bottom, fallback),
    left: num(dict.left, fallback),
  };
}

function normBackground(value: unknown): Background {
  const dict = asDict(value);
  const mode = pick(dict.mode, BG_MODES, 'inherit');
  const out: Background = { mode };
  if (dict.color !== undefined) out.color = str(dict.color) || undefined;
  if (mode === 'image') {
    out.imageUrl = str(dict.imageUrl) || undefined;
    out.imagePosition = str(dict.imagePosition, 'center center');
    out.imageRepeat = pick(dict.imageRepeat, ['no-repeat', 'repeat', 'repeat-x', 'repeat-y'] as const, 'no-repeat');
    out.imageSize = pick(dict.imageSize, ['auto', 'cover', 'contain'] as const, 'cover');
    out.fallbackColor = str(dict.fallbackColor) || undefined;
  }
  return out;
}

function normBorder(value: unknown): Border {
  const dict = asDict(value);
  if (Object.keys(dict).length === 0) return noBorder();
  return {
    style: pick(dict.style, BORDER_STYLES, 'none'),
    width: normSpacing(dict.width, 0),
    color: str(dict.color, '#e5e7eb'),
    radius: num(dict.radius, 0),
  };
}

function normVisibility(value: unknown): Visibility {
  const dict = asDict(value);
  if (Object.keys(dict).length === 0) return visibleEverywhere();
  return { desktop: bool(dict.desktop, true), mobile: bool(dict.mobile, true) };
}

function normTextStyle(value: unknown): TextStyle {
  const dict = asDict(value);
  return {
    fontFamily: optStr(dict.fontFamily),
    fontSize: optNum(dict.fontSize),
    fontWeight: optNum(dict.fontWeight),
    lineHeight: optNum(dict.lineHeight),
    letterSpacing: optNum(dict.letterSpacing),
    color: optStr(dict.color),
    textTransform: dict.textTransform
      ? pick(dict.textTransform, ['none', 'uppercase', 'lowercase', 'capitalize'] as const, 'none')
      : null,
    align: dict.align ? pick(dict.align, ALIGNS, 'left') : null,
    direction: dict.direction ? pick(dict.direction, ['ltr', 'rtl'] as const, 'ltr') : null,
  };
}

function normMobile(value: unknown): Block['mobile'] {
  if (!value) return null;
  const dict = asDict(value);
  const width = dict.width === 'full' ? 'full' : optNum(dict.width);
  return {
    padding: dict.padding ? normSpacing(dict.padding) : null,
    align: dict.align ? pick(dict.align, ALIGNS, 'left') : null,
    fontSize: optNum(dict.fontSize),
    width,
  };
}

function normLink(value: unknown): Block extends never ? never : NonNullable<unknown> {
  const dict = asDict(value);
  return {
    type: pick(dict.type, ['url', 'email', 'tel', 'unsubscribe', 'preferences', 'view_in_browser', 'merge'] as const, 'url'),
    value: str(dict.value),
    title: optStr(dict.title),
    target: pick(dict.target, ['_blank', '_self'] as const, '_blank'),
    trackingEnabled: bool(dict.trackingEnabled, true),
  } as never;
}

function normalizeBlock(raw: unknown): Block | null {
  const dict = asDict(raw);
  const type = dict.type as BlockType;
  if (!KNOWN_BLOCK_TYPES.has(type)) return null;

  const base = createBlock(type) as unknown as Dict;
  base.id = str(dict.id) || newId('blk');
  base.name = optStr(dict.name);
  base.locked = bool(dict.locked, false);
  base.visibility = normVisibility(dict.visibility);
  base.padding = normSpacing(dict.padding, 0);
  base.background = normBackground(dict.background);
  base.border = normBorder(dict.border);
  base.mobile = normMobile(dict.mobile);

  if ('style' in base) base.style = normTextStyle(dict.style);
  if ('align' in base && dict.align !== undefined) base.align = pick(dict.align, ALIGNS, base.align as Align);

  switch (type) {
    case 'text':
    case 'signature':
      base.html = str(dict.html, base.html as string);
      break;
    case 'heading':
      base.html = str(dict.html, base.html as string);
      base.level = Math.min(6, Math.max(1, num(dict.level, 2)));
      break;
    case 'quote':
      base.html = str(dict.html, base.html as string);
      base.citation = optStr(dict.citation);
      base.accentColor = optStr(dict.accentColor);
      break;
    case 'orgFooter':
      base.html = str(dict.html, '');
      base.useThemeFooter = bool(dict.useThemeFooter, true);
      break;
    case 'legal':
      base.html = str(dict.html, '');
      base.useThemeLegal = bool(dict.useThemeLegal, true);
      break;
    case 'rawHtml':
      base.html = str(dict.html, '');
      break;
    case 'preformatted':
      base.text = str(dict.text, '');
      break;
    case 'image':
      base.src = str(dict.src);
      base.alt = str(dict.alt);
      base.title = optStr(dict.title);
      base.width = optNum(dict.width);
      base.height = optNum(dict.height);
      base.maxWidth = optNum(dict.maxWidth);
      base.lockAspect = bool(dict.lockAspect, true);
      base.naturalWidth = optNum(dict.naturalWidth);
      base.naturalHeight = optNum(dict.naturalHeight);
      base.fit = pick(dict.fit, ['none', 'fit', 'fill'] as const, 'fit');
      base.link = dict.link ? normLink(dict.link) : null;
      base.assetCode = optStr(dict.assetCode);
      break;
    case 'button':
      base.text = str(dict.text, base.text as string);
      base.link = normLink(dict.link);
      base.fullWidth = bool(dict.fullWidth, false);
      base.width = optNum(dict.width);
      base.backgroundColor = optStr(dict.backgroundColor);
      base.textColor = optStr(dict.textColor);
      base.innerPadding = normSpacing(dict.innerPadding ?? base.innerPadding, 12);
      base.accessibleLabel = optStr(dict.accessibleLabel);
      base.trackingParams = dict.trackingParams && typeof dict.trackingParams === 'object'
        ? (dict.trackingParams as Record<string, string>)
        : null;
      break;
    case 'divider':
      base.lineStyle = pick(dict.lineStyle, ['solid', 'dashed', 'dotted', 'double'] as const, 'solid');
      base.thickness = num(dict.thickness, 1);
      base.color = optStr(dict.color);
      base.widthPct = Math.min(100, Math.max(1, num(dict.widthPct, 100)));
      break;
    case 'spacer':
      base.height = Math.max(0, num(dict.height, 24));
      base.mobileHeight = optNum(dict.mobileHeight);
      break;
    case 'list':
      base.ordered = bool(dict.ordered, false);
      base.items = asArray(dict.items).map(item => str(item)).filter(item => item.length > 0);
      if (!(base.items as string[]).length) base.items = [''];
      break;
    case 'table': {
      const rows = asArray(dict.rows)
        .map(rawRow => {
          const rowDict = asDict(rawRow);
          const cells = asArray(rowDict.cells).map(rawCell => {
            const cellDict = asDict(rawCell);
            return {
              id: str(cellDict.id) || newId('tcel'),
              html: str(cellDict.html),
              align: pick(cellDict.align, ALIGNS, 'left'),
              vAlign: pick(cellDict.vAlign, VALIGNS, 'middle'),
              background: optStr(cellDict.background),
              colSpan: Math.max(1, num(cellDict.colSpan, 1)),
              rowSpan: Math.max(1, num(cellDict.rowSpan, 1)),
            };
          });
          return { id: str(rowDict.id) || newId('trow'), cells };
        })
        .filter(row => row.cells.length > 0);
      if (rows.length) base.rows = rows;
      base.headerRow = bool(dict.headerRow, true);
      base.footerRow = bool(dict.footerRow, false);
      base.cellPadding = normSpacing(dict.cellPadding ?? base.cellPadding, 8);
      base.cellBorder = normBorder(dict.cellBorder ?? base.cellBorder);
      base.widthPct = Math.min(100, Math.max(1, num(dict.widthPct, 100)));
      base.alternateRowColor = optStr(dict.alternateRowColor);
      base.headerBackground = optStr(dict.headerBackground);
      base.mobileStrategy = pick(dict.mobileStrategy, ['scroll', 'stack'] as const, 'scroll');
      break;
    }
    case 'social':
      base.links = asArray(dict.links).map(rawLink => {
        const linkDict = asDict(rawLink);
        return {
          id: str(linkDict.id) || newId('soc'),
          network: str(linkDict.network, 'link'),
          url: str(linkDict.url),
          label: str(linkDict.label, str(linkDict.network, 'Link')),
          iconUrl: optStr(linkDict.iconUrl),
        };
      });
      base.iconSize = num(dict.iconSize, 24);
      base.gap = num(dict.gap, 12);
      base.showLabels = bool(dict.showLabels, false);
      break;
    case 'navLinks':
      base.items = asArray(dict.items).map(rawItem => {
        const itemDict = asDict(rawItem);
        return {
          id: str(itemDict.id) || newId('nav'),
          label: str(itemDict.label, 'Link'),
          link: normLink(itemDict.link),
        };
      });
      base.separator = str(dict.separator, '|');
      break;
    case 'logo':
      base.src = str(dict.src);
      base.alt = str(dict.alt, 'Organization logo');
      base.width = optNum(dict.width);
      base.link = dict.link ? normLink(dict.link) : null;
      base.useThemeLogo = bool(dict.useThemeLogo, true);
      base.themeVariant = pick(dict.themeVariant, ['primary', 'secondary', 'dark'] as const, 'primary');
      break;
    case 'contactInfo':
      base.organizationName = str(dict.organizationName);
      base.addressLines = asArray(dict.addressLines).map(line => str(line));
      base.phone = optStr(dict.phone);
      base.email = optStr(dict.email);
      base.website = optStr(dict.website);
      base.useThemeAddress = bool(dict.useThemeAddress, true);
      break;
    case 'viewInBrowser':
    case 'unsubscribe':
    case 'preferenceCenter':
      base.label = str(dict.label, base.label as string);
      break;
    case 'videoThumb':
      base.thumbnailUrl = str(dict.thumbnailUrl);
      base.videoUrl = str(dict.videoUrl);
      base.alt = str(dict.alt, 'Watch the video');
      base.width = optNum(dict.width);
      base.showPlayBadge = bool(dict.showPlayBadge, true);
      break;
    case 'mergeField':
      base.fieldKey = str(dict.fieldKey);
      base.fallback = optStr(dict.fallback);
      base.format = optStr(dict.format);
      break;
    case 'reusable':
      base.reusableCode = str(dict.reusableCode);
      base.label = optStr(dict.label);
      base.detachable = bool(dict.detachable, true);
      break;
    case 'conditional':
      base.label = str(dict.label, 'Conditional content');
      base.blocks = asArray(dict.blocks)
        .map(normalizeBlock)
        .filter((block): block is Block => block !== null);
      break;
    default:
      break;
  }

  return base as unknown as Block;
}

function normalizeColumn(raw: unknown): Column {
  const dict = asDict(raw);
  return {
    id: str(dict.id) || newId('col'),
    name: optStr(dict.name),
    widthPct: Math.max(1, Math.min(100, num(dict.widthPct, 100))),
    minWidth: optNum(dict.minWidth),
    padding: normSpacing(dict.padding, 0),
    background: normBackground(dict.background),
    border: normBorder(dict.border),
    vAlign: pick(dict.vAlign, VALIGNS, 'top'),
    mobileOrder: optNum(dict.mobileOrder),
    keepSideBySideOnMobile: bool(dict.keepSideBySideOnMobile, false),
    visibility: normVisibility(dict.visibility),
    locked: bool(dict.locked, false),
    blocks: asArray(dict.blocks)
      .map(normalizeBlock)
      .filter((block): block is Block => block !== null),
  };
}

function normalizeRow(raw: unknown): Row {
  const dict = asDict(raw);
  const columns = asArray(dict.columns).map(normalizeColumn);
  const row: Row = {
    id: str(dict.id) || newId('row'),
    name: optStr(dict.name),
    columns: columns.length ? columns : [normalizeColumn({})],
    gap: num(dict.gap, 16),
    vAlign: pick(dict.vAlign, VALIGNS, 'top'),
    stackOnMobile: bool(dict.stackOnMobile, true),
    reverseOnMobile: bool(dict.reverseOnMobile, false),
    visibility: normVisibility(dict.visibility),
    padding: normSpacing(dict.padding, 0),
    background: normBackground(dict.background),
    border: normBorder(dict.border),
    minHeight: optNum(dict.minHeight),
    locked: bool(dict.locked, false),
  };
  normalizeColumnWidths(row);
  return row;
}

function normalizeSection(raw: unknown): Section {
  const dict = asDict(raw);
  const rows = asArray(dict.rows).map(normalizeRow);
  return {
    id: str(dict.id) || newId('sec'),
    name: optStr(dict.name),
    role: pick(dict.role, SECTION_ROLES, 'body'),
    rows: rows.length ? rows : [normalizeRow({})],
    outerBackground: normBackground(dict.outerBackground),
    background: normBackground(dict.background),
    padding: normSpacing(dict.padding, 24),
    border: normBorder(dict.border),
    contentWidth: optNum(dict.contentWidth),
    align: pick(dict.align, ALIGNS, 'left'),
    vAlign: pick(dict.vAlign, VALIGNS, 'top'),
    minHeight: optNum(dict.minHeight),
    visibility: normVisibility(dict.visibility),
    locked: bool(dict.locked, false),
  };
}

function normalizeSettings(raw: unknown): DocumentSettings {
  const dict = asDict(raw);
  const minWidth = Math.max(240, num(dict.minWidth, 320));
  const maxWidth = Math.max(minWidth, num(dict.maxWidth, 900));
  const contentWidth = Math.min(maxWidth, Math.max(minWidth, num(dict.contentWidth, 640)));
  return {
    contentWidth,
    minWidth,
    maxWidth,
    background: dict.background ? normBackground(dict.background) : { mode: 'color', color: '#ffffff' },
    outerBackground: dict.outerBackground ? normBackground(dict.outerBackground) : { mode: 'color', color: '#f4f5f7' },
    lang: str(dict.lang, 'en'),
    direction: pick(dict.direction, ['ltr', 'rtl'] as const satisfies readonly Direction[], 'ltr'),
  };
}

export function normalizeDocument(raw: unknown): EmailDocument {
  const dict = asDict(raw);
  return {
    version: DOCUMENT_VERSION,
    settings: normalizeSettings(dict.settings),
    themeId: optStr(dict.themeId),
    themeOverrides:
      dict.themeOverrides && typeof dict.themeOverrides === 'object'
        ? (dict.themeOverrides as Record<string, unknown>)
        : null,
    sections: asArray(dict.sections).map(normalizeSection),
  };
}

/** Parse a JSON string into a document, returning null when unusable. */
export function parseDocument(json: string | null | undefined): EmailDocument | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray((parsed as Dict).sections)) return null;
    return normalizeDocument(parsed);
  } catch {
    return null;
  }
}
