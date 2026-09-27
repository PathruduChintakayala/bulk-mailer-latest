/**
 * Canvas rendering for every block type.
 *
 * Styles are derived from the same properties the backend compiler reads, so what
 * the author sees closely matches the sent email. The compiler stays authoritative;
 * this is a faithful preview that also accepts direct editing.
 */

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import {
  AlertTriangle,
  Code2,
  Facebook,
  Globe,
  Image as ImageIcon,
  Instagram,
  Layers,
  Linkedin,
  Link as LinkIcon,
  Play,
  Youtube,
} from 'lucide-react';
import type {
  Block,
  ButtonBlock,
  ContactInfoBlock,
  DividerBlock,
  HeadingBlock,
  ImageBlock,
  LegalBlock,
  ListBlock,
  LogoBlock,
  MergeFieldBlock,
  NavLinksBlock,
  OrgFooterBlock,
  PreformattedBlock,
  QuoteBlock,
  RawHtmlBlock,
  ReusableBlockRef,
  SignatureBlock,
  SocialBlock,
  SpacerBlock,
  SystemLinkBlock,
  TableBlock,
  TextBlock,
  VideoThumbBlock,
} from '../model/document';
import type { ThemeTokens } from '../model/theme';
import { RichTextStatic, RichTextSurface } from './RichText';
import {
  alignToMargin,
  backgroundCss,
  borderCss,
  decorateMergeTokens,
  describeLink,
  isSafeUrl,
  linkHref,
  mergeExpression,
  px,
  spacingCss,
  textCss,
} from './styles';

export interface BlockViewProps {
  block: Block;
  tokens: ThemeTokens;
  /** Non-null when this block is the one currently in edit mode. */
  editor?: Editor | null;
  editing?: boolean;
  /** Mobile canvas rendering applies mobile overrides and stacking. */
  surface?: 'desktop' | 'mobile';
}

const SOCIAL_ICONS: Record<string, ReactNode> = {
  linkedin: <Linkedin size={16} />,
  facebook: <Facebook size={16} />,
  instagram: <Instagram size={16} />,
  youtube: <Youtube size={16} />,
  x: <span className="text-[13px] font-bold leading-none">X</span>,
  twitter: <span className="text-[13px] font-bold leading-none">X</span>,
};

export function BlockView({ block, tokens, editor, editing, surface = 'desktop' }: BlockViewProps) {
  const mobile = surface === 'mobile' ? block.mobile : null;
  const padding = mobile?.padding || block.padding;

  const wrapperStyle: CSSProperties = {
    padding: spacingCss(padding),
    ...backgroundCss(block.background),
    ...borderCss(block.border),
  };

  return (
    <div style={wrapperStyle} data-block-type={block.type}>
      <BlockBody block={block} tokens={tokens} editor={editor} editing={editing} surface={surface} />
    </div>
  );
}

function BlockBody({ block, tokens, editor, editing, surface }: BlockViewProps) {
  switch (block.type) {
    case 'text':
      return <TextBody block={block} tokens={tokens} editor={editor} editing={editing} />;
    case 'heading':
      return <HeadingBody block={block} tokens={tokens} editor={editor} editing={editing} />;
    case 'image':
      return <ImageBody block={block} surface={surface} />;
    case 'button':
      return <ButtonBody block={block} tokens={tokens} surface={surface} />;
    case 'divider':
      return <DividerBody block={block} tokens={tokens} />;
    case 'spacer':
      return <SpacerBody block={block} surface={surface} />;
    case 'quote':
      return <QuoteBody block={block} tokens={tokens} editor={editor} editing={editing} />;
    case 'list':
      return <ListBody block={block} tokens={tokens} />;
    case 'table':
      return <TableBody block={block} tokens={tokens} />;
    case 'signature':
      return <SignatureBody block={block} tokens={tokens} editor={editor} editing={editing} />;
    case 'rawHtml':
      return <RawHtmlBody block={block} />;
    case 'preformatted':
      return <PreformattedBody block={block} tokens={tokens} />;
    case 'social':
      return <SocialBody block={block} tokens={tokens} />;
    case 'navLinks':
      return <NavLinksBody block={block} tokens={tokens} />;
    case 'logo':
      return <LogoBody block={block} tokens={tokens} />;
    case 'contactInfo':
      return <ContactInfoBody block={block} tokens={tokens} />;
    case 'viewInBrowser':
    case 'unsubscribe':
    case 'preferenceCenter':
      return <SystemLinkBody block={block} tokens={tokens} />;
    case 'orgFooter':
      return <OrgFooterBody block={block} tokens={tokens} editor={editor} editing={editing} />;
    case 'legal':
      return <LegalBody block={block} tokens={tokens} editor={editor} editing={editing} />;
    case 'videoThumb':
      return <VideoThumbBody block={block} tokens={tokens} />;
    case 'mergeField':
      return <MergeFieldBody block={block} tokens={tokens} />;
    case 'reusable':
      return <ReusableBody block={block} />;
    case 'conditional':
      return <ConditionalBody block={block} tokens={tokens} />;
    default:
      return null;
  }
}

// ── shared pieces ─────────────────────────────────────────────────────────────

function EditableRichText({
  html,
  style,
  editor,
  editing,
  emptyLabel,
}: {
  html: string;
  style: CSSProperties;
  editor?: Editor | null;
  editing?: boolean;
  emptyLabel: string;
}) {
  if (editing && editor) {
    return <RichTextSurface editor={editor} style={style} className="cn-richtext-host" />;
  }
  if (!html || !stripTags(html)) {
    return (
      <div style={{ ...style, color: '#9ca3af', fontStyle: 'italic' }}>{emptyLabel}</div>
    );
  }
  return <RichTextStatic html={html} style={style} />;
}

function stripTags(html: string): string {
  return String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function PlaceholderTile({
  icon,
  title,
  hint,
  height = 120,
  tone = 'gray',
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  height?: number;
  tone?: 'gray' | 'amber';
}) {
  return (
    <div
      className={
        tone === 'amber'
          ? 'flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-amber-300 bg-amber-50/70 px-3 text-center'
          : 'flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 text-center'
      }
      style={{ minHeight: height }}
    >
      <span className={tone === 'amber' ? 'text-amber-500' : 'text-gray-400'}>{icon}</span>
      <span className={tone === 'amber' ? 'text-[12px] font-medium text-amber-800' : 'text-[12px] font-medium text-gray-600'}>
        {title}
      </span>
      {hint && <span className="text-[11px] text-gray-500">{hint}</span>}
    </div>
  );
}

// ── basic blocks ──────────────────────────────────────────────────────────────

function TextBody({
  block,
  tokens,
  editor,
  editing,
}: {
  block: TextBlock;
  tokens: ThemeTokens;
  editor?: Editor | null;
  editing?: boolean;
}) {
  const style = textCss(block.style, tokens);
  return <EditableRichText html={block.html} style={style} editor={editor} editing={editing} emptyLabel="Empty text block" />;
}

function HeadingBody({
  block,
  tokens,
  editor,
  editing,
}: {
  block: HeadingBlock;
  tokens: ThemeTokens;
  editor?: Editor | null;
  editing?: boolean;
}) {
  const style = { ...textCss(block.style, tokens, { kind: 'heading', level: block.level }), margin: 0 };
  return <EditableRichText html={block.html} style={style} editor={editor} editing={editing} emptyLabel="Empty heading" />;
}

function ImageBody({ block, surface }: { block: ImageBlock; surface?: 'desktop' | 'mobile' }) {
  const mobileWidth = surface === 'mobile' ? block.mobile?.width : null;
  if (!block.src || !isSafeUrl(block.src)) {
    return (
      <div style={alignToMargin(block.align)}>
        <PlaceholderTile icon={<ImageIcon size={22} />} title="No image selected" hint="Choose an image or paste a URL." />
      </div>
    );
  }
  const width = mobileWidth === 'full' ? '100%' : mobileWidth ? px(mobileWidth) : block.width ? px(block.width) : '100%';
  const style: CSSProperties = {
    display: 'block',
    width,
    maxWidth: block.maxWidth ? px(block.maxWidth) : '100%',
    height: block.fit === 'fill' && block.height ? px(block.height) : 'auto',
    objectFit: block.fit === 'fill' ? 'cover' : undefined,
    border: 0,
    ...alignToMargin(block.align),
  };
  const image = <img src={block.src} alt={block.alt || ''} title={block.title || undefined} style={style} draggable={false} />;
  const href = linkHref(block.link);
  if (href) {
    return (
      <span className="relative block">
        {image}
        <span className="pointer-events-none absolute right-1 top-1 rounded bg-black/55 px-1 py-0.5 text-[10px] text-white">
          <LinkIcon size={9} className="mr-0.5 inline" />
          Linked
        </span>
      </span>
    );
  }
  return image;
}

function ButtonBody({ block, tokens, surface }: { block: ButtonBlock; tokens: ThemeTokens; surface?: 'desktop' | 'mobile' }) {
  const mobileWidth = surface === 'mobile' ? block.mobile?.width : null;
  const fullWidth = block.fullWidth || mobileWidth === 'full';
  const style: CSSProperties = {
    display: 'inline-block',
    backgroundColor: block.backgroundColor || tokens.buttonBackground,
    color: block.textColor || tokens.buttonTextColor,
    padding: spacingCss(block.innerPadding),
    borderRadius: px(tokens.buttonRadius),
    textDecoration: 'none',
    textAlign: 'center',
    ...textCss(block.style, tokens),
    ...borderCss(block.border),
  };
  style.color = block.textColor || tokens.buttonTextColor;
  if (fullWidth) style.width = '100%';
  else if (typeof mobileWidth === 'number') style.width = px(mobileWidth);
  else if (block.width) style.width = px(block.width);

  const align = block.align;
  const warning = !linkHref(block.link);

  return (
    <div style={{ textAlign: align }}>
      <span style={style} role="link" aria-label={block.accessibleLabel || block.text}>
        {block.text || 'Button text'}
      </span>
      {warning && (
        <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-700">
          <AlertTriangle size={11} />
          {describeLink(block.link)}
        </div>
      )}
    </div>
  );
}

function DividerBody({ block, tokens }: { block: DividerBlock; tokens: ThemeTokens }) {
  const line: CSSProperties = {
    borderTopWidth: px(block.thickness),
    borderTopStyle: block.lineStyle,
    borderTopColor: block.color || tokens.dividerColor,
    width: `${block.widthPct}%`,
    margin: 0,
    ...alignToMargin(block.align),
  };
  return <hr style={line} />;
}

function SpacerBody({ block, surface }: { block: SpacerBlock; surface?: 'desktop' | 'mobile' }) {
  const height = surface === 'mobile' && block.mobileHeight ? block.mobileHeight : block.height;
  return (
    <div
      style={{ height: px(height) }}
      className="relative rounded bg-[repeating-linear-gradient(45deg,#f3f4f6_0,#f3f4f6_6px,transparent_6px,transparent_12px)]"
      aria-hidden="true"
    >
      <span className="absolute right-1 top-0 text-[10px] leading-none text-gray-400">{height}px</span>
    </div>
  );
}

function QuoteBody({
  block,
  tokens,
  editor,
  editing,
}: {
  block: QuoteBlock;
  tokens: ThemeTokens;
  editor?: Editor | null;
  editing?: boolean;
}) {
  const style: CSSProperties = {
    ...textCss(block.style, tokens),
    borderLeft: `3px solid ${block.accentColor || tokens.primaryColor}`,
    paddingLeft: px(12),
    fontStyle: 'italic',
    margin: 0,
  };
  return (
    <blockquote style={style}>
      <EditableRichText html={block.html} style={{}} editor={editor} editing={editing} emptyLabel="Empty quote" />
      {block.citation && (
        <cite style={{ display: 'block', marginTop: 6, fontSize: px(13), color: tokens.mutedTextColor, fontStyle: 'normal' }}>
          — {block.citation}
        </cite>
      )}
    </blockquote>
  );
}

function ListBody({ block, tokens }: { block: ListBlock; tokens: ThemeTokens }) {
  const style: CSSProperties = { ...textCss(block.style, tokens), margin: 0, paddingLeft: px(22) };
  const items = block.items.length ? block.items : ['List item'];
  const content = items.map((item, index) => (
    <li key={index} dangerouslySetInnerHTML={{ __html: decorateMergeTokens(item) }} />
  ));
  return block.ordered ? <ol style={style}>{content}</ol> : <ul style={style}>{content}</ul>;
}

function TableBody({ block, tokens }: { block: TableBlock; tokens: ThemeTokens }) {
  const cellStyle = (background?: string | null): CSSProperties => ({
    padding: spacingCss(block.cellPadding),
    ...borderCss(block.cellBorder),
    backgroundColor: background || undefined,
  });
  const lastIndex = block.rows.length - 1;
  return (
    <table
      style={{
        width: `${block.widthPct}%`,
        borderCollapse: 'collapse',
        ...textCss(block.style, tokens),
      }}
    >
      <tbody>
        {block.rows.map((row, rowIndex) => {
          const isHeader = block.headerRow && rowIndex === 0;
          const isFooter = block.footerRow && rowIndex === lastIndex && lastIndex > 0;
          const alternate =
            block.alternateRowColor && !isHeader && !isFooter && (rowIndex - (block.headerRow ? 1 : 0)) % 2 === 1
              ? block.alternateRowColor
              : null;
          return (
            <tr key={row.id}>
              {row.cells.map(cell => {
                const Tag = isHeader ? 'th' : 'td';
                return (
                  <Tag
                    key={cell.id}
                    colSpan={cell.colSpan && cell.colSpan > 1 ? cell.colSpan : undefined}
                    rowSpan={cell.rowSpan && cell.rowSpan > 1 ? cell.rowSpan : undefined}
                    style={{
                      ...cellStyle(cell.background || alternate || (isHeader ? block.headerBackground : null)),
                      textAlign: cell.align,
                      verticalAlign: cell.vAlign,
                      fontWeight: isHeader || isFooter ? 700 : undefined,
                    }}
                    dangerouslySetInnerHTML={{ __html: decorateMergeTokens(cell.html || '&nbsp;') }}
                  />
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SignatureBody({
  block,
  tokens,
  editor,
  editing,
}: {
  block: SignatureBlock;
  tokens: ThemeTokens;
  editor?: Editor | null;
  editing?: boolean;
}) {
  return (
    <EditableRichText
      html={block.html}
      style={textCss(block.style, tokens)}
      editor={editor}
      editing={editing}
      emptyLabel="Empty signature"
    />
  );
}

function RawHtmlBody({ block }: { block: RawHtmlBlock }) {
  const preview = useMemo(() => stripTags(block.html).slice(0, 140), [block.html]);
  return (
    <div className="rounded-lg border border-dashed border-accent-300 bg-accent-50/60 p-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent-700">
        <Code2 size={12} />
        Raw HTML
      </div>
      <p className="line-clamp-3 break-words font-mono text-[11px] leading-relaxed text-accent-900/80">
        {preview || 'Empty snippet. Double-click to edit.'}
      </p>
    </div>
  );
}

function PreformattedBody({ block, tokens }: { block: PreformattedBlock; tokens: ThemeTokens }) {
  return (
    <pre
      style={{
        ...textCss(block.style, tokens),
        fontFamily: "'Courier New', Courier, monospace",
        whiteSpace: 'pre-wrap',
        margin: 0,
      }}
    >
      {block.text || 'Preformatted text'}
    </pre>
  );
}

// ── email-specific blocks ─────────────────────────────────────────────────────

function SocialBody({ block, tokens }: { block: SocialBlock; tokens: ThemeTokens }) {
  if (!block.links.length) {
    return <PlaceholderTile icon={<Globe size={18} />} title="No social links yet" height={64} />;
  }
  return (
    <div style={{ textAlign: block.align }}>
      {block.links.map(link => (
        <span key={link.id} style={{ display: 'inline-block', marginRight: px(block.gap), verticalAlign: 'middle' }}>
          <span
            className="inline-flex items-center justify-center rounded-full text-white"
            style={{ width: px(block.iconSize), height: px(block.iconSize), backgroundColor: tokens.primaryColor }}
            title={link.label}
          >
            {link.iconUrl && isSafeUrl(link.iconUrl) ? (
              <img src={link.iconUrl} alt={link.label} width={block.iconSize} height={block.iconSize} />
            ) : (
              SOCIAL_ICONS[link.network?.toLowerCase()] || <Globe size={14} />
            )}
          </span>
          {block.showLabels && (
            <span style={{ marginLeft: 6, fontSize: px(13), color: tokens.linkColor, verticalAlign: 'middle' }}>
              {link.label}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

function NavLinksBody({ block, tokens }: { block: NavLinksBlock; tokens: ThemeTokens }) {
  const style = textCss(block.style, tokens);
  return (
    <div style={{ ...style, textAlign: block.align }}>
      {block.items.map((item, index) => (
        <span key={item.id}>
          {index > 0 && <span style={{ color: tokens.mutedTextColor, padding: '0 8px' }}>{block.separator}</span>}
          <span style={{ color: tokens.linkColor, textDecoration: 'underline' }}>{item.label || 'Link'}</span>
        </span>
      ))}
      {!block.items.length && <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>No navigation links yet</span>}
    </div>
  );
}

function LogoBody({ block, tokens }: { block: LogoBlock; tokens: ThemeTokens }) {
  const brand = tokens.brand || {};
  const themeSrc =
    block.themeVariant === 'dark' ? brand.darkLogo : block.themeVariant === 'secondary' ? brand.secondaryLogo : brand.primaryLogo;
  const src = block.useThemeLogo ? themeSrc || '' : block.src;
  if (!src || !isSafeUrl(src)) {
    return (
      <div style={{ textAlign: block.align }}>
        <PlaceholderTile
          icon={<ImageIcon size={18} />}
          title={block.useThemeLogo ? 'No brand logo configured' : 'No logo selected'}
          hint={block.useThemeLogo ? 'Add one in theme brand assets.' : undefined}
          height={64}
        />
      </div>
    );
  }
  return (
    <div style={{ textAlign: block.align }}>
      <img src={src} alt={block.alt || 'Logo'} style={{ width: block.width ? px(block.width) : 'auto', border: 0 }} />
    </div>
  );
}

function ContactInfoBody({ block, tokens }: { block: ContactInfoBlock; tokens: ThemeTokens }) {
  const brand = tokens.brand || {};
  const name = block.useThemeAddress ? brand.organizationName || block.organizationName : block.organizationName;
  const address = block.useThemeAddress
    ? (brand.organizationAddress || '').split('\n').filter(Boolean)
    : block.addressLines.filter(Boolean);
  const style = textCss(block.style, tokens, { kind: 'muted' });
  const empty = !name && !address.length && !block.phone && !block.email && !block.website;

  if (empty) {
    return (
      <PlaceholderTile
        icon={<Globe size={16} />}
        title="No contact details"
        hint="Set the organization address in theme brand assets."
        height={64}
        tone="amber"
      />
    );
  }
  return (
    <div style={{ ...style, textAlign: block.align }}>
      {name && <div style={{ fontWeight: 600 }}>{name}</div>}
      {address.map((line, index) => (
        <div key={index}>{line}</div>
      ))}
      {block.phone && <div>{block.phone}</div>}
      {block.email && <div style={{ color: tokens.linkColor }}>{block.email}</div>}
      {block.website && <div style={{ color: tokens.linkColor }}>{block.website}</div>}
    </div>
  );
}

function SystemLinkBody({ block, tokens }: { block: SystemLinkBlock; tokens: ThemeTokens }) {
  const style = textCss(block.style, tokens, { kind: 'muted' });
  const fallback =
    block.type === 'unsubscribe' ? 'Unsubscribe' : block.type === 'preferenceCenter' ? 'Email preferences' : 'View in browser';
  return (
    <div style={{ ...style, textAlign: block.align }}>
      <span style={{ color: tokens.linkColor, textDecoration: 'underline' }}>{block.label || fallback}</span>
    </div>
  );
}

function OrgFooterBody({
  block,
  tokens,
  editor,
  editing,
}: {
  block: OrgFooterBlock;
  tokens: ThemeTokens;
  editor?: Editor | null;
  editing?: boolean;
}) {
  const style = textCss(block.style, tokens, { kind: 'muted' });
  if (block.useThemeFooter) {
    const html = tokens.brand?.defaultFooterHtml || '';
    return html ? (
      <RichTextStatic html={html} style={style} />
    ) : (
      <PlaceholderTile
        icon={<Layers size={16} />}
        title="Standard organization footer"
        hint="Content comes from the theme's brand assets."
        height={56}
      />
    );
  }
  return (
    <EditableRichText html={block.html} style={style} editor={editor} editing={editing} emptyLabel="Empty footer" />
  );
}

function LegalBody({
  block,
  tokens,
  editor,
  editing,
}: {
  block: LegalBlock;
  tokens: ThemeTokens;
  editor?: Editor | null;
  editing?: boolean;
}) {
  const style = { ...textCss(block.style, tokens, { kind: 'muted' }), fontSize: px(12) };
  if (block.useThemeLegal) {
    const text = tokens.brand?.standardLegalText || '';
    return text ? (
      <div style={style}>{text}</div>
    ) : (
      <PlaceholderTile icon={<Layers size={16} />} title="Standard legal disclaimer" height={48} />
    );
  }
  return <EditableRichText html={block.html} style={style} editor={editor} editing={editing} emptyLabel="Empty disclaimer" />;
}

function VideoThumbBody({ block, tokens }: { block: VideoThumbBlock; tokens: ThemeTokens }) {
  if (!block.thumbnailUrl || !isSafeUrl(block.thumbnailUrl)) {
    return (
      <div style={{ textAlign: block.align }}>
        <PlaceholderTile icon={<Play size={20} />} title="No video thumbnail" hint="Add a thumbnail image and video URL." />
      </div>
    );
  }
  return (
    <div style={{ textAlign: block.align }}>
      <span className="relative inline-block">
        <img
          src={block.thumbnailUrl}
          alt={block.alt || 'Video thumbnail'}
          style={{ width: block.width ? px(block.width) : '100%', display: 'block', border: 0 }}
        />
        {block.showPlayBadge && (
          <span
            className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: tokens.primaryColor }}
          >
            <Play size={18} className="ml-0.5" />
          </span>
        )}
      </span>
    </div>
  );
}

function MergeFieldBody({ block, tokens }: { block: MergeFieldBlock; tokens: ThemeTokens }) {
  const style = { ...textCss(block.style, tokens), textAlign: block.align };
  if (!block.fieldKey) {
    return (
      <div style={style}>
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[12px] font-medium text-amber-800">
          No merge field selected
        </span>
      </div>
    );
  }
  return (
    <div
      style={style}
      dangerouslySetInnerHTML={{
        __html: decorateMergeTokens(mergeExpression(block.fieldKey, block.fallback, block.format)),
      }}
    />
  );
}

function ReusableBody({ block }: { block: ReusableBlockRef }) {
  return (
    <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50/60 p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
        <Layers size={12} />
        Reusable block
      </div>
      <p className="mt-0.5 text-[12px] text-blue-900/80">
        {block.label || block.reusableCode || 'Not linked to a saved block yet'}
      </p>
      {!block.detachable && <p className="mt-0.5 text-[11px] text-blue-700">Locked by your organization.</p>}
    </div>
  );
}

function ConditionalBody({ block, tokens }: { block: import('../model/document').ConditionalBlock; tokens: ThemeTokens }) {
  return (
    <div className="rounded-lg border border-dashed border-emerald-300 bg-emerald-50/50 p-2">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
        Conditional · {block.label}
      </div>
      {block.blocks.length ? (
        <div className="space-y-1">
          {block.blocks.map(child => (
            <BlockView key={child.id} block={child} tokens={tokens} />
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-emerald-800/80">No content yet.</p>
      )}
    </div>
  );
}
