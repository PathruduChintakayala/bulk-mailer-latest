/**
 * Theme and brand editor (spec 18).
 *
 * Built-in themes are read-only templates: editing one offers a copy instead. Applying a
 * theme only changes values the author has not explicitly overridden on an element.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Archive, Check, Copy, Image as ImageIcon, Lock, Palette, Plus, RotateCcw, Star } from 'lucide-react';
import * as composerApi from '../api/composerApi';
import {
  DEFAULT_HEADING_SIZES,
  DEFAULT_THEME_TOKENS,
  resolveTokens,
  type BrandAssets,
  type ThemeTokens,
} from '../model/theme';
import { useComposer } from '../store/composerStore';
import { Dialog, DialogButton } from '../ui/Dialog';
import { Pill, Segmented, Spinner } from '../ui/primitives';
import { ColorInput, NumberInput, SelectInput, SliderInput, TextArea, TextInput } from '../ui/controls';
import { useFontOptions, usePalette } from '../panels/inspectorParts';
import type { PickedAsset } from '../panels/inspectorParts';

type Tab = 'colors' | 'typography' | 'layout' | 'brand';

export function ThemeEditor({
  open,
  onClose,
  onPickAsset,
}: {
  open: boolean;
  onClose: () => void;
  onPickAsset: (onPick: (asset: PickedAsset) => void, purpose?: string) => void;
}) {
  const themes = useComposer(store => store.themes);
  const themeCode = useComposer(store => store.themeCode);
  const setThemeCode = useComposer(store => store.setThemeCode);
  const themeOverrides = useComposer(store => store.themeOverrides);
  const setThemeOverrides = useComposer(store => store.setThemeOverrides);
  const canManage = useComposer(store => store.can('manage_themes'));
  const boot = useComposer(store => store.boot);
  const tokensInUse = useComposer(store => store.themeTokens());
  const palette = usePalette(tokensInUse);
  const fontOptions = useFontOptions();

  const [selectedCode, setSelectedCode] = useState<string | null>(themeCode);
  const [draft, setDraft] = useState<ThemeTokens>(DEFAULT_THEME_TOKENS);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tab, setTab] = useState<Tab>('colors');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const selected = useMemo(
    () => themes.find(theme => theme.public_code === selectedCode) || null,
    [selectedCode, themes]
  );

  useEffect(() => {
    if (!open) return;
    setSelectedCode(themeCode || themes.find(theme => theme.is_org_default)?.public_code || themes[0]?.public_code || null);
  }, [open, themeCode, themes]);

  useEffect(() => {
    if (!selected) return;
    setDraft(resolveTokens(selected.tokens));
    setName(selected.name);
    setDescription(selected.description || '');
    setDirty(false);
  }, [selected]);

  const readOnly = !selected || selected.is_builtin || (selected.is_locked && !canManage) || !canManage;

  const setToken = <K extends keyof ThemeTokens>(key: K, value: ThemeTokens[K]) => {
    setDraft(current => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const setBrand = <K extends keyof BrandAssets>(key: K, value: BrandAssets[K]) => {
    setDraft(current => ({ ...current, brand: { ...(current.brand || {}), [key]: value } }));
    setDirty(true);
  };

  const saveTheme = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await composerApi.updateTheme(selected.public_code, { name, description, tokens: draft });
      await boot();
      setDirty(false);
      toast.success('Theme saved.');
    } catch (error) {
      toast.error(composerApi.describeError(error, 'The theme could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  const cloneTheme = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const copy = await composerApi.cloneTheme(selected.public_code);
      await boot();
      setSelectedCode(copy.public_code);
      toast.success(`Created “${copy.name}”. Edit the copy freely.`);
    } catch (error) {
      toast.error(composerApi.describeError(error, 'The theme could not be copied.'));
    } finally {
      setBusy(false);
    }
  };

  const createTheme = async () => {
    setBusy(true);
    try {
      const created = await composerApi.createTheme({ name: 'New theme', tokens: draft });
      await boot();
      setSelectedCode(created.public_code);
      toast.success('Theme created.');
    } catch (error) {
      toast.error(composerApi.describeError(error, 'The theme could not be created.'));
    } finally {
      setBusy(false);
    }
  };

  const applyToDocument = () => {
    if (!selected) return;
    setThemeCode(selected.public_code);
    if (themeOverrides && Object.keys(themeOverrides).length) {
      const keep = window.confirm(
        'This template has element overrides. Keep them, or clear them so the theme applies everywhere?\n\nOK keeps overrides, Cancel clears them.'
      );
      if (!keep) setThemeOverrides(null);
    }
    toast.success(`“${selected.name}” applied.`);
    onClose();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'colors', label: 'Colours' },
    { id: 'typography', label: 'Type' },
    { id: 'layout', label: 'Layout' },
    { id: 'brand', label: 'Brand' },
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title="Themes"
      description="Themes set the defaults for colour, type and spacing across every template."
      footer={
        <>
          <DialogButton onClick={onClose}>Close</DialogButton>
          {selected && !readOnly && (
            <DialogButton onClick={saveTheme} busy={busy} disabled={!dirty}>
              Save theme
            </DialogButton>
          )}
          <DialogButton variant="primary" onClick={applyToDocument} disabled={!selected}>
            Apply to this email
          </DialogButton>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[220px_1fr_240px]">
        <aside className="space-y-1">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">Available themes</p>
            {canManage && (
              <button
                type="button"
                onClick={createTheme}
                title="Create a theme"
                aria-label="Create a theme"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <Plus size={13} />
              </button>
            )}
          </div>
          <div className="max-h-[48vh] space-y-1 overflow-y-auto pr-1">
            {themes.length ? (
              themes.map(theme => (
                <button
                  key={theme.public_code}
                  type="button"
                  onClick={() => setSelectedCode(theme.public_code)}
                  className={clsx(
                    'flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors',
                    selectedCode === theme.public_code
                      ? 'border-brand-400 bg-brand-50'
                      : 'border-gray-200 hover:border-brand-300'
                  )}
                >
                  <span className="mt-0.5 flex shrink-0 gap-0.5">
                    {[theme.tokens.primaryColor, theme.tokens.contentBackground, theme.tokens.bodyTextColor].map(
                      (color, index) => (
                        <span
                          key={index}
                          className="h-3 w-3 rounded-sm ring-1 ring-black/10"
                          style={{ backgroundColor: color }}
                        />
                      )
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-gray-900">{theme.name}</span>
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {theme.is_org_default && <Pill tone="green">Default</Pill>}
                      {theme.is_builtin && <Pill tone="gray">Built in</Pill>}
                      {theme.is_locked && (
                        <Pill tone="violet" icon={<Lock size={9} />}>
                          Locked
                        </Pill>
                      )}
                    </span>
                  </span>
                  {themeCode === theme.public_code && <Check size={13} className="mt-0.5 shrink-0 text-brand-600" />}
                </button>
              ))
            ) : (
              <div className="flex h-20 items-center justify-center text-gray-400">
                <Spinner size={16} />
              </div>
            )}
          </div>

          {selected && (
            <div className="space-y-1 border-t border-gray-200 pt-2">
              <SmallAction icon={<Copy size={11} />} label="Duplicate theme" onClick={cloneTheme} disabled={!canManage} />
              {canManage && !selected.is_org_default && (
                <SmallAction
                  icon={<Star size={11} />}
                  label="Make organization default"
                  onClick={async () => {
                    await composerApi.setDefaultTheme(selected.public_code);
                    await boot();
                    toast.success('Organization default updated.');
                  }}
                />
              )}
              {canManage && !selected.is_builtin && (
                <SmallAction
                  icon={<Lock size={11} />}
                  label={selected.is_locked ? 'Unlock theme' : 'Lock theme'}
                  onClick={async () => {
                    await composerApi.updateTheme(selected.public_code, { is_locked: !selected.is_locked });
                    await boot();
                  }}
                />
              )}
              {canManage && !selected.is_builtin && (
                <SmallAction
                  icon={<Archive size={11} />}
                  label="Archive theme"
                  onClick={async () => {
                    if (!window.confirm('Archive this theme? Templates already using it keep their values.')) return;
                    await composerApi.archiveTheme(selected.public_code);
                    await boot();
                    setSelectedCode(null);
                  }}
                />
              )}
              <SmallAction
                icon={<RotateCcw size={11} />}
                label="Reset to built-in values"
                disabled={readOnly}
                onClick={() => {
                  setDraft({ ...DEFAULT_THEME_TOKENS });
                  setDirty(true);
                }}
              />
            </div>
          )}
        </aside>

        <div className="min-w-0 space-y-3">
          {readOnly && selected && (
            <p className="rounded-lg bg-gray-50 px-2.5 py-2 text-[11.5px] leading-snug text-gray-600">
              {selected.is_builtin
                ? 'Built-in themes cannot be edited. Duplicate it to make changes.'
                : 'You do not have permission to edit this theme.'}
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <TextInput label="Theme name" value={name} onChange={value => { setName(value); setDirty(true); }} disabled={readOnly} />
            <TextArea
              label="Description"
              rows={1}
              value={description}
              onChange={value => {
                setDescription(value);
                setDirty(true);
              }}
              disabled={readOnly}
            />
          </div>

          <Segmented label="Theme settings" size="sm" fullWidth value={tab} onChange={setTab} options={tabs.map(entry => ({ value: entry.id, label: entry.label }))} />

          <div className="max-h-[42vh] space-y-3 overflow-y-auto pr-1">
            {tab === 'colors' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <ColorInput label="Page background" palette={palette} value={draft.pageBackground} onChange={value => setToken('pageBackground', value || '#ffffff')} allowAutomatic={false} />
                <ColorInput label="Content background" palette={palette} value={draft.contentBackground} onChange={value => setToken('contentBackground', value || '#ffffff')} allowAutomatic={false} />
                <ColorInput label="Primary" palette={palette} value={draft.primaryColor} onChange={value => setToken('primaryColor', value || '#000000')} allowAutomatic={false} />
                <ColorInput label="Secondary" palette={palette} value={draft.secondaryColor} onChange={value => setToken('secondaryColor', value || '#000000')} allowAutomatic={false} />
                <ColorInput label="Headings" palette={palette} value={draft.headingColor} onChange={value => setToken('headingColor', value || '#000000')} allowAutomatic={false} />
                <ColorInput label="Body text" palette={palette} value={draft.bodyTextColor} onChange={value => setToken('bodyTextColor', value || '#000000')} allowAutomatic={false} />
                <ColorInput label="Muted text" palette={palette} value={draft.mutedTextColor} onChange={value => setToken('mutedTextColor', value || '#000000')} allowAutomatic={false} />
                <ColorInput label="Links" palette={palette} value={draft.linkColor} onChange={value => setToken('linkColor', value || '#000000')} allowAutomatic={false} />
                <ColorInput label="Button background" palette={palette} value={draft.buttonBackground} onChange={value => setToken('buttonBackground', value || '#000000')} allowAutomatic={false} />
                <ColorInput label="Button text" palette={palette} value={draft.buttonTextColor} onChange={value => setToken('buttonTextColor', value || '#ffffff')} allowAutomatic={false} />
                <ColorInput label="Dividers" palette={palette} value={draft.dividerColor} onChange={value => setToken('dividerColor', value || '#e5e7eb')} allowAutomatic={false} />
              </div>
            )}

            {tab === 'typography' && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectInput label="Body font" value={draft.bodyFont} onChange={value => setToken('bodyFont', value)} options={fontOptions.filter(option => option.value)} disabled={readOnly} />
                  <SelectInput label="Heading font" value={draft.headingFont} onChange={value => setToken('headingFont', value)} options={fontOptions.filter(option => option.value)} disabled={readOnly} />
                  <NumberInput label="Body size" value={draft.bodyFontSize} onChange={value => setToken('bodyFontSize', value || 16)} min={10} max={24} suffix="px" disabled={readOnly} />
                  <NumberInput label="Line height" value={draft.lineHeight} onChange={value => setToken('lineHeight', value || 1.5)} min={1} max={2.4} step={0.1} disabled={readOnly} />
                </div>
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">Heading sizes</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(Object.keys(DEFAULT_HEADING_SIZES) as (keyof typeof DEFAULT_HEADING_SIZES)[]).map(level => (
                    <NumberInput
                      key={level}
                      label={level.toUpperCase()}
                      value={draft.headingSizes[level]}
                      onChange={value =>
                        setToken('headingSizes', { ...draft.headingSizes, [level]: value || DEFAULT_HEADING_SIZES[level] })
                      }
                      min={10}
                      max={56}
                      suffix="px"
                      disabled={readOnly}
                    />
                  ))}
                </div>
              </div>
            )}

            {tab === 'layout' && (
              <div className="space-y-3">
                <SliderInput label="Content width" value={draft.contentWidth} onChange={value => setToken('contentWidth', value)} min={480} max={800} step={10} suffix="px" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberInput label="Section padding, vertical" value={draft.sectionPaddingY} onChange={value => setToken('sectionPaddingY', value || 0)} min={0} max={80} suffix="px" disabled={readOnly} />
                  <NumberInput label="Section padding, horizontal" value={draft.sectionPaddingX} onChange={value => setToken('sectionPaddingX', value || 0)} min={0} max={80} suffix="px" disabled={readOnly} />
                  <NumberInput label="Button corner radius" value={draft.buttonRadius} onChange={value => setToken('buttonRadius', value || 0)} min={0} max={32} suffix="px" disabled={readOnly} />
                  <SelectInput
                    label="Default border style"
                    value={draft.borderStyle}
                    onChange={value => setToken('borderStyle', value as ThemeTokens['borderStyle'])}
                    options={[
                      { value: 'none', label: 'None' },
                      { value: 'solid', label: 'Solid' },
                      { value: 'dashed', label: 'Dashed' },
                      { value: 'dotted', label: 'Dotted' },
                      { value: 'double', label: 'Double' },
                    ]}
                    disabled={readOnly}
                  />
                </div>
              </div>
            )}

            {tab === 'brand' && (
              <div className="space-y-3">
                <LogoField
                  label="Primary logo"
                  value={draft.brand?.primaryLogo || ''}
                  disabled={readOnly}
                  onPick={() => onPickAsset(asset => setBrand('primaryLogo', asset.url), 'Primary logo')}
                  onClear={() => setBrand('primaryLogo', null)}
                />
                <LogoField
                  label="Secondary logo"
                  value={draft.brand?.secondaryLogo || ''}
                  disabled={readOnly}
                  onPick={() => onPickAsset(asset => setBrand('secondaryLogo', asset.url), 'Secondary logo')}
                  onClear={() => setBrand('secondaryLogo', null)}
                />
                <LogoField
                  label="Logo for dark backgrounds"
                  value={draft.brand?.darkLogo || ''}
                  disabled={readOnly}
                  onPick={() => onPickAsset(asset => setBrand('darkLogo', asset.url), 'Dark background logo')}
                  onClear={() => setBrand('darkLogo', null)}
                />
                <TextInput label="Organization name" value={draft.brand?.organizationName || ''} onChange={value => setBrand('organizationName', value)} disabled={readOnly} />
                <TextArea
                  label="Postal address"
                  rows={2}
                  value={draft.brand?.organizationAddress || ''}
                  onChange={value => setBrand('organizationAddress', value)}
                  disabled={readOnly}
                  hint="Required in the footer for most bulk email regulations."
                />
                <TextArea
                  label="Standard legal text"
                  rows={2}
                  value={draft.brand?.standardLegalText || ''}
                  onChange={value => setBrand('standardLegalText', value)}
                  disabled={readOnly}
                />
                <SocialLinksEditor
                  links={draft.brand?.socialLinks || []}
                  disabled={readOnly}
                  onChange={links => setBrand('socialLinks', links)}
                />
              </div>
            )}
          </div>
        </div>

        <ThemePreview tokens={draft} />
      </div>
    </Dialog>
  );
}

function SmallAction({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={disabled}
      className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[11.5px] font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
    >
      {icon}
      {label}
    </button>
  );
}

function LogoField({
  label,
  value,
  onPick,
  onClear,
  disabled,
}: {
  label: string;
  value: string;
  onPick: () => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-gray-600">{label}</p>
      <div className="flex items-center gap-2">
        <span className="flex h-10 w-16 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
          {value ? <img src={value} alt="" className="max-h-full max-w-full object-contain" /> : <ImageIcon size={14} className="text-gray-400" />}
        </span>
        <button
          type="button"
          onClick={onPick}
          disabled={disabled}
          className="rounded-lg border border-gray-200 px-2 py-1 text-[11.5px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          {value ? 'Replace' : 'Choose image'}
        </button>
        {value && (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="text-[11.5px] font-medium text-gray-500 hover:text-red-600 disabled:opacity-40"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

function SocialLinksEditor({
  links,
  onChange,
  disabled,
}: {
  links: { network: string; url: string; label: string }[];
  onChange: (links: { network: string; url: string; label: string }[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-gray-600">Social links</p>
      {links.map((link, index) => (
        <div key={`${link.network}-${index}`} className="flex items-center gap-1.5">
          <input
            value={link.network}
            onChange={event => {
              const next = [...links];
              next[index] = { ...link, network: event.target.value };
              onChange(next);
            }}
            placeholder="Network"
            aria-label="Network"
            disabled={disabled}
            className="w-24 rounded-lg border border-gray-200 px-2 py-1 text-[11.5px] focus:border-brand-400 focus:outline-none"
          />
          <input
            value={link.url}
            onChange={event => {
              const next = [...links];
              next[index] = { ...link, url: event.target.value };
              onChange(next);
            }}
            placeholder="https://"
            aria-label="URL"
            disabled={disabled}
            className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1 text-[11.5px] focus:border-brand-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onChange(links.filter((_, entry) => entry !== index))}
            disabled={disabled}
            aria-label={`Remove ${link.network || 'social link'}`}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-40"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...links, { network: '', url: '', label: '' }])}
        disabled={disabled}
        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-2 py-1 text-[11.5px] font-medium text-gray-600 hover:border-brand-400 hover:text-brand-700 disabled:opacity-40"
      >
        <Plus size={11} />
        Add a social link
      </button>
    </div>
  );
}

function ThemePreview({ tokens }: { tokens: ThemeTokens }) {
  return (
    <aside className="rounded-xl p-3" style={{ backgroundColor: tokens.pageBackground }}>
      <p className="mb-2 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: tokens.mutedTextColor }}>
        <Palette size={10} />
        Preview
      </p>
      <div className="rounded-lg p-3" style={{ backgroundColor: tokens.contentBackground }}>
        <p
          style={{
            fontFamily: tokens.headingFont,
            fontSize: Math.min(24, tokens.headingSizes.h2),
            color: tokens.headingColor,
            margin: 0,
            lineHeight: 1.25,
          }}
        >
          A clear headline
        </p>
        <p
          style={{
            fontFamily: tokens.bodyFont,
            fontSize: tokens.bodyFontSize,
            lineHeight: tokens.lineHeight,
            color: tokens.bodyTextColor,
            marginTop: 8,
          }}
        >
          Body copy shows the reading experience recipients get, including{' '}
          <span style={{ color: tokens.linkColor, textDecoration: 'underline' }}>a link</span>.
        </p>
        <div style={{ height: 1, backgroundColor: tokens.dividerColor, margin: '12px 0' }} />
        <span
          style={{
            display: 'inline-block',
            backgroundColor: tokens.buttonBackground,
            color: tokens.buttonTextColor,
            borderRadius: tokens.buttonRadius,
            padding: '9px 16px',
            fontFamily: tokens.bodyFont,
            fontSize: Math.max(12, tokens.bodyFontSize - 1),
            fontWeight: 700,
          }}
        >
          Primary action
        </span>
        <p style={{ fontFamily: tokens.bodyFont, fontSize: 12, color: tokens.mutedTextColor, marginTop: 12 }}>
          {tokens.brand?.organizationName || 'Organization name'} · {tokens.contentWidth}px wide
        </p>
      </div>
    </aside>
  );
}
