/**
 * The insertable content catalogue (spec 6).
 *
 * Grouped exactly as the panel presents it: basic blocks, layout presets and
 * email-specific blocks. Keywords drive the search box so authors can find a
 * block by what it does rather than only by its name.
 */

import type { ReactNode } from 'react';
import {
  AlignLeft,
  AtSign,
  Baseline,
  Braces,
  Building2,
  Code2,
  Columns2,
  Columns3,
  Columns4,
  ExternalLink,
  FileText,
  Frame,
  GitBranch,
  Heading,
  Image as ImageIcon,
  Images,
  Layout,
  LayoutPanelLeft,
  LayoutPanelTop,
  Library,
  Link2,
  List,
  Mail,
  MailX,
  Minus,
  MousePointerClick,
  MoveVertical,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PenLine,
  Quote,
  Scale,
  Share2,
  Sparkles,
  SquareStack,
  Table2,
  Type,
  Video,
} from 'lucide-react';
import type { BlockType } from '../model/document';
import type { LayoutPresetId } from '../model/defaults';
import type { PermissionKey } from '../api/types';

export interface BlockCatalogEntry {
  id: string;
  label: string;
  description: string;
  icon: ReactNode;
  keywords: string[];
  /** Either a single block or a whole section layout. */
  blockType?: BlockType;
  presetId?: LayoutPresetId;
  /** Marks entries that require an extra permission. */
  permission?: PermissionKey;
}

export interface BlockCatalogGroup {
  id: 'basic' | 'layout' | 'email';
  label: string;
  description: string;
  entries: BlockCatalogEntry[];
}

const size = 16;

export const BLOCK_CATALOG: BlockCatalogGroup[] = [
  {
    id: 'basic',
    label: 'Basic blocks',
    description: 'The building blocks of any email.',
    entries: [
      {
        id: 'text',
        blockType: 'text',
        label: 'Text',
        description: 'A paragraph of formatted copy.',
        icon: <Type size={size} />,
        keywords: ['paragraph', 'copy', 'body', 'rich text'],
      },
      {
        id: 'heading',
        blockType: 'heading',
        label: 'Heading',
        description: 'A section title, H1 to H6.',
        icon: <Heading size={size} />,
        keywords: ['title', 'h1', 'h2', 'subtitle'],
      },
      {
        id: 'image',
        blockType: 'image',
        label: 'Image',
        description: 'A picture with alt text and an optional link.',
        icon: <ImageIcon size={size} />,
        keywords: ['picture', 'photo', 'graphic', 'banner'],
      },
      {
        id: 'button',
        blockType: 'button',
        label: 'Button',
        description: 'A call-to-action that renders reliably in Outlook.',
        icon: <MousePointerClick size={size} />,
        keywords: ['cta', 'call to action', 'link button'],
      },
      {
        id: 'divider',
        blockType: 'divider',
        label: 'Divider',
        description: 'A horizontal rule between content.',
        icon: <Minus size={size} />,
        keywords: ['line', 'rule', 'separator', 'hr'],
      },
      {
        id: 'spacer',
        blockType: 'spacer',
        label: 'Spacer',
        description: 'Fixed vertical space with a mobile override.',
        icon: <MoveVertical size={size} />,
        keywords: ['gap', 'space', 'padding', 'whitespace'],
      },
      {
        id: 'quote',
        blockType: 'quote',
        label: 'Quote',
        description: 'A pull quote with an optional citation.',
        icon: <Quote size={size} />,
        keywords: ['blockquote', 'testimonial', 'citation'],
      },
      {
        id: 'list',
        blockType: 'list',
        label: 'List',
        description: 'A bulleted or numbered list.',
        icon: <List size={size} />,
        keywords: ['bullets', 'numbered', 'ul', 'ol'],
      },
      {
        id: 'table',
        blockType: 'table',
        label: 'Table',
        description: 'Tabular data with email-safe markup.',
        icon: <Table2 size={size} />,
        keywords: ['grid', 'rows', 'columns', 'data', 'order summary'],
      },
      {
        id: 'signature',
        blockType: 'signature',
        label: 'Signature',
        description: 'A sign-off block for the sender.',
        icon: <PenLine size={size} />,
        keywords: ['sign off', 'regards', 'sender'],
      },
      {
        id: 'preformatted',
        blockType: 'preformatted',
        label: 'Preformatted text',
        description: 'Monospaced text with whitespace preserved.',
        icon: <AlignLeft size={size} />,
        keywords: ['pre', 'monospace', 'code sample'],
      },
      {
        id: 'rawHtml',
        blockType: 'rawHtml',
        label: 'Raw HTML',
        description: 'An isolated, sanitized HTML snippet.',
        icon: <Code2 size={size} />,
        keywords: ['html', 'snippet', 'custom', 'embed'],
        permission: 'insert_raw_html',
      },
    ],
  },
  {
    id: 'layout',
    label: 'Layouts',
    description: 'Column structures added as a new section.',
    entries: [
      {
        id: 'one-column',
        presetId: 'one-column',
        label: 'One column',
        description: 'A single full-width column.',
        icon: <Frame size={size} />,
        keywords: ['single', 'full width', '1 column'],
      },
      {
        id: 'two-column',
        presetId: 'two-column',
        label: 'Two columns',
        description: 'Equal halves that stack on mobile.',
        icon: <Columns2 size={size} />,
        keywords: ['50 50', 'halves', '2 column'],
      },
      {
        id: 'three-column',
        presetId: 'three-column',
        label: 'Three columns',
        description: 'Three equal columns.',
        icon: <Columns3 size={size} />,
        keywords: ['thirds', '3 column'],
      },
      {
        id: 'four-column',
        presetId: 'four-column',
        label: 'Four columns',
        description: 'Four equal columns.',
        icon: <Columns4 size={size} />,
        keywords: ['quarters', '4 column'],
      },
      {
        id: 'sidebar-left',
        presetId: 'sidebar-left',
        label: 'Sidebar left',
        description: 'A narrow left column beside the main content.',
        icon: <PanelLeft size={size} />,
        keywords: ['33 67', 'aside'],
      },
      {
        id: 'sidebar-right',
        presetId: 'sidebar-right',
        label: 'Sidebar right',
        description: 'Main content beside a narrow right column.',
        icon: <PanelRight size={size} />,
        keywords: ['67 33', 'aside'],
      },
      {
        id: 'image-left',
        presetId: 'image-left',
        label: 'Image left, text right',
        description: 'Media beside copy.',
        icon: <LayoutPanelLeft size={size} />,
        keywords: ['media', 'article', 'card'],
      },
      {
        id: 'image-right',
        presetId: 'image-right',
        label: 'Text left, image right',
        description: 'Copy beside media.',
        icon: <Images size={size} />,
        keywords: ['media', 'article', 'card'],
      },
      {
        id: 'hero',
        presetId: 'hero',
        label: 'Hero',
        description: 'Headline, supporting copy and a call to action.',
        icon: <Sparkles size={size} />,
        keywords: ['banner', 'top', 'intro'],
      },
      {
        id: 'header',
        presetId: 'header',
        label: 'Header',
        description: 'Logo with a view-in-browser link.',
        icon: <LayoutPanelTop size={size} />,
        keywords: ['top', 'masthead', 'brand'],
      },
      {
        id: 'footer',
        presetId: 'footer',
        label: 'Footer',
        description: 'Organization details, social links and unsubscribe.',
        icon: <PanelBottom size={size} />,
        keywords: ['bottom', 'legal', 'compliance'],
      },
    ],
  },
  {
    id: 'email',
    label: 'Email blocks',
    description: 'Blocks that exist because email needs them.',
    entries: [
      {
        id: 'logo',
        blockType: 'logo',
        label: 'Logo',
        description: 'Brand logo pulled from the theme.',
        icon: <Layout size={size} />,
        keywords: ['brand', 'mark', 'identity'],
      },
      {
        id: 'social',
        blockType: 'social',
        label: 'Social links',
        description: 'Icon row linking to your channels.',
        icon: <Share2 size={size} />,
        keywords: ['linkedin', 'facebook', 'instagram', 'x', 'twitter'],
      },
      {
        id: 'navLinks',
        blockType: 'navLinks',
        label: 'Navigation links',
        description: 'A row of separated text links.',
        icon: <Link2 size={size} />,
        keywords: ['menu', 'nav', 'links'],
      },
      {
        id: 'contactInfo',
        blockType: 'contactInfo',
        label: 'Contact information',
        description: 'Organization name, address and contact details.',
        icon: <Building2 size={size} />,
        keywords: ['address', 'phone', 'postal', 'can-spam'],
      },
      {
        id: 'viewInBrowser',
        blockType: 'viewInBrowser',
        label: 'View in browser',
        description: 'System link to the hosted version.',
        icon: <ExternalLink size={size} />,
        keywords: ['web version', 'browser', 'online'],
      },
      {
        id: 'unsubscribe',
        blockType: 'unsubscribe',
        label: 'Unsubscribe link',
        description: 'Required opt-out link.',
        icon: <MailX size={size} />,
        keywords: ['opt out', 'compliance', 'can-spam', 'gdpr'],
      },
      {
        id: 'preferenceCenter',
        blockType: 'preferenceCenter',
        label: 'Preference centre',
        description: 'Link to manage subscription preferences.',
        icon: <Mail size={size} />,
        keywords: ['preferences', 'subscription', 'manage'],
      },
      {
        id: 'orgFooter',
        blockType: 'orgFooter',
        label: 'Organization footer',
        description: 'Standard footer from your theme.',
        icon: <FileText size={size} />,
        keywords: ['footer', 'standard', 'boilerplate'],
      },
      {
        id: 'legal',
        blockType: 'legal',
        label: 'Legal disclaimer',
        description: 'Small-print legal text.',
        icon: <Scale size={size} />,
        keywords: ['disclaimer', 'terms', 'legal', 'small print'],
      },
      {
        id: 'videoThumb',
        blockType: 'videoThumb',
        label: 'Video thumbnail',
        description: 'A clickable still image with a play badge.',
        icon: <Video size={size} />,
        keywords: ['youtube', 'vimeo', 'play', 'watch'],
      },
      {
        id: 'mergeField',
        blockType: 'mergeField',
        label: 'Merge field',
        description: 'A standalone personalization value.',
        icon: <Braces size={size} />,
        keywords: ['personalization', 'variable', 'placeholder', 'token'],
      },
      {
        id: 'reusable',
        blockType: 'reusable',
        label: 'Reusable block',
        description: 'A reference to saved content.',
        icon: <Library size={size} />,
        keywords: ['saved', 'library', 'shared', 'snippet'],
      },
      {
        id: 'conditional',
        blockType: 'conditional',
        label: 'Conditional content',
        description: 'A container shown only when a rule matches.',
        icon: <GitBranch size={size} />,
        keywords: ['rule', 'if', 'segment', 'variant'],
      },
    ],
  },
];

/** Extra icons re-exported for panels that show block types outside the catalogue. */
export const MISC_ICONS = {
  baseline: <Baseline size={size} />,
  atSign: <AtSign size={size} />,
  stack: <SquareStack size={size} />,
};

export function searchCatalog(term: string): BlockCatalogGroup[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return BLOCK_CATALOG;
  return BLOCK_CATALOG.map(group => ({
    ...group,
    entries: group.entries.filter(entry => {
      if (entry.label.toLowerCase().includes(needle)) return true;
      if (entry.description.toLowerCase().includes(needle)) return true;
      return entry.keywords.some(keyword => keyword.includes(needle));
    }),
  })).filter(group => group.entries.length > 0);
}
