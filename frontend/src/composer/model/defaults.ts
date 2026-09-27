/** Factory functions for every document node, plus insertable layout presets. */

import {
  Align,
  Background,
  Block,
  BlockType,
  Border,
  Column,
  DOCUMENT_VERSION,
  DocumentSettings,
  EmailDocument,
  Row,
  Section,
  SectionRole,
  Spacing,
  TextStyle,
  Visibility,
} from './document';

let counter = 0;

/** Short, stable-enough ids. Crypto randomness is not required for document nodes. */
export function newId(prefix: string): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

export function spacing(top = 0, right = top, bottom = top, left = right): Spacing {
  return { top, right, bottom, left };
}

export function inheritBackground(): Background {
  return { mode: 'inherit' };
}

export function colorBackground(color: string): Background {
  return { mode: 'color', color };
}

export function noBorder(): Border {
  return { style: 'none', width: spacing(0), color: '#e5e7eb', radius: 0 };
}

export function visibleEverywhere(): Visibility {
  return { desktop: true, mobile: true };
}

export function emptyTextStyle(): TextStyle {
  return {
    fontFamily: null,
    fontSize: null,
    fontWeight: null,
    lineHeight: null,
    letterSpacing: null,
    color: null,
    textTransform: null,
    align: null,
    direction: null,
  };
}

function blockBase(type: BlockType) {
  return {
    id: newId('blk'),
    type,
    name: null,
    locked: false,
    visibility: visibleEverywhere(),
    padding: spacing(0),
    background: inheritBackground(),
    border: noBorder(),
    mobile: null,
  };
}

export function createBlock(type: BlockType): Block {
  const base = blockBase(type);
  switch (type) {
    case 'text':
      return { ...base, type, html: '<p>Write your message here.</p>', style: emptyTextStyle() } as Block;
    case 'heading':
      return { ...base, type, level: 2, html: 'Heading', style: emptyTextStyle() } as Block;
    case 'image':
      return {
        ...base,
        type,
        src: '',
        alt: '',
        title: null,
        width: null,
        height: null,
        maxWidth: null,
        lockAspect: true,
        naturalWidth: null,
        naturalHeight: null,
        fit: 'fit',
        align: 'center' as Align,
        link: null,
        assetCode: null,
      } as Block;
    case 'button':
      return {
        ...base,
        type,
        text: 'Click here',
        link: { type: 'url', value: '', target: '_blank', trackingEnabled: true },
        align: 'center' as Align,
        fullWidth: false,
        width: null,
        backgroundColor: null,
        textColor: null,
        style: emptyTextStyle(),
        innerPadding: spacing(12, 24, 12, 24),
        accessibleLabel: null,
        trackingParams: null,
      } as Block;
    case 'divider':
      return {
        ...base,
        type,
        padding: spacing(8, 0, 8, 0),
        lineStyle: 'solid',
        thickness: 1,
        color: null,
        widthPct: 100,
        align: 'center' as Align,
      } as Block;
    case 'spacer':
      return { ...base, type, height: 24, mobileHeight: null } as Block;
    case 'quote':
      return {
        ...base,
        type,
        html: 'Quoted text',
        citation: null,
        accentColor: null,
        padding: spacing(8, 16, 8, 16),
        style: emptyTextStyle(),
      } as Block;
    case 'list':
      return { ...base, type, ordered: false, items: ['First item', 'Second item'], style: emptyTextStyle() } as Block;
    case 'table':
      return {
        ...base,
        type,
        rows: [
          {
            id: newId('trow'),
            cells: [
              { id: newId('tcel'), html: 'Header A', align: 'left' as Align, vAlign: 'middle', background: null },
              { id: newId('tcel'), html: 'Header B', align: 'left' as Align, vAlign: 'middle', background: null },
            ],
          },
          {
            id: newId('trow'),
            cells: [
              { id: newId('tcel'), html: 'Value A', align: 'left' as Align, vAlign: 'middle', background: null },
              { id: newId('tcel'), html: 'Value B', align: 'left' as Align, vAlign: 'middle', background: null },
            ],
          },
        ],
        headerRow: true,
        footerRow: false,
        cellPadding: spacing(8, 10, 8, 10),
        cellBorder: { style: 'solid', width: spacing(1), color: '#e5e7eb', radius: 0 },
        widthPct: 100,
        alternateRowColor: null,
        headerBackground: null,
        mobileStrategy: 'scroll',
        style: emptyTextStyle(),
      } as Block;
    case 'signature':
      return {
        ...base,
        type,
        html: '<p>Best regards,<br>Your name</p>',
        style: emptyTextStyle(),
      } as Block;
    case 'rawHtml':
      return { ...base, type, html: '<!-- Advanced HTML snippet -->' } as Block;
    case 'preformatted':
      return { ...base, type, text: 'Preformatted text', style: emptyTextStyle() } as Block;
    case 'social':
      return {
        ...base,
        type,
        links: [
          { id: newId('soc'), network: 'linkedin', url: 'https://www.linkedin.com/', label: 'LinkedIn', iconUrl: null },
          { id: newId('soc'), network: 'x', url: 'https://x.com/', label: 'X', iconUrl: null },
        ],
        iconSize: 24,
        gap: 12,
        align: 'center' as Align,
        showLabels: false,
      } as Block;
    case 'navLinks':
      return {
        ...base,
        type,
        items: [
          { id: newId('nav'), label: 'Home', link: { type: 'url', value: 'https://example.com', target: '_blank' } },
          { id: newId('nav'), label: 'Products', link: { type: 'url', value: 'https://example.com/products', target: '_blank' } },
        ],
        separator: '|',
        align: 'center' as Align,
        style: emptyTextStyle(),
      } as Block;
    case 'logo':
      return {
        ...base,
        type,
        src: '',
        alt: 'Organization logo',
        width: 160,
        align: 'left' as Align,
        link: null,
        useThemeLogo: true,
        themeVariant: 'primary',
      } as Block;
    case 'contactInfo':
      return {
        ...base,
        type,
        organizationName: '',
        addressLines: [],
        phone: null,
        email: null,
        website: null,
        useThemeAddress: true,
        align: 'center' as Align,
        style: emptyTextStyle(),
      } as Block;
    case 'viewInBrowser':
      return { ...base, type, label: 'View in browser', align: 'center' as Align, style: emptyTextStyle() } as Block;
    case 'unsubscribe':
      return { ...base, type, label: 'Unsubscribe', align: 'center' as Align, style: emptyTextStyle() } as Block;
    case 'preferenceCenter':
      return { ...base, type, label: 'Email preferences', align: 'center' as Align, style: emptyTextStyle() } as Block;
    case 'orgFooter':
      return { ...base, type, html: '', useThemeFooter: true, style: emptyTextStyle() } as Block;
    case 'legal':
      return { ...base, type, html: '', useThemeLegal: true, style: emptyTextStyle() } as Block;
    case 'videoThumb':
      return {
        ...base,
        type,
        thumbnailUrl: '',
        videoUrl: '',
        alt: 'Watch the video',
        width: null,
        align: 'center' as Align,
        showPlayBadge: true,
      } as Block;
    case 'mergeField':
      return {
        ...base,
        type,
        fieldKey: '',
        fallback: null,
        format: null,
        style: emptyTextStyle(),
        align: 'left' as Align,
      } as Block;
    case 'reusable':
      return { ...base, type, reusableCode: '', label: null, detachable: true } as Block;
    case 'conditional':
      return { ...base, type, label: 'Conditional content', blocks: [] } as Block;
    default: {
      const exhaustive: never = type;
      throw new Error(`Unhandled block type: ${String(exhaustive)}`);
    }
  }
}

export function createColumn(widthPct = 100, blocks: Block[] = []): Column {
  return {
    id: newId('col'),
    name: null,
    widthPct,
    minWidth: null,
    padding: spacing(0),
    background: inheritBackground(),
    border: noBorder(),
    vAlign: 'top',
    mobileOrder: null,
    keepSideBySideOnMobile: false,
    visibility: visibleEverywhere(),
    locked: false,
    blocks,
  };
}

export function createRow(columns?: Column[]): Row {
  return {
    id: newId('row'),
    name: null,
    columns: columns && columns.length ? columns : [createColumn(100)],
    gap: 16,
    vAlign: 'top',
    stackOnMobile: true,
    reverseOnMobile: false,
    visibility: visibleEverywhere(),
    padding: spacing(0),
    background: inheritBackground(),
    border: noBorder(),
    minHeight: null,
    locked: false,
  };
}

export function createSection(rows?: Row[], role: SectionRole = 'body'): Section {
  return {
    id: newId('sec'),
    name: null,
    role,
    rows: rows && rows.length ? rows : [createRow()],
    outerBackground: inheritBackground(),
    background: inheritBackground(),
    padding: spacing(24),
    border: noBorder(),
    contentWidth: null,
    align: 'left',
    vAlign: 'top',
    minHeight: null,
    visibility: visibleEverywhere(),
    locked: false,
  };
}

export function defaultDocumentSettings(): DocumentSettings {
  return {
    contentWidth: 640,
    minWidth: 320,
    maxWidth: 900,
    background: colorBackground('#ffffff'),
    outerBackground: colorBackground('#f4f5f7'),
    lang: 'en',
    direction: 'ltr',
  };
}

export function createEmptyDocument(): EmailDocument {
  return {
    version: DOCUMENT_VERSION,
    settings: defaultDocumentSettings(),
    themeId: null,
    themeOverrides: null,
    sections: [],
  };
}

export function createStarterDocument(): EmailDocument {
  const heading = createBlock('heading') as Extract<Block, { type: 'heading' }>;
  heading.html = 'Welcome';
  heading.level = 1;

  const intro = createBlock('text') as Extract<Block, { type: 'text' }>;
  intro.html = '<p>Start writing your message, or drag a block from the left panel.</p>';

  const cta = createBlock('button');

  const unsub = createBlock('unsubscribe');
  const footer = createBlock('orgFooter');

  const body = createSection([createRow([createColumn(100, [heading, intro, cta])])], 'body');
  const footerSection = createSection([createRow([createColumn(100, [footer, unsub])])], 'footer');
  footerSection.padding = spacing(16, 24, 24, 24);

  return {
    version: DOCUMENT_VERSION,
    settings: defaultDocumentSettings(),
    themeId: null,
    themeOverrides: null,
    sections: [body, footerSection],
  };
}

// ── Layout presets (spec 6.2) ─────────────────────────────────────────────────

export type LayoutPresetId =
  | 'one-column'
  | 'two-column'
  | 'three-column'
  | 'four-column'
  | 'sidebar-left'
  | 'sidebar-right'
  | 'image-left'
  | 'image-right'
  | 'hero'
  | 'header'
  | 'footer';

export interface LayoutPreset {
  id: LayoutPresetId;
  label: string;
  description: string;
  build: () => Section;
}

function textBlock(html: string): Block {
  const block = createBlock('text') as Extract<Block, { type: 'text' }>;
  block.html = html;
  return block;
}

function headingBlock(html: string, level: 1 | 2 | 3): Block {
  const block = createBlock('heading') as Extract<Block, { type: 'heading' }>;
  block.html = html;
  block.level = level;
  return block;
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: 'one-column',
    label: 'One column',
    description: 'Single full-width column.',
    build: () => createSection([createRow([createColumn(100, [textBlock('<p>Column content.</p>')])])]),
  },
  {
    id: 'two-column',
    label: 'Two columns',
    description: 'Equal halves that stack on mobile.',
    build: () =>
      createSection([
        createRow([
          createColumn(50, [textBlock('<p>Left column.</p>')]),
          createColumn(50, [textBlock('<p>Right column.</p>')]),
        ]),
      ]),
  },
  {
    id: 'three-column',
    label: 'Three columns',
    description: 'Three equal columns.',
    build: () =>
      createSection([
        createRow([
          createColumn(34, [textBlock('<p>One.</p>')]),
          createColumn(33, [textBlock('<p>Two.</p>')]),
          createColumn(33, [textBlock('<p>Three.</p>')]),
        ]),
      ]),
  },
  {
    id: 'four-column',
    label: 'Four columns',
    description: 'Four equal columns.',
    build: () =>
      createSection([
        createRow([
          createColumn(25, [textBlock('<p>One.</p>')]),
          createColumn(25, [textBlock('<p>Two.</p>')]),
          createColumn(25, [textBlock('<p>Three.</p>')]),
          createColumn(25, [textBlock('<p>Four.</p>')]),
        ]),
      ]),
  },
  {
    id: 'sidebar-left',
    label: 'Sidebar left',
    description: 'Narrow left column beside main content.',
    build: () =>
      createSection([
        createRow([
          createColumn(33, [textBlock('<p>Sidebar.</p>')]),
          createColumn(67, [textBlock('<p>Main content.</p>')]),
        ]),
      ]),
  },
  {
    id: 'sidebar-right',
    label: 'Sidebar right',
    description: 'Main content beside a narrow right column.',
    build: () =>
      createSection([
        createRow([
          createColumn(67, [textBlock('<p>Main content.</p>')]),
          createColumn(33, [textBlock('<p>Sidebar.</p>')]),
        ]),
      ]),
  },
  {
    id: 'image-left',
    label: 'Image left, text right',
    description: 'Media beside copy, stacking on mobile.',
    build: () =>
      createSection([
        createRow([
          createColumn(45, [createBlock('image')]),
          createColumn(55, [headingBlock('Headline', 3), textBlock('<p>Supporting copy.</p>')]),
        ]),
      ]),
  },
  {
    id: 'image-right',
    label: 'Text left, image right',
    description: 'Copy beside media, stacking on mobile.',
    build: () =>
      createSection([
        createRow([
          createColumn(55, [headingBlock('Headline', 3), textBlock('<p>Supporting copy.</p>')]),
          createColumn(45, [createBlock('image')]),
        ]),
      ]),
  },
  {
    id: 'hero',
    label: 'Hero',
    description: 'Large heading, supporting text and a call to action.',
    build: () => {
      const section = createSection([
        createRow([
          createColumn(100, [
            headingBlock('A clear, benefit-led headline', 1),
            textBlock('<p>One or two sentences that expand on the headline.</p>'),
            createBlock('button'),
          ]),
        ]),
      ]);
      section.padding = spacing(40, 24, 40, 24);
      section.align = 'center';
      return section;
    },
  },
  {
    id: 'header',
    label: 'Header',
    description: 'Logo with a view-in-browser link.',
    build: () => {
      const section = createSection(
        [
          createRow([
            createColumn(60, [createBlock('logo')]),
            createColumn(40, [createBlock('viewInBrowser')]),
          ]),
        ],
        'header'
      );
      section.padding = spacing(20, 24, 20, 24);
      return section;
    },
  },
  {
    id: 'footer',
    label: 'Footer',
    description: 'Organization details, social links and unsubscribe.',
    build: () => {
      const section = createSection(
        [
          createRow([
            createColumn(100, [
              createBlock('social'),
              createBlock('contactInfo'),
              createBlock('unsubscribe'),
              createBlock('legal'),
            ]),
          ]),
        ],
        'footer'
      );
      section.padding = spacing(24);
      return section;
    },
  },
];
