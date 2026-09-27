/**
 * Shared building blocks for the properties inspector (spec 4.3).
 *
 * Groups register their own searchable keywords so the settings search box can
 * hide anything that does not match, which keeps a long inspector navigable.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Align, Background, Border, MobileOverrides, Spacing, TextStyle, Visibility } from '../model/document';
import { EMAIL_SAFE_FONTS, type ThemeTokens } from '../model/theme';
import { useComposer } from '../store/composerStore';
import { Disclosure } from '../ui/primitives';
import {
  BackgroundInput,
  BorderInput,
  ColorInput,
  NumberInput,
  SelectInput,
  SpacingInput,
  ToggleInput,
  readRecentColors,
  type ColorPalette,
} from '../ui/controls';

// ── inspector actions ─────────────────────────────────────────────────────────

export interface PickedAsset {
  url: string;
  alt?: string;
  width?: number | null;
  height?: number | null;
  code?: string | null;
}

/** Dialog-opening callbacks the inspector needs but does not own. */
export interface InspectorActions {
  pickAsset: (onPick: (asset: PickedAsset) => void, purpose?: string) => void;
  editLink: (
    link: import('../model/document').LinkSpec | null,
    onApply: (link: import('../model/document').LinkSpec | null) => void
  ) => void;
  pickMergeField: (onPick: (key: string) => void) => void;
  cropImage: (blockId: string) => void;
  editTable: (blockId: string) => void;
  editRawHtml: (blockId: string) => void;
  saveReusable: (nodeId: string, kind: 'section' | 'block') => void;
  pickReusable: (onPick: (code: string, label: string) => void) => void;
  openThemeEditor: () => void;
}

// ── search context ────────────────────────────────────────────────────────────

const SearchContext = createContext('');
export const InspectorSearchProvider = SearchContext.Provider;

export function Group({
  title,
  keywords = [],
  children,
  defaultOpen = true,
  right,
}: {
  title: string;
  keywords?: string[];
  children: ReactNode;
  defaultOpen?: boolean;
  right?: ReactNode;
}) {
  const term = useContext(SearchContext).trim().toLowerCase();
  const matches =
    !term || title.toLowerCase().includes(term) || keywords.some(keyword => keyword.toLowerCase().includes(term));
  if (!matches) return null;
  return (
    <Disclosure title={title} defaultOpen={term ? true : defaultOpen} right={right}>
      {children}
    </Disclosure>
  );
}

// ── palette ───────────────────────────────────────────────────────────────────

/** Builds the colour menu from theme tokens, brand colours and recent picks. */
export function usePalette(tokens: ThemeTokens): ColorPalette {
  const settings = useComposer(store => store.settings);
  return useMemo(
    () => ({
      theme: [
        { label: 'Primary', value: tokens.primaryColor },
        { label: 'Secondary', value: tokens.secondaryColor },
        { label: 'Heading', value: tokens.headingColor },
        { label: 'Body text', value: tokens.bodyTextColor },
        { label: 'Muted text', value: tokens.mutedTextColor },
        { label: 'Link', value: tokens.linkColor },
        { label: 'Button', value: tokens.buttonBackground },
        { label: 'Button text', value: tokens.buttonTextColor },
        { label: 'Divider', value: tokens.dividerColor },
        { label: 'Content background', value: tokens.contentBackground },
        { label: 'Page background', value: tokens.pageBackground },
      ],
      brand: (settings?.brand_colors as string[] | undefined) || [],
      recent: readRecentColors(),
      saved: (settings?.saved_colors as string[] | undefined) || [],
    }),
    [settings, tokens]
  );
}

/** Font options limited to the administrator-approved list when one exists. */
export function useFontOptions(): { value: string; label: string }[] {
  const settings = useComposer(store => store.settings);
  const fonts = useComposer(store => store.fonts);
  return useMemo(() => {
    const allowed = (settings?.allowed_fonts as string[] | undefined) || [];
    const source = fonts.length ? fonts : EMAIL_SAFE_FONTS;
    const filtered = allowed.length ? source.filter(font => allowed.includes(font.label)) : source;
    return [{ value: '', label: 'Theme default' }, ...filtered.map(font => ({ value: font.stack, label: font.label }))];
  }, [fonts, settings]);
}

// ── reusable groups ───────────────────────────────────────────────────────────

export function TypographyGroup({
  style,
  onChange,
  palette,
  tokens,
  kind = 'body',
  title = 'Typography',
}: {
  style: TextStyle;
  onChange: (patch: Partial<TextStyle>) => void;
  palette: ColorPalette;
  tokens: ThemeTokens;
  kind?: 'body' | 'heading';
  title?: string;
}) {
  const fontOptions = useFontOptions();
  return (
    <Group
      title={title}
      keywords={['font', 'size', 'weight', 'line height', 'letter spacing', 'colour', 'color', 'case', 'align', 'direction']}
    >
      <SelectInput
        label="Font"
        value={style.fontFamily || ''}
        options={fontOptions}
        onChange={value => onChange({ fontFamily: value || null })}
        hint="Only email-safe stacks are offered so text renders everywhere."
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberInput
          label="Size"
          suffix="px"
          min={8}
          max={72}
          allowEmpty
          placeholder={String(kind === 'heading' ? tokens.headingSizes.h2 : tokens.bodyFontSize)}
          value={style.fontSize}
          onChange={fontSize => onChange({ fontSize })}
        />
        <SelectInput
          label="Weight"
          value={style.fontWeight ? String(style.fontWeight) : ''}
          options={[
            { value: '', label: 'Theme' },
            { value: '300', label: 'Light' },
            { value: '400', label: 'Regular' },
            { value: '500', label: 'Medium' },
            { value: '600', label: 'Semibold' },
            { value: '700', label: 'Bold' },
            { value: '800', label: 'Extra bold' },
          ]}
          onChange={value => onChange({ fontWeight: value ? Number(value) : null })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberInput
          label="Line height"
          step={0.05}
          min={1}
          max={3}
          allowEmpty
          placeholder={String(tokens.lineHeight)}
          value={style.lineHeight}
          onChange={lineHeight => onChange({ lineHeight })}
        />
        <NumberInput
          label="Letter spacing"
          suffix="px"
          step={0.25}
          min={-2}
          max={8}
          allowEmpty
          placeholder="0"
          value={style.letterSpacing}
          onChange={letterSpacing => onChange({ letterSpacing })}
        />
      </div>
      <ColorInput
        label="Text colour"
        palette={palette}
        value={style.color}
        automaticLabel="Theme colour"
        onChange={color => onChange({ color })}
      />
      <SelectInput
        label="Capitalization"
        value={style.textTransform || 'none'}
        options={[
          { value: 'none', label: 'As typed' },
          { value: 'uppercase', label: 'UPPERCASE' },
          { value: 'lowercase', label: 'lowercase' },
          { value: 'capitalize', label: 'Capitalize Each Word' },
        ]}
        onChange={value => onChange({ textTransform: value === 'none' ? null : value })}
      />
      <SelectInput
        label="Text direction"
        value={style.direction || 'ltr'}
        options={[
          { value: 'ltr', label: 'Left to right' },
          { value: 'rtl', label: 'Right to left' },
        ]}
        onChange={value => onChange({ direction: value })}
      />
    </Group>
  );
}

export function SpacingGroup({
  padding,
  onChange,
  title = 'Spacing',
}: {
  padding: Spacing;
  onChange: (padding: Spacing) => void;
  title?: string;
}) {
  return (
    <Group title={title} keywords={['padding', 'margin', 'space', 'inset', 'gap']}>
      <SpacingInput value={padding} onChange={onChange} />
      <p className="text-[10.5px] leading-snug text-gray-500">
        Email layouts use padding rather than margins, because margins are unreliable in Outlook.
      </p>
    </Group>
  );
}

export function BackgroundGroup({
  background,
  onChange,
  palette,
  onPickImage,
  allowImage = true,
  title = 'Background',
}: {
  background: Background;
  onChange: (background: Background) => void;
  palette: ColorPalette;
  onPickImage?: () => void;
  allowImage?: boolean;
  title?: string;
}) {
  return (
    <Group title={title} keywords={['background', 'colour', 'color', 'image', 'fill', 'fallback']}>
      <BackgroundInput value={background} onChange={onChange} palette={palette} allowImage={allowImage} onPickImage={onPickImage} />
    </Group>
  );
}

export function BorderGroup({
  border,
  onChange,
  palette,
  title = 'Border',
}: {
  border: Border;
  onChange: (border: Border) => void;
  palette: ColorPalette;
  title?: string;
}) {
  return (
    <Group title={title} keywords={['border', 'outline', 'radius', 'corner', 'stroke']} defaultOpen={false}>
      <BorderInput value={border} onChange={onChange} palette={palette} />
    </Group>
  );
}

export function ResponsiveGroup({
  visibility,
  onVisibilityChange,
  mobile,
  onMobileChange,
  align,
  showWidth = false,
}: {
  visibility: Visibility;
  onVisibilityChange: (visibility: Visibility) => void;
  mobile?: MobileOverrides | null;
  onMobileChange?: (mobile: MobileOverrides | null) => void;
  align?: Align;
  showWidth?: boolean;
}) {
  const current = mobile || {};
  const patchMobile = (patch: Partial<MobileOverrides>) => {
    const next = { ...current, ...patch };
    const empty = Object.values(next).every(value => value === null || value === undefined);
    onMobileChange?.(empty ? null : next);
  };

  return (
    <Group
      title="Responsive behaviour"
      keywords={['mobile', 'desktop', 'hide', 'show', 'responsive', 'stack', 'width', 'small screen']}
      defaultOpen={false}
    >
      <ToggleInput
        label="Show on desktop"
        value={visibility.desktop}
        onChange={desktop => onVisibilityChange({ ...visibility, desktop })}
      />
      <ToggleInput
        label="Show on mobile"
        value={visibility.mobile}
        onChange={mobileVisible => onVisibilityChange({ ...visibility, mobile: mobileVisible })}
      />
      {!visibility.desktop && !visibility.mobile && (
        <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
          Hidden everywhere. No recipient will see this element.
        </p>
      )}

      {onMobileChange && (
        <>
          <p className="pt-1 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">Mobile overrides</p>
          <NumberInput
            label="Mobile padding (all sides)"
            suffix="px"
            min={0}
            max={80}
            allowEmpty
            placeholder="Same as desktop"
            value={current.padding ? current.padding.top : null}
            onChange={value =>
              patchMobile({
                padding: value === null ? null : { top: value, right: value, bottom: value, left: value },
              })
            }
          />
          <NumberInput
            label="Mobile font size"
            suffix="px"
            min={8}
            max={48}
            allowEmpty
            placeholder="Same as desktop"
            value={current.fontSize ?? null}
            onChange={fontSize => patchMobile({ fontSize })}
          />
          {showWidth && (
            <SelectInput
              label="Mobile width"
              value={current.width === 'full' ? 'full' : current.width ? 'fixed' : 'auto'}
              options={[
                { value: 'auto', label: 'Same as desktop' },
                { value: 'full', label: 'Full width' },
                { value: 'fixed', label: 'Fixed width' },
              ]}
              onChange={value =>
                patchMobile({ width: value === 'full' ? 'full' : value === 'fixed' ? 280 : null })
              }
            />
          )}
          {showWidth && typeof current.width === 'number' && (
            <NumberInput
              label="Mobile width value"
              suffix="px"
              min={40}
              max={640}
              value={current.width}
              onChange={value => patchMobile({ width: value })}
            />
          )}
          {align !== undefined && (
            <SelectInput
              label="Mobile alignment"
              value={current.align || 'inherit'}
              options={[
                { value: 'inherit', label: `Same as desktop (${align})` },
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Centre' },
                { value: 'right', label: 'Right' },
              ]}
              onChange={value => patchMobile({ align: value === 'inherit' ? null : (value as Align) })}
            />
          )}
        </>
      )}
    </Group>
  );
}
