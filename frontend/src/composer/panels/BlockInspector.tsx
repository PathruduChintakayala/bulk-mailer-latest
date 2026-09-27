/**
 * Context properties for every block type (spec 4.3, 7, 8, 9, 10).
 *
 * Each block contributes its own groups first, then the shared spacing,
 * background, border and responsive groups so the panel order stays predictable.
 */

import { useState } from 'react';
import { AlertTriangle, Bookmark, Crop, Image as ImageIcon, Link2, Plus, Table2, Trash2, Code2 } from 'lucide-react';
import type {
  Align,
  Block,
  ButtonBlock,
  ContactInfoBlock,
  DividerBlock,
  HeadingBlock,
  ImageBlock,
  LegalBlock,
  LinkSpec,
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
  TextStyle,
  VideoThumbBlock,
} from '../model/document';
import { newId } from '../model/defaults';
import type { ThemeTokens } from '../model/theme';
import { useComposer } from '../store/composerStore';
import {
  AlignInput,
  ColorInput,
  NumberInput,
  SelectInput,
  SliderInput,
  TextArea,
  TextInput,
  ToggleInput,
  type ColorPalette,
} from '../ui/controls';
import { ToolButton } from '../ui/primitives';
import {
  BackgroundGroup,
  BorderGroup,
  Group,
  ResponsiveGroup,
  SpacingGroup,
  TypographyGroup,
  type InspectorActions,
} from './inspectorParts';
import { describeLink, isSafeUrl, linkWarning } from '../visual/styles';

export interface BlockInspectorProps {
  block: Block;
  tokens: ThemeTokens;
  palette: ColorPalette;
  actions: InspectorActions;
}

export function BlockInspector({ block, tokens, palette, actions }: BlockInspectorProps) {
  const update = useComposer(store => store.updateNodeById);
  const patch = (values: Record<string, unknown>, label?: string) => update(block.id, values, label);

  return (
    <>
      <BlockSpecific block={block} tokens={tokens} palette={palette} actions={actions} patch={patch} />

      <SpacingGroup padding={block.padding} onChange={padding => patch({ padding }, 'Change padding')} />
      <BackgroundGroup
        background={block.background}
        palette={palette}
        onChange={background => patch({ background }, 'Change background')}
        onPickImage={() => actions.pickAsset(asset => patch({ background: { ...block.background, mode: 'image', imageUrl: asset.url } }))}
      />
      <BorderGroup border={block.border} palette={palette} onChange={border => patch({ border }, 'Change border')} />
      <ResponsiveGroup
        visibility={block.visibility}
        onVisibilityChange={visibility => patch({ visibility }, 'Change visibility')}
        mobile={block.mobile}
        onMobileChange={mobile => patch({ mobile }, 'Change mobile overrides')}
        align={'align' in block ? (block as { align: Align }).align : undefined}
        showWidth={block.type === 'image' || block.type === 'button' || block.type === 'logo'}
      />

      <Group title="Advanced" keywords={['name', 'lock', 'reusable', 'save', 'id']} defaultOpen={false}>
        <TextInput
          label="Element name"
          commitOnBlur
          placeholder="Shown in the Layers panel"
          value={block.name || ''}
          onChange={name => patch({ name: name || null }, 'Rename')}
        />
        <ToggleInput
          label="Locked"
          hint="Locked blocks cannot be moved, edited or deleted until unlocked."
          value={!!block.locked}
          onChange={locked => patch({ locked }, 'Change lock')}
        />
        <button
          type="button"
          onClick={() => actions.saveReusable(block.id, 'block')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[12px] font-medium text-gray-700 transition-colors hover:bg-gray-200"
        >
          <Bookmark size={12} />
          Save as reusable content
        </button>
      </Group>
    </>
  );
}

type Patch = (values: Record<string, unknown>, label?: string) => void;

interface SpecificProps {
  block: Block;
  tokens: ThemeTokens;
  palette: ColorPalette;
  actions: InspectorActions;
  patch: Patch;
}

function BlockSpecific({ block, tokens, palette, actions, patch }: SpecificProps) {
  switch (block.type) {
    case 'text':
      return <TextProps block={block} tokens={tokens} palette={palette} patch={patch} />;
    case 'heading':
      return <HeadingProps block={block} tokens={tokens} palette={palette} patch={patch} />;
    case 'image':
      return <ImageProps block={block} actions={actions} patch={patch} />;
    case 'button':
      return <ButtonProps block={block} tokens={tokens} palette={palette} actions={actions} patch={patch} />;
    case 'divider':
      return <DividerProps block={block} palette={palette} patch={patch} />;
    case 'spacer':
      return <SpacerProps block={block} patch={patch} />;
    case 'quote':
      return <QuoteProps block={block} tokens={tokens} palette={palette} patch={patch} />;
    case 'list':
      return <ListProps block={block} tokens={tokens} palette={palette} patch={patch} />;
    case 'table':
      return <TableProps block={block} tokens={tokens} palette={palette} actions={actions} patch={patch} />;
    case 'signature':
      return <SignatureProps block={block} tokens={tokens} palette={palette} patch={patch} />;
    case 'rawHtml':
      return <RawHtmlProps block={block} actions={actions} />;
    case 'preformatted':
      return <PreformattedProps block={block} tokens={tokens} palette={palette} patch={patch} />;
    case 'social':
      return <SocialProps block={block} actions={actions} patch={patch} />;
    case 'navLinks':
      return <NavLinksProps block={block} tokens={tokens} palette={palette} actions={actions} patch={patch} />;
    case 'logo':
      return <LogoProps block={block} actions={actions} patch={patch} />;
    case 'contactInfo':
      return <ContactProps block={block} tokens={tokens} palette={palette} patch={patch} />;
    case 'viewInBrowser':
    case 'unsubscribe':
    case 'preferenceCenter':
      return <SystemLinkProps block={block} tokens={tokens} palette={palette} patch={patch} />;
    case 'orgFooter':
      return <OrgFooterProps block={block} tokens={tokens} palette={palette} patch={patch} />;
    case 'legal':
      return <LegalProps block={block} tokens={tokens} palette={palette} patch={patch} />;
    case 'videoThumb':
      return <VideoProps block={block} actions={actions} patch={patch} />;
    case 'mergeField':
      return <MergeFieldProps block={block} tokens={tokens} palette={palette} actions={actions} patch={patch} />;
    case 'reusable':
      return <ReusableProps block={block} actions={actions} patch={patch} />;
    case 'conditional':
      return <ConditionalProps block={block} patch={patch} />;
    default:
      return null;
  }
}

// ── shared field helpers ──────────────────────────────────────────────────────

function styleSetter(patch: Patch, style: TextStyle) {
  return (values: Partial<TextStyle>) => patch({ style: { ...style, ...values } }, 'Change typography');
}

function LinkField({
  link,
  onChange,
  actions,
  label = 'Link',
}: {
  link: LinkSpec | null | undefined;
  onChange: (link: LinkSpec | null) => void;
  actions: InspectorActions;
  label?: string;
}) {
  const warning = linkWarning(link);
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-gray-600">{label}</p>
      <button
        type="button"
        onClick={() => actions.editLink(link || null, onChange)}
        className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-left text-[12px] text-gray-700 transition-colors hover:border-brand-300"
      >
        <Link2 size={12} className="shrink-0 text-gray-400" />
        <span className="min-w-0 flex-1 truncate">{describeLink(link)}</span>
      </button>
      {warning && (
        <p className="flex items-start gap-1 text-[10.5px] leading-snug text-amber-700">
          <AlertTriangle size={11} className="mt-px shrink-0" />
          {warning}
        </p>
      )}
    </div>
  );
}

// ── text-ish blocks ───────────────────────────────────────────────────────────

function TextProps({
  block,
  tokens,
  palette,
  patch,
}: {
  block: TextBlock;
  tokens: ThemeTokens;
  palette: ColorPalette;
  patch: Patch;
}) {
  return (
    <>
      <Group title="Content" keywords={['text', 'copy', 'alignment']}>
        <AlignInput
          includeJustify
          value={block.style.align || 'left'}
          onChange={align => patch({ style: { ...block.style, align } }, 'Change alignment')}
        />
        <p className="text-[10.5px] leading-snug text-gray-500">
          Double-click the block on the canvas to edit the text with the formatting toolbar.
        </p>
      </Group>
      <TypographyGroup style={block.style} tokens={tokens} palette={palette} onChange={styleSetter(patch, block.style)} />
    </>
  );
}

function HeadingProps({
  block,
  tokens,
  palette,
  patch,
}: {
  block: HeadingBlock;
  tokens: ThemeTokens;
  palette: ColorPalette;
  patch: Patch;
}) {
  return (
    <>
      <Group title="Heading" keywords={['level', 'h1', 'h2', 'outline', 'alignment']}>
        <SelectInput
          label="Level"
          value={String(block.level)}
          options={[1, 2, 3, 4, 5, 6].map(level => ({ value: String(level), label: `Heading ${level}` }))}
          onChange={value => patch({ level: Number(value) }, 'Change heading level')}
          hint="Keep levels in order so screen readers can build a correct outline."
        />
        <AlignInput
          value={block.style.align || 'left'}
          onChange={align => patch({ style: { ...block.style, align } }, 'Change alignment')}
        />
      </Group>
      <TypographyGroup
        kind="heading"
        style={block.style}
        tokens={tokens}
        palette={palette}
        onChange={styleSetter(patch, block.style)}
      />
    </>
  );
}

function QuoteProps({
  block,
  tokens,
  palette,
  patch,
}: {
  block: QuoteBlock;
  tokens: ThemeTokens;
  palette: ColorPalette;
  patch: Patch;
}) {
  return (
    <>
      <Group title="Quote" keywords={['citation', 'accent', 'attribution']}>
        <TextInput
          label="Citation"
          commitOnBlur
          placeholder="Name, role"
          value={block.citation || ''}
          onChange={citation => patch({ citation: citation || null }, 'Change citation')}
        />
        <ColorInput
          label="Accent colour"
          palette={palette}
          value={block.accentColor}
          automaticLabel="Theme primary"
          onChange={accentColor => patch({ accentColor }, 'Change accent colour')}
        />
      </Group>
      <TypographyGroup style={block.style} tokens={tokens} palette={palette} onChange={styleSetter(patch, block.style)} />
    </>
  );
}

function ListProps({
  block,
  tokens,
  palette,
  patch,
}: {
  block: ListBlock;
  tokens: ThemeTokens;
  palette: ColorPalette;
  patch: Patch;
}) {
  const setItem = (index: number, value: string) => {
    const items = [...block.items];
    items[index] = value;
    patch({ items }, 'Edit list item');
  };
  return (
    <>
      <Group title="List" keywords={['bullets', 'numbered', 'items', 'ordered']}>
        <SelectInput
          label="Style"
          value={block.ordered ? 'ordered' : 'bulleted'}
          options={[
            { value: 'bulleted', label: 'Bulleted' },
            { value: 'ordered', label: 'Numbered' },
          ]}
          onChange={value => patch({ ordered: value === 'ordered' }, 'Change list style')}
        />
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-gray-600">Items</p>
          {block.items.map((item, index) => (
            <div key={index} className="flex items-center gap-1">
              <input
                value={item}
                aria-label={`List item ${index + 1}`}
                onChange={event => setItem(index, event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1 text-[12px] focus:border-brand-400 focus:outline-none"
              />
              <ToolButton
                size="sm"
                tone="subtle"
                danger
                icon={<Trash2 size={11} />}
                label={`Remove item ${index + 1}`}
                onClick={() => patch({ items: block.items.filter((_, i) => i !== index) }, 'Remove list item')}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => patch({ items: [...block.items, 'New item'] }, 'Add list item')}
            className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-700 hover:text-brand-800"
          >
            <Plus size={11} />
            Add item
          </button>
        </div>
      </Group>
      <TypographyGroup style={block.style} tokens={tokens} palette={palette} onChange={styleSetter(patch, block.style)} />
    </>
  );
}

function SignatureProps({
  block,
  tokens,
  palette,
  patch,
}: {
  block: SignatureBlock;
  tokens: ThemeTokens;
  palette: ColorPalette;
  patch: Patch;
}) {
  return (
    <>
      <Group title="Signature" keywords={['sign off', 'sender']}>
        <p className="text-[10.5px] leading-snug text-gray-500">
          Double-click the block to edit the sign-off. Merge fields keep the sender details current.
        </p>
      </Group>
      <TypographyGroup style={block.style} tokens={tokens} palette={palette} onChange={styleSetter(patch, block.style)} />
    </>
  );
}

function PreformattedProps({
  block,
  tokens,
  palette,
  patch,
}: {
  block: PreformattedBlock;
  tokens: ThemeTokens;
  palette: ColorPalette;
  patch: Patch;
}) {
  return (
    <>
      <Group title="Preformatted text" keywords={['monospace', 'code', 'whitespace']}>
        <TextArea
          label="Text"
          mono
          rows={6}
          value={block.text}
          onChange={text => patch({ text }, 'Edit preformatted text')}
          hint="Line breaks and spacing are preserved exactly."
        />
      </Group>
      <TypographyGroup style={block.style} tokens={tokens} palette={palette} onChange={styleSetter(patch, block.style)} />
    </>
  );
}

// ── media ─────────────────────────────────────────────────────────────────────

function ImageProps({ block, actions, patch }: { block: ImageBlock; actions: InspectorActions; patch: Patch }) {
  const ratio =
    block.naturalWidth && block.naturalHeight ? block.naturalHeight / block.naturalWidth : null;

  const setWidth = (width: number | null) => {
    if (width && block.lockAspect && ratio) {
      patch({ width, height: Math.round(width * ratio) }, 'Resize image');
      return;
    }
    patch({ width }, 'Resize image');
  };

  return (
    <>
      <Group title="Image" keywords={['source', 'url', 'asset', 'upload', 'alt', 'title']}>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() =>
              actions.pickAsset(asset =>
                patch(
                  {
                    src: asset.url,
                    alt: asset.alt ?? block.alt,
                    assetCode: asset.code ?? null,
                    naturalWidth: asset.width ?? null,
                    naturalHeight: asset.height ?? null,
                  },
                  'Change image'
                )
              )
            }
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-2 py-1.5 text-[12px] font-semibold text-white hover:bg-brand-700"
          >
            <ImageIcon size={12} />
            Choose image
          </button>
          <ToolButton
            size="sm"
            icon={<Crop size={13} />}
            label="Crop and rotate"
            disabled={!block.src}
            onClick={() => actions.cropImage(block.id)}
          />
        </div>
        <TextInput
          label="Image URL"
          commitOnBlur
          placeholder="https://…"
          value={block.src}
          onChange={src => patch({ src }, 'Change image')}
          hint={block.src && !isSafeUrl(block.src) ? 'This URL is not allowed in email.' : undefined}
        />
        <TextInput
          label="Alt text"
          commitOnBlur
          placeholder="Describe the image"
          value={block.alt}
          onChange={alt => patch({ alt }, 'Change alt text')}
          hint="Required for accessibility and shown when images are blocked."
        />
        <TextInput
          label="Title (tooltip)"
          commitOnBlur
          value={block.title || ''}
          onChange={title => patch({ title: title || null }, 'Change title')}
        />
      </Group>

      <Group title="Size and fit" keywords={['width', 'height', 'aspect', 'ratio', 'fit', 'fill', 'max width']}>
        <div className="grid grid-cols-2 gap-2">
          <NumberInput label="Width" suffix="px" min={8} max={1400} allowEmpty value={block.width} onChange={setWidth} />
          <NumberInput
            label="Height"
            suffix="px"
            min={8}
            max={2000}
            allowEmpty
            disabled={block.lockAspect}
            value={block.height}
            onChange={height => patch({ height }, 'Resize image')}
          />
        </div>
        <ToggleInput
          label="Lock aspect ratio"
          value={block.lockAspect}
          onChange={lockAspect => patch({ lockAspect }, 'Change aspect lock')}
        />
        <NumberInput
          label="Maximum width"
          suffix="px"
          min={8}
          max={1400}
          allowEmpty
          value={block.maxWidth}
          onChange={maxWidth => patch({ maxWidth }, 'Change maximum width')}
        />
        <SelectInput
          label="Fit"
          value={block.fit}
          options={[
            { value: 'none', label: 'Original' },
            { value: 'fit', label: 'Scale to fit' },
            { value: 'fill', label: 'Fill and crop' },
          ]}
          onChange={fit => patch({ fit }, 'Change image fit')}
        />
        <AlignInput value={block.align} onChange={align => patch({ align }, 'Change alignment')} />
      </Group>

      <Group title="Link" keywords={['href', 'click', 'destination', 'tracking']}>
        <LinkField link={block.link} actions={actions} onChange={link => patch({ link }, 'Change image link')} />
      </Group>
    </>
  );
}

function LogoProps({ block, actions, patch }: { block: LogoBlock; actions: InspectorActions; patch: Patch }) {
  return (
    <>
      <Group title="Logo" keywords={['brand', 'theme', 'variant', 'image']}>
        <ToggleInput
          label="Use the brand logo"
          hint="Keeps every template in step with the theme's brand assets."
          value={block.useThemeLogo}
          onChange={useThemeLogo => patch({ useThemeLogo }, 'Change logo source')}
        />
        {block.useThemeLogo ? (
          <SelectInput
            label="Variant"
            value={block.themeVariant}
            options={[
              { value: 'primary', label: 'Primary' },
              { value: 'secondary', label: 'Secondary' },
              { value: 'dark', label: 'For dark backgrounds' },
            ]}
            onChange={themeVariant => patch({ themeVariant }, 'Change logo variant')}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => actions.pickAsset(asset => patch({ src: asset.url }, 'Change logo'))}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-100 px-2 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-200"
            >
              <ImageIcon size={12} />
              Choose an image
            </button>
            <TextInput label="Logo URL" commitOnBlur value={block.src} onChange={src => patch({ src }, 'Change logo')} />
          </>
        )}
        <TextInput label="Alt text" commitOnBlur value={block.alt} onChange={alt => patch({ alt }, 'Change alt text')} />
        <NumberInput
          label="Width"
          suffix="px"
          min={40}
          max={600}
          allowEmpty
          value={block.width}
          onChange={width => patch({ width }, 'Resize logo')}
        />
        <AlignInput value={block.align} onChange={align => patch({ align }, 'Change alignment')} />
        <LinkField link={block.link} actions={actions} onChange={link => patch({ link }, 'Change logo link')} />
      </Group>
    </>
  );
}

function VideoProps({ block, actions, patch }: { block: VideoThumbBlock; actions: InspectorActions; patch: Patch }) {
  return (
    <Group title="Video thumbnail" keywords={['video', 'youtube', 'play', 'poster', 'watch']}>
      <p className="rounded-lg bg-blue-50 px-2 py-1.5 text-[11px] leading-snug text-blue-800">
        Email clients do not play embedded video. This inserts a still image that links to the video.
      </p>
      <button
        type="button"
        onClick={() => actions.pickAsset(asset => patch({ thumbnailUrl: asset.url }, 'Change thumbnail'))}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-100 px-2 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-200"
      >
        <ImageIcon size={12} />
        Choose a thumbnail
      </button>
      <TextInput
        label="Thumbnail URL"
        commitOnBlur
        value={block.thumbnailUrl}
        onChange={thumbnailUrl => patch({ thumbnailUrl }, 'Change thumbnail')}
      />
      <TextInput
        label="Video URL"
        commitOnBlur
        placeholder="https://…"
        value={block.videoUrl}
        onChange={videoUrl => patch({ videoUrl }, 'Change video URL')}
        hint={block.videoUrl && !isSafeUrl(block.videoUrl) ? 'This URL is not allowed.' : undefined}
      />
      <TextInput label="Alt text" commitOnBlur value={block.alt} onChange={alt => patch({ alt }, 'Change alt text')} />
      <NumberInput
        label="Width"
        suffix="px"
        min={80}
        max={1200}
        allowEmpty
        value={block.width}
        onChange={width => patch({ width }, 'Resize thumbnail')}
      />
      <ToggleInput
        label="Show play badge"
        value={block.showPlayBadge}
        onChange={showPlayBadge => patch({ showPlayBadge }, 'Change play badge')}
      />
      <AlignInput value={block.align} onChange={align => patch({ align }, 'Change alignment')} />
    </Group>
  );
}

// ── button ────────────────────────────────────────────────────────────────────

function ButtonProps({
  block,
  tokens,
  palette,
  actions,
  patch,
}: {
  block: ButtonBlock;
  tokens: ThemeTokens;
  palette: ColorPalette;
  actions: InspectorActions;
  patch: Patch;
}) {
  return (
    <>
      <Group title="Button" keywords={['label', 'text', 'link', 'cta', 'destination']}>
        <TextInput
          label="Button text"
          commitOnBlur
          value={block.text}
          onChange={text => patch({ text }, 'Change button text')}
        />
        <LinkField link={block.link} actions={actions} onChange={link => patch({ link: link || block.link }, 'Change button link')} />
        <TextInput
          label="Accessible label"
          commitOnBlur
          placeholder="Defaults to the button text"
          value={block.accessibleLabel || ''}
          onChange={accessibleLabel => patch({ accessibleLabel: accessibleLabel || null }, 'Change accessible label')}
          hint="Use when the visible text alone is not descriptive, such as “Read more”."
        />
      </Group>

      <Group title="Appearance" keywords={['colour', 'color', 'width', 'padding', 'radius', 'font']}>
        <ColorInput
          label="Background colour"
          palette={palette}
          value={block.backgroundColor}
          automaticLabel={`Theme button (${tokens.buttonBackground})`}
          onChange={backgroundColor => patch({ backgroundColor }, 'Change button colour')}
        />
        <ColorInput
          label="Text colour"
          palette={palette}
          value={block.textColor}
          automaticLabel={`Theme (${tokens.buttonTextColor})`}
          onChange={textColor => patch({ textColor }, 'Change button text colour')}
        />
        <ToggleInput
          label="Full width"
          value={block.fullWidth}
          onChange={fullWidth => patch({ fullWidth }, 'Change button width')}
        />
        {!block.fullWidth && (
          <NumberInput
            label="Fixed width"
            suffix="px"
            min={60}
            max={600}
            allowEmpty
            value={block.width}
            onChange={width => patch({ width }, 'Change button width')}
          />
        )}
        <AlignInput value={block.align} onChange={align => patch({ align }, 'Change alignment')} />
      </Group>

      <Group title="Inner padding" keywords={['padding', 'inner', 'size', 'height']}>
        <NumberInput
          label="Vertical"
          suffix="px"
          min={0}
          max={40}
          value={block.innerPadding.top}
          onChange={value =>
            patch({ innerPadding: { ...block.innerPadding, top: value ?? 0, bottom: value ?? 0 } }, 'Change button padding')
          }
        />
        <NumberInput
          label="Horizontal"
          suffix="px"
          min={0}
          max={80}
          value={block.innerPadding.left}
          onChange={value =>
            patch({ innerPadding: { ...block.innerPadding, left: value ?? 0, right: value ?? 0 } }, 'Change button padding')
          }
        />
      </Group>

      <TypographyGroup
        title="Button text style"
        style={block.style}
        tokens={tokens}
        palette={palette}
        onChange={styleSetter(patch, block.style)}
      />

      <Group title="Tracking" keywords={['utm', 'tracking', 'analytics', 'parameters']} defaultOpen={false}>
        <ToggleInput
          label="Track clicks"
          value={block.link.trackingEnabled !== false}
          onChange={trackingEnabled => patch({ link: { ...block.link, trackingEnabled } }, 'Change click tracking')}
        />
        <TrackingParams block={block} patch={patch} />
      </Group>
    </>
  );
}

function TrackingParams({ block, patch }: { block: ButtonBlock; patch: Patch }) {
  const params = block.trackingParams || {};
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-gray-600">Query parameters</p>
      {Object.entries(params).map(([name, val]) => (
        <div key={name} className="flex items-center gap-1 text-[11.5px]">
          <span className="min-w-0 flex-1 truncate rounded bg-gray-100 px-1.5 py-1 font-mono">
            {name}={val}
          </span>
          <ToolButton
            size="sm"
            tone="subtle"
            danger
            icon={<Trash2 size={11} />}
            label={`Remove ${name}`}
            onClick={() => {
              const next = { ...params };
              delete next[name];
              patch({ trackingParams: Object.keys(next).length ? next : null }, 'Change tracking parameters');
            }}
          />
        </div>
      ))}
      <div className="flex items-center gap-1">
        <input
          value={key}
          onChange={event => setKey(event.target.value)}
          placeholder="utm_source"
          aria-label="Parameter name"
          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-1.5 py-1 text-[11.5px] focus:border-brand-400 focus:outline-none"
        />
        <input
          value={value}
          onChange={event => setValue(event.target.value)}
          placeholder="newsletter"
          aria-label="Parameter value"
          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-1.5 py-1 text-[11.5px] focus:border-brand-400 focus:outline-none"
        />
        <ToolButton
          size="sm"
          icon={<Plus size={11} />}
          label="Add parameter"
          disabled={!key.trim()}
          onClick={() => {
            patch({ trackingParams: { ...params, [key.trim()]: value.trim() } }, 'Change tracking parameters');
            setKey('');
            setValue('');
          }}
        />
      </div>
    </div>
  );
}

// ── structural blocks ─────────────────────────────────────────────────────────

function DividerProps({ block, palette, patch }: { block: DividerBlock; palette: ColorPalette; patch: Patch }) {
  return (
    <Group title="Divider" keywords={['line', 'thickness', 'width', 'style', 'colour']}>
      <SelectInput
        label="Line style"
        value={block.lineStyle}
        options={[
          { value: 'solid', label: 'Solid' },
          { value: 'dashed', label: 'Dashed' },
          { value: 'dotted', label: 'Dotted' },
          { value: 'double', label: 'Double' },
        ]}
        onChange={lineStyle => patch({ lineStyle }, 'Change divider style')}
      />
      <NumberInput
        label="Thickness"
        suffix="px"
        min={1}
        max={12}
        value={block.thickness}
        onChange={thickness => patch({ thickness: thickness ?? 1 }, 'Change divider thickness')}
      />
      <SliderInput
        label="Width"
        suffix="%"
        min={10}
        max={100}
        value={block.widthPct}
        onChange={widthPct => patch({ widthPct }, 'Change divider width')}
      />
      <ColorInput
        label="Colour"
        palette={palette}
        value={block.color}
        automaticLabel="Theme divider"
        onChange={color => patch({ color }, 'Change divider colour')}
      />
      <AlignInput value={block.align} onChange={align => patch({ align }, 'Change alignment')} />
    </Group>
  );
}

function SpacerProps({ block, patch }: { block: SpacerBlock; patch: Patch }) {
  return (
    <Group title="Spacer" keywords={['height', 'gap', 'mobile', 'space']}>
      <SliderInput
        label="Height"
        suffix="px"
        min={2}
        max={160}
        value={block.height}
        onChange={height => patch({ height }, 'Change spacer height')}
      />
      <NumberInput
        label="Mobile height"
        suffix="px"
        min={2}
        max={160}
        allowEmpty
        placeholder="Same as desktop"
        value={block.mobileHeight}
        onChange={mobileHeight => patch({ mobileHeight }, 'Change mobile spacer height')}
      />
    </Group>
  );
}

function TableProps({
  block,
  tokens,
  palette,
  actions,
  patch,
}: {
  block: TableBlock;
  tokens: ThemeTokens;
  palette: ColorPalette;
  actions: InspectorActions;
  patch: Patch;
}) {
  return (
    <>
      <Group title="Table" keywords={['rows', 'columns', 'header', 'footer', 'width', 'cells']}>
        <button
          type="button"
          onClick={() => actions.editTable(block.id)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-2 py-1.5 text-[12px] font-semibold text-white hover:bg-brand-700"
        >
          <Table2 size={12} />
          Edit table contents
        </button>
        <p className="text-[10.5px] leading-snug text-gray-500">
          {block.rows.length} row{block.rows.length === 1 ? '' : 's'} ·{' '}
          {block.rows[0]?.cells.length || 0} column{(block.rows[0]?.cells.length || 0) === 1 ? '' : 's'}
        </p>
        <ToggleInput label="Header row" value={block.headerRow} onChange={headerRow => patch({ headerRow }, 'Change header row')} />
        <ToggleInput label="Footer row" value={block.footerRow} onChange={footerRow => patch({ footerRow }, 'Change footer row')} />
        <SliderInput
          label="Table width"
          suffix="%"
          min={20}
          max={100}
          value={block.widthPct}
          onChange={widthPct => patch({ widthPct }, 'Change table width')}
        />
        <SelectInput
          label="On mobile"
          value={block.mobileStrategy}
          options={[
            { value: 'scroll', label: 'Scroll horizontally' },
            { value: 'stack', label: 'Stack cells' },
          ]}
          onChange={mobileStrategy => patch({ mobileStrategy }, 'Change mobile table behaviour')}
          hint="Stacking is safer on narrow screens; scrolling keeps the grid intact."
        />
      </Group>

      <Group title="Cells" keywords={['padding', 'border', 'alternate', 'stripe', 'header background']}>
        <NumberInput
          label="Cell padding"
          suffix="px"
          min={0}
          max={40}
          value={block.cellPadding.top}
          onChange={value =>
            patch(
              { cellPadding: { top: value ?? 0, bottom: value ?? 0, left: (value ?? 0) + 2, right: (value ?? 0) + 2 } },
              'Change cell padding'
            )
          }
        />
        <ColorInput
          label="Header background"
          palette={palette}
          value={block.headerBackground}
          automaticLabel="None"
          onChange={headerBackground => patch({ headerBackground }, 'Change header background')}
        />
        <ColorInput
          label="Alternate row colour"
          palette={palette}
          value={block.alternateRowColor}
          automaticLabel="None"
          onChange={alternateRowColor => patch({ alternateRowColor }, 'Change alternate row colour')}
        />
      </Group>

      <TypographyGroup style={block.style} tokens={tokens} palette={palette} onChange={styleSetter(patch, block.style)} />
    </>
  );
}

function RawHtmlProps({ block, actions }: { block: RawHtmlBlock; actions: InspectorActions }) {
  return (
    <Group title="Raw HTML" keywords={['html', 'code', 'snippet', 'sanitize']}>
      <p className="rounded-lg bg-accent-50 px-2 py-1.5 text-[11px] leading-snug text-accent-900">
        This snippet is sanitized on save. Scripts, forms and unsupported elements are removed, and malformed markup can
        affect the blocks around it.
      </p>
      <button
        type="button"
        onClick={() => actions.editRawHtml(block.id)}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent-600 px-2 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-700"
      >
        <Code2 size={12} />
        Edit the snippet
      </button>
      <p className="text-[10.5px] text-gray-500">{block.html.length} characters</p>
    </Group>
  );
}

// ── email-specific ────────────────────────────────────────────────────────────

function SocialProps({ block, actions, patch }: { block: SocialBlock; actions: InspectorActions; patch: Patch }) {
  const setLink = (id: string, values: Partial<SocialBlock['links'][number]>) =>
    patch({ links: block.links.map(link => (link.id === id ? { ...link, ...values } : link)) }, 'Edit social link');

  return (
    <Group title="Social links" keywords={['linkedin', 'facebook', 'instagram', 'youtube', 'x', 'icons', 'size']}>
      <div className="space-y-2">
        {block.links.map(link => (
          <div key={link.id} className="space-y-1 rounded-lg border border-gray-200 p-2">
            <div className="flex items-center gap-1">
              <select
                value={link.network}
                aria-label="Network"
                onChange={event => setLink(link.id, { network: event.target.value, label: event.target.options[event.target.selectedIndex].text })}
                className="min-w-0 flex-1 rounded border border-gray-200 px-1.5 py-1 text-[11.5px] focus:border-brand-400 focus:outline-none"
              >
                {['linkedin', 'facebook', 'instagram', 'youtube', 'x', 'website'].map(network => (
                  <option key={network} value={network}>
                    {network === 'x' ? 'X' : network.charAt(0).toUpperCase() + network.slice(1)}
                  </option>
                ))}
              </select>
              <ToolButton
                size="sm"
                tone="subtle"
                danger
                icon={<Trash2 size={11} />}
                label={`Remove ${link.label}`}
                onClick={() => patch({ links: block.links.filter(item => item.id !== link.id) }, 'Remove social link')}
              />
            </div>
            <input
              value={link.url}
              placeholder="https://…"
              aria-label={`${link.label} URL`}
              onChange={event => setLink(link.id, { url: event.target.value })}
              className="w-full rounded border border-gray-200 px-1.5 py-1 text-[11.5px] focus:border-brand-400 focus:outline-none"
            />
            {link.url && !isSafeUrl(link.url) && (
              <p className="text-[10.5px] text-amber-700">This URL is not allowed in email.</p>
            )}
            <button
              type="button"
              onClick={() => actions.pickAsset(asset => setLink(link.id, { iconUrl: asset.url }))}
              className="text-[10.5px] font-medium text-brand-700 hover:text-brand-800"
            >
              {link.iconUrl ? 'Change custom icon' : 'Use a custom icon'}
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            patch(
              {
                links: [
                  ...block.links,
                  { id: newId('soc'), network: 'website', url: '', label: 'Website', iconUrl: null },
                ],
              },
              'Add social link'
            )
          }
          className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-700 hover:text-brand-800"
        >
          <Plus size={11} />
          Add a channel
        </button>
      </div>

      <NumberInput
        label="Icon size"
        suffix="px"
        min={14}
        max={48}
        value={block.iconSize}
        onChange={iconSize => patch({ iconSize: iconSize ?? 24 }, 'Change icon size')}
      />
      <NumberInput
        label="Gap between icons"
        suffix="px"
        min={0}
        max={40}
        value={block.gap}
        onChange={gap => patch({ gap: gap ?? 12 }, 'Change icon gap')}
      />
      <ToggleInput label="Show labels" value={block.showLabels} onChange={showLabels => patch({ showLabels }, 'Change labels')} />
      <AlignInput value={block.align} onChange={align => patch({ align }, 'Change alignment')} />
    </Group>
  );
}

function NavLinksProps({
  block,
  tokens,
  palette,
  actions,
  patch,
}: {
  block: NavLinksBlock;
  tokens: ThemeTokens;
  palette: ColorPalette;
  actions: InspectorActions;
  patch: Patch;
}) {
  const setItem = (id: string, values: Partial<NavLinksBlock['items'][number]>) =>
    patch({ items: block.items.map(item => (item.id === id ? { ...item, ...values } : item)) }, 'Edit navigation link');

  return (
    <>
      <Group title="Navigation links" keywords={['menu', 'links', 'separator']}>
        <div className="space-y-2">
          {block.items.map(item => (
            <div key={item.id} className="space-y-1 rounded-lg border border-gray-200 p-2">
              <div className="flex items-center gap-1">
                <input
                  value={item.label}
                  aria-label="Link label"
                  onChange={event => setItem(item.id, { label: event.target.value })}
                  className="min-w-0 flex-1 rounded border border-gray-200 px-1.5 py-1 text-[11.5px] focus:border-brand-400 focus:outline-none"
                />
                <ToolButton
                  size="sm"
                  tone="subtle"
                  danger
                  icon={<Trash2 size={11} />}
                  label={`Remove ${item.label}`}
                  onClick={() => patch({ items: block.items.filter(entry => entry.id !== item.id) }, 'Remove navigation link')}
                />
              </div>
              <LinkField
                label="Destination"
                link={item.link}
                actions={actions}
                onChange={link => link && setItem(item.id, { link })}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              patch(
                {
                  items: [
                    ...block.items,
                    { id: newId('nav'), label: 'New link', link: { type: 'url', value: '', target: '_blank' } },
                  ],
                },
                'Add navigation link'
              )
            }
            className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-700 hover:text-brand-800"
          >
            <Plus size={11} />
            Add a link
          </button>
        </div>
        <TextInput
          label="Separator"
          commitOnBlur
          value={block.separator}
          onChange={separator => patch({ separator }, 'Change separator')}
        />
        <AlignInput value={block.align} onChange={align => patch({ align }, 'Change alignment')} />
      </Group>
      <TypographyGroup style={block.style} tokens={tokens} palette={palette} onChange={styleSetter(patch, block.style)} />
    </>
  );
}

function ContactProps({
  block,
  tokens,
  palette,
  patch,
}: {
  block: ContactInfoBlock;
  tokens: ThemeTokens;
  palette: ColorPalette;
  patch: Patch;
}) {
  return (
    <>
      <Group title="Contact information" keywords={['address', 'organization', 'phone', 'email', 'website', 'compliance']}>
        <ToggleInput
          label="Use the organization address"
          hint="Recommended: keeps the required postal address in one place."
          value={block.useThemeAddress}
          onChange={useThemeAddress => patch({ useThemeAddress }, 'Change address source')}
        />
        {!block.useThemeAddress && (
          <>
            <TextInput
              label="Organization name"
              commitOnBlur
              value={block.organizationName}
              onChange={organizationName => patch({ organizationName }, 'Change organization name')}
            />
            <TextArea
              label="Address"
              rows={3}
              value={block.addressLines.join('\n')}
              onChange={value => patch({ addressLines: value.split('\n') }, 'Change address')}
              hint="One line per row."
            />
          </>
        )}
        <TextInput
          label="Phone"
          commitOnBlur
          value={block.phone || ''}
          onChange={phone => patch({ phone: phone || null }, 'Change phone')}
        />
        <TextInput
          label="Email"
          commitOnBlur
          value={block.email || ''}
          onChange={email => patch({ email: email || null }, 'Change email')}
        />
        <TextInput
          label="Website"
          commitOnBlur
          value={block.website || ''}
          onChange={website => patch({ website: website || null }, 'Change website')}
        />
        <AlignInput value={block.align} onChange={align => patch({ align }, 'Change alignment')} />
      </Group>
      <TypographyGroup style={block.style} tokens={tokens} palette={palette} onChange={styleSetter(patch, block.style)} />
    </>
  );
}

function SystemLinkProps({
  block,
  tokens,
  palette,
  patch,
}: {
  block: SystemLinkBlock;
  tokens: ThemeTokens;
  palette: ColorPalette;
  patch: Patch;
}) {
  const description =
    block.type === 'unsubscribe'
      ? 'The destination is generated per recipient, so it cannot be edited here.'
      : block.type === 'preferenceCenter'
        ? 'Links to the recipient’s preference centre.'
        : 'Links to the hosted version of this email.';
  return (
    <>
      <Group title="System link" keywords={['unsubscribe', 'preferences', 'browser', 'label']}>
        <p className="rounded-lg bg-gray-50 px-2 py-1.5 text-[11px] leading-snug text-gray-600">{description}</p>
        <TextInput label="Label" commitOnBlur value={block.label} onChange={label => patch({ label }, 'Change label')} />
        <AlignInput value={block.align} onChange={align => patch({ align }, 'Change alignment')} />
      </Group>
      <TypographyGroup style={block.style} tokens={tokens} palette={palette} onChange={styleSetter(patch, block.style)} />
    </>
  );
}

function OrgFooterProps({
  block,
  tokens,
  palette,
  patch,
}: {
  block: OrgFooterBlock;
  tokens: ThemeTokens;
  palette: ColorPalette;
  patch: Patch;
}) {
  return (
    <>
      <Group title="Organization footer" keywords={['footer', 'standard', 'theme', 'boilerplate']}>
        <ToggleInput
          label="Use the standard footer"
          hint="Content comes from the theme, so a single change updates every template."
          value={block.useThemeFooter}
          onChange={useThemeFooter => patch({ useThemeFooter }, 'Change footer source')}
        />
        {!block.useThemeFooter && (
          <p className="text-[10.5px] leading-snug text-gray-500">Double-click the block on the canvas to edit the text.</p>
        )}
      </Group>
      <TypographyGroup style={block.style} tokens={tokens} palette={palette} onChange={styleSetter(patch, block.style)} />
    </>
  );
}

function LegalProps({
  block,
  tokens,
  palette,
  patch,
}: {
  block: LegalBlock;
  tokens: ThemeTokens;
  palette: ColorPalette;
  patch: Patch;
}) {
  return (
    <>
      <Group title="Legal disclaimer" keywords={['legal', 'terms', 'disclaimer', 'small print']}>
        <ToggleInput
          label="Use the standard disclaimer"
          value={block.useThemeLegal}
          onChange={useThemeLegal => patch({ useThemeLegal }, 'Change disclaimer source')}
        />
      </Group>
      <TypographyGroup style={block.style} tokens={tokens} palette={palette} onChange={styleSetter(patch, block.style)} />
    </>
  );
}

function MergeFieldProps({
  block,
  tokens,
  palette,
  actions,
  patch,
}: {
  block: MergeFieldBlock;
  tokens: ThemeTokens;
  palette: ColorPalette;
  actions: InspectorActions;
  patch: Patch;
}) {
  const mergeDefs = useComposer(store => store.mergeDefs);
  const definition = mergeDefs.find(entry => entry.key === block.fieldKey);
  return (
    <>
      <Group title="Merge field" keywords={['personalization', 'field', 'default', 'format', 'variable']}>
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-gray-600">Field</p>
          <button
            type="button"
            onClick={() => actions.pickMergeField(key => patch({ fieldKey: key }, 'Change merge field'))}
            className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-left text-[12px] text-gray-700 hover:border-brand-300"
          >
            {block.fieldKey ? `{{${block.fieldKey}}}` : 'Choose a field'}
          </button>
          {definition?.description && <p className="text-[10.5px] text-gray-500">{definition.description}</p>}
          {block.fieldKey && !definition && (
            <p className="flex items-start gap-1 text-[10.5px] text-amber-700">
              <AlertTriangle size={11} className="mt-px shrink-0" />
              This field is not declared for this template.
            </p>
          )}
        </div>
        <TextInput
          label="Default value"
          commitOnBlur
          placeholder={definition?.default_value || 'Leave empty to show nothing'}
          value={block.fallback || ''}
          onChange={fallback => patch({ fallback: fallback || null }, 'Change default value')}
        />
        <TextInput
          label="Formatting"
          commitOnBlur
          placeholder="currency:$ · number:2 · date:%d %b %Y"
          value={block.format || ''}
          onChange={format => patch({ format: format || null }, 'Change formatting')}
          hint="Applied after the value resolves. Leave empty for the raw value."
        />
        <AlignInput value={block.align} onChange={align => patch({ align }, 'Change alignment')} />
      </Group>
      <TypographyGroup style={block.style} tokens={tokens} palette={palette} onChange={styleSetter(patch, block.style)} />
    </>
  );
}

function ReusableProps({ block, actions, patch }: { block: ReusableBlockRef; actions: InspectorActions; patch: Patch }) {
  return (
    <Group title="Reusable block" keywords={['saved', 'library', 'shared', 'detach']}>
      <button
        type="button"
        onClick={() => actions.pickReusable((code, label) => patch({ reusableCode: code, label }, 'Change reusable block'))}
        className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-left text-[12px] text-gray-700 hover:border-brand-300"
      >
        {block.label || block.reusableCode || 'Choose saved content'}
      </button>
      {!block.detachable && (
        <p className="rounded-lg bg-blue-50 px-2 py-1.5 text-[11px] text-blue-900">
          This block is locked by your organization and cannot be detached.
        </p>
      )}
    </Group>
  );
}

function ConditionalProps({ block, patch }: { block: import('../model/document').ConditionalBlock; patch: Patch }) {
  return (
    <Group title="Conditional content" keywords={['rule', 'condition', 'segment', 'variant']}>
      <TextInput
        label="Label"
        commitOnBlur
        value={block.label}
        onChange={label => patch({ label }, 'Rename condition')}
      />
      <p className="rounded-lg bg-gray-50 px-2 py-1.5 text-[11px] leading-snug text-gray-600">
        Content inside this container is included for every recipient today. Rule evaluation is not enabled yet, so use it
        to group content you intend to make conditional.
      </p>
    </Group>
  );
}
