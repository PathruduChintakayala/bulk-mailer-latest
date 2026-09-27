/**
 * Canonical EmailDocument model.
 *
 * This file is the single source of truth for the visual document shape and is
 * mirrored by backend/app/services/composer/document.py. Any change here must be
 * applied there too, and the golden fixtures re-generated.
 */

export const DOCUMENT_VERSION = 1;

export type Direction = 'ltr' | 'rtl';
export type Align = 'left' | 'center' | 'right' | 'justify';
export type VAlign = 'top' | 'middle' | 'bottom';
export type BorderStyle = 'none' | 'solid' | 'dashed' | 'dotted' | 'double';

export interface Spacing {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Border {
  style: BorderStyle;
  /** Per-side widths in px, giving individual side control. */
  width: Spacing;
  color: string;
  radius: number;
}

export type BackgroundMode = 'inherit' | 'transparent' | 'color' | 'image';

export interface Background {
  mode: BackgroundMode;
  color?: string;
  imageUrl?: string;
  imagePosition?: string;
  imageRepeat?: 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y';
  imageSize?: 'auto' | 'cover' | 'contain';
  /** Shown by clients that drop background images. */
  fallbackColor?: string;
}

export interface Visibility {
  desktop: boolean;
  mobile: boolean;
}

export interface MobileOverrides {
  padding?: Spacing | null;
  align?: Align | null;
  fontSize?: number | null;
  /** Width in px, or 'full' for 100%. */
  width?: number | 'full' | null;
}

// ── Text styling ──────────────────────────────────────────────────────────────

export type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize';

export interface TextStyle {
  fontFamily?: string | null;
  fontSize?: number | null;
  fontWeight?: number | null;
  lineHeight?: number | null;
  letterSpacing?: number | null;
  color?: string | null;
  textTransform?: TextTransform | null;
  align?: Align | null;
  direction?: Direction | null;
}

// ── Links ─────────────────────────────────────────────────────────────────────

export type LinkType =
  | 'url'
  | 'email'
  | 'tel'
  | 'unsubscribe'
  | 'preferences'
  | 'view_in_browser'
  | 'merge';

export interface LinkSpec {
  type: LinkType;
  /** Raw href for `url`, address for `email`, number for `tel`, expression for `merge`. */
  value: string;
  title?: string | null;
  target?: '_blank' | '_self';
  trackingEnabled?: boolean;
}

// ── Blocks ────────────────────────────────────────────────────────────────────

export type BlockType =
  // basic
  | 'text'
  | 'heading'
  | 'image'
  | 'button'
  | 'divider'
  | 'spacer'
  | 'quote'
  | 'list'
  | 'table'
  | 'signature'
  | 'rawHtml'
  | 'preformatted'
  // email-specific
  | 'social'
  | 'navLinks'
  | 'logo'
  | 'contactInfo'
  | 'viewInBrowser'
  | 'unsubscribe'
  | 'preferenceCenter'
  | 'orgFooter'
  | 'legal'
  | 'videoThumb'
  | 'mergeField'
  | 'reusable'
  | 'conditional';

export interface BlockBase {
  id: string;
  type: BlockType;
  /** User-facing label shown in the Layers panel. */
  name?: string | null;
  locked?: boolean;
  visibility: Visibility;
  padding: Spacing;
  background: Background;
  border: Border;
  mobile?: MobileOverrides | null;
}

export interface TextBlock extends BlockBase {
  type: 'text';
  /** Sanitized inline HTML produced by the scoped rich-text editor. */
  html: string;
  style: TextStyle;
}

export interface HeadingBlock extends BlockBase {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  html: string;
  style: TextStyle;
}

export type ImageFit = 'none' | 'fit' | 'fill';

export interface ImageBlock extends BlockBase {
  type: 'image';
  src: string;
  alt: string;
  title?: string | null;
  width?: number | null;
  height?: number | null;
  maxWidth?: number | null;
  lockAspect: boolean;
  naturalWidth?: number | null;
  naturalHeight?: number | null;
  fit: ImageFit;
  align: Align;
  link?: LinkSpec | null;
  assetCode?: string | null;
}

export interface ButtonBlock extends BlockBase {
  type: 'button';
  text: string;
  link: LinkSpec;
  align: Align;
  fullWidth: boolean;
  width?: number | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  style: TextStyle;
  innerPadding: Spacing;
  accessibleLabel?: string | null;
  trackingParams?: Record<string, string> | null;
}

export interface DividerBlock extends BlockBase {
  type: 'divider';
  lineStyle: Exclude<BorderStyle, 'none'>;
  thickness: number;
  color?: string | null;
  widthPct: number;
  align: Align;
}

export interface SpacerBlock extends BlockBase {
  type: 'spacer';
  height: number;
  mobileHeight?: number | null;
}

export interface QuoteBlock extends BlockBase {
  type: 'quote';
  html: string;
  citation?: string | null;
  accentColor?: string | null;
  style: TextStyle;
}

export interface ListBlock extends BlockBase {
  type: 'list';
  ordered: boolean;
  items: string[];
  style: TextStyle;
}

export interface TableCell {
  id: string;
  html: string;
  align: Align;
  vAlign: VAlign;
  background?: string | null;
  colSpan?: number;
  rowSpan?: number;
}

export interface TableRowData {
  id: string;
  cells: TableCell[];
}

export interface TableBlock extends BlockBase {
  type: 'table';
  rows: TableRowData[];
  headerRow: boolean;
  footerRow: boolean;
  cellPadding: Spacing;
  cellBorder: Border;
  widthPct: number;
  alternateRowColor?: string | null;
  headerBackground?: string | null;
  /** How the table behaves on narrow screens. */
  mobileStrategy: 'scroll' | 'stack';
  style: TextStyle;
}

export interface SignatureBlock extends BlockBase {
  type: 'signature';
  html: string;
  style: TextStyle;
}

export interface RawHtmlBlock extends BlockBase {
  type: 'rawHtml';
  html: string;
}

export interface PreformattedBlock extends BlockBase {
  type: 'preformatted';
  text: string;
  style: TextStyle;
}

export interface SocialLink {
  id: string;
  network: string;
  url: string;
  label: string;
  iconUrl?: string | null;
}

export interface SocialBlock extends BlockBase {
  type: 'social';
  links: SocialLink[];
  iconSize: number;
  gap: number;
  align: Align;
  showLabels: boolean;
}

export interface NavLinkItem {
  id: string;
  label: string;
  link: LinkSpec;
}

export interface NavLinksBlock extends BlockBase {
  type: 'navLinks';
  items: NavLinkItem[];
  separator: string;
  align: Align;
  style: TextStyle;
}

export interface LogoBlock extends BlockBase {
  type: 'logo';
  src: string;
  alt: string;
  width?: number | null;
  align: Align;
  link?: LinkSpec | null;
  /** Pull the image from theme brand assets instead of `src`. */
  useThemeLogo: boolean;
  themeVariant: 'primary' | 'secondary' | 'dark';
}

export interface ContactInfoBlock extends BlockBase {
  type: 'contactInfo';
  organizationName: string;
  addressLines: string[];
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  useThemeAddress: boolean;
  align: Align;
  style: TextStyle;
}

export interface SystemLinkBlock extends BlockBase {
  type: 'viewInBrowser' | 'unsubscribe' | 'preferenceCenter';
  label: string;
  align: Align;
  style: TextStyle;
}

export interface OrgFooterBlock extends BlockBase {
  type: 'orgFooter';
  /** Empty means "use the theme's standard footer". */
  html: string;
  useThemeFooter: boolean;
  style: TextStyle;
}

export interface LegalBlock extends BlockBase {
  type: 'legal';
  html: string;
  useThemeLegal: boolean;
  style: TextStyle;
}

export interface VideoThumbBlock extends BlockBase {
  type: 'videoThumb';
  thumbnailUrl: string;
  videoUrl: string;
  alt: string;
  width?: number | null;
  align: Align;
  showPlayBadge: boolean;
}

export interface MergeFieldBlock extends BlockBase {
  type: 'mergeField';
  fieldKey: string;
  fallback?: string | null;
  format?: string | null;
  style: TextStyle;
  align: Align;
}

export interface ReusableBlockRef extends BlockBase {
  type: 'reusable';
  reusableCode: string;
  /** Cached label so the canvas can render before the library loads. */
  label?: string | null;
  /** Locked org blocks cannot be detached. */
  detachable: boolean;
}

export interface ConditionalBlock extends BlockBase {
  type: 'conditional';
  /** Placeholder container; evaluation is not implemented yet. */
  label: string;
  blocks: Block[];
}

export type Block =
  | TextBlock
  | HeadingBlock
  | ImageBlock
  | ButtonBlock
  | DividerBlock
  | SpacerBlock
  | QuoteBlock
  | ListBlock
  | TableBlock
  | SignatureBlock
  | RawHtmlBlock
  | PreformattedBlock
  | SocialBlock
  | NavLinksBlock
  | LogoBlock
  | ContactInfoBlock
  | SystemLinkBlock
  | OrgFooterBlock
  | LegalBlock
  | VideoThumbBlock
  | MergeFieldBlock
  | ReusableBlockRef
  | ConditionalBlock;

// ── Structure ─────────────────────────────────────────────────────────────────

export interface Column {
  id: string;
  name?: string | null;
  widthPct: number;
  minWidth?: number | null;
  padding: Spacing;
  background: Background;
  border: Border;
  vAlign: VAlign;
  /** 1-based stacking position on mobile; null keeps document order. */
  mobileOrder?: number | null;
  keepSideBySideOnMobile: boolean;
  visibility: Visibility;
  locked?: boolean;
  blocks: Block[];
}

export interface Row {
  id: string;
  name?: string | null;
  columns: Column[];
  gap: number;
  vAlign: VAlign;
  stackOnMobile: boolean;
  reverseOnMobile: boolean;
  visibility: Visibility;
  padding: Spacing;
  background: Background;
  border: Border;
  minHeight?: number | null;
  locked?: boolean;
}

export type SectionRole = 'header' | 'body' | 'footer';

export interface Section {
  id: string;
  name?: string | null;
  role: SectionRole;
  rows: Row[];
  /** Edge-to-edge background behind the contained content. */
  outerBackground: Background;
  background: Background;
  padding: Spacing;
  border: Border;
  /** null inherits the document content width. */
  contentWidth?: number | null;
  align: Align;
  vAlign: VAlign;
  minHeight?: number | null;
  visibility: Visibility;
  locked?: boolean;
}

export interface DocumentSettings {
  contentWidth: number;
  minWidth: number;
  maxWidth: number;
  background: Background;
  outerBackground: Background;
  lang: string;
  direction: Direction;
}

export interface EmailDocument {
  version: number;
  settings: DocumentSettings;
  themeId?: string | null;
  themeOverrides?: Record<string, unknown> | null;
  sections: Section[];
}

// ── Selection & addressing ────────────────────────────────────────────────────

export type NodeKind = 'document' | 'section' | 'row' | 'column' | 'block';

export interface NodePath {
  kind: NodeKind;
  id: string;
  sectionId?: string;
  rowId?: string;
  columnId?: string;
  /** Ancestor block ids for nested containers (conditional blocks). */
  blockTrail?: string[];
}

export type AnyNode = EmailDocument | Section | Row | Column | Block;

export function isBlock(node: AnyNode): node is Block {
  return typeof (node as Block).type === 'string' && !('sections' in node) && !('rows' in node) && !('columns' in node);
}

export function blockSupportsRichText(type: BlockType): boolean {
  return (
    type === 'text' ||
    type === 'heading' ||
    type === 'quote' ||
    type === 'signature' ||
    type === 'orgFooter' ||
    type === 'legal'
  );
}

export function blockSupportsAlign(type: BlockType): boolean {
  return (
    type === 'image' ||
    type === 'button' ||
    type === 'divider' ||
    type === 'social' ||
    type === 'navLinks' ||
    type === 'logo' ||
    type === 'contactInfo' ||
    type === 'videoThumb' ||
    type === 'mergeField' ||
    type === 'viewInBrowser' ||
    type === 'unsubscribe' ||
    type === 'preferenceCenter'
  );
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  text: 'Text',
  heading: 'Heading',
  image: 'Image',
  button: 'Button',
  divider: 'Divider',
  spacer: 'Spacer',
  quote: 'Quote',
  list: 'List',
  table: 'Table',
  signature: 'Signature',
  rawHtml: 'Raw HTML',
  preformatted: 'Preformatted text',
  social: 'Social links',
  navLinks: 'Navigation links',
  logo: 'Logo',
  contactInfo: 'Contact information',
  viewInBrowser: 'View in browser',
  unsubscribe: 'Unsubscribe link',
  preferenceCenter: 'Preference center',
  orgFooter: 'Organization footer',
  legal: 'Legal disclaimer',
  videoThumb: 'Video thumbnail',
  mergeField: 'Merge field',
  reusable: 'Reusable block',
  conditional: 'Conditional content',
};
