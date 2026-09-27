/**
 * The right-hand properties panel (spec 4.3, 6.4).
 *
 * Shows the settings for whatever is selected — document, section, row, column or
 * block — with a search box that filters groups by name and keyword.
 */

import { useMemo, useState } from 'react';
import { FileText, Layers, Rows3, Search, SquareStack, Type, X, Columns2 } from 'lucide-react';
import type { Column, EmailDocument, Row, Section } from '../model/document';
import { BLOCK_LABELS } from '../model/document';
import { setColumnCount, setColumnProportions } from '../model/mutations';
import { useComposer } from '../store/composerStore';
import {
  AlignInput,
  NumberInput,
  SelectInput,
  SliderInput,
  TextInput,
  ToggleInput,
  VAlignInput,
} from '../ui/controls';
import { InlineEmpty } from '../ui/primitives';
import { BlockInspector } from './BlockInspector';
import {
  BackgroundGroup,
  BorderGroup,
  Group,
  InspectorSearchProvider,
  ResponsiveGroup,
  SpacingGroup,
  usePalette,
  type InspectorActions,
} from './inspectorParts';
import { ColumnProportionBar } from '../visual/Canvas';

export function Inspector({ actions }: { actions: InspectorActions }) {
  const [term, setTerm] = useState('');
  const doc = useComposer(store => store.doc);
  const primaryId = useComposer(store => store.primaryId);
  const selectedNode = useComposer(store => store.selectedNode);
  const themeTokens = useComposer(store => store.themeTokens);
  const tokens = themeTokens();
  const palette = usePalette(tokens);

  const found = useMemo(() => (primaryId ? selectedNode() : null), [primaryId, selectedNode, doc]);

  const header = describeSelection(found?.kind ?? 'document', found?.node);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-gray-100 px-3 py-2.5">
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-gray-400">{header.icon}</span>
          <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-gray-800">{header.title}</p>
        </div>
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={term}
            onChange={event => setTerm(event.target.value)}
            placeholder="Search settings"
            aria-label="Search settings"
            className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-7 text-[12.5px] placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {term && (
            <button
              type="button"
              onClick={() => setTerm('')}
              aria-label="Clear settings search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <InspectorSearchProvider value={term}>
          {!found ? (
            <DocumentInspector doc={doc} palette={palette} actions={actions} />
          ) : found.kind === 'section' ? (
            <SectionInspector section={found.node as Section} palette={palette} actions={actions} />
          ) : found.kind === 'row' ? (
            <RowInspector row={found.node as Row} palette={palette} actions={actions} />
          ) : found.kind === 'column' ? (
            <ColumnInspector column={found.node as Column} palette={palette} actions={actions} />
          ) : (
            <BlockInspector
              block={found.node as Parameters<typeof BlockInspector>[0]['block']}
              tokens={tokens}
              palette={palette}
              actions={actions}
            />
          )}
        </InspectorSearchProvider>
      </div>
    </div>
  );
}

function describeSelection(kind: string, node: unknown) {
  if (kind === 'section') {
    const section = node as Section;
    return {
      icon: <SquareStack size={13} />,
      title: section.name || `${section.role === 'body' ? 'Section' : section.role === 'header' ? 'Header' : 'Footer'}`,
    };
  }
  if (kind === 'row') {
    const row = node as Row;
    return { icon: <Rows3 size={13} />, title: row.name || `Row · ${row.columns.length} columns` };
  }
  if (kind === 'column') {
    const column = node as Column;
    return { icon: <Columns2 size={13} />, title: column.name || `Column · ${Math.round(column.widthPct)}%` };
  }
  if (kind === 'block') {
    const block = node as { type: keyof typeof BLOCK_LABELS; name?: string | null };
    return { icon: <Type size={13} />, title: block.name || BLOCK_LABELS[block.type] };
  }
  return { icon: <FileText size={13} />, title: 'Email settings' };
}

// ── document ──────────────────────────────────────────────────────────────────

function DocumentInspector({
  doc,
  palette,
  actions,
}: {
  doc: EmailDocument;
  palette: ReturnType<typeof usePalette>;
  actions: InspectorActions;
}) {
  const updateSettings = useComposer(store => store.updateSettings);
  const settings = useComposer(store => store.settings);
  const themes = useComposer(store => store.themes);
  const themeCode = useComposer(store => store.themeCode);
  const setThemeCode = useComposer(store => store.setThemeCode);
  const subject = useComposer(store => store.subject);
  const setSubject = useComposer(store => store.setSubject);
  const preheader = useComposer(store => store.preheader);
  const setPreheader = useComposer(store => store.setPreheader);
  const can = useComposer(store => store.can);

  const minWidth = settings?.min_email_width ?? 320;
  const maxWidth = settings?.max_email_width ?? 900;

  return (
    <>
      <Group title="Subject and preheader" keywords={['subject', 'preheader', 'preview text', 'inbox']}>
        <TextInput
          label="Subject line"
          commitOnBlur
          value={subject}
          onChange={setSubject}
          placeholder="What recipients see in the inbox"
          hint={subject.length > 78 ? `${subject.length} characters — many clients truncate near 78.` : undefined}
        />
        <TextInput
          label="Preheader"
          commitOnBlur
          value={preheader}
          onChange={setPreheader}
          placeholder="A short line shown after the subject"
          hint="Hidden in the email body but shown in most inbox previews."
        />
      </Group>

      <Group title="Theme" keywords={['theme', 'brand', 'tokens', 'colours', 'fonts']}>
        <SelectInput
          label="Theme"
          value={themeCode || ''}
          options={[
            { value: '', label: 'Organization default' },
            ...themes
              .filter(theme => !theme.archived_at)
              .map(theme => ({ value: theme.public_code, label: theme.name })),
          ]}
          onChange={value => setThemeCode(value || null)}
        />
        {can('manage_themes') && (
          <button
            type="button"
            onClick={actions.openThemeEditor}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-200"
          >
            <Layers size={12} />
            Manage themes
          </button>
        )}
      </Group>

      <Group title="Width" keywords={['width', 'content width', 'size', 'narrow', 'wide']}>
        <SliderInput
          label="Content width"
          suffix="px"
          min={minWidth}
          max={maxWidth}
          step={10}
          value={doc.settings.contentWidth}
          onChange={contentWidth => updateSettings({ contentWidth })}
        />
        <p className="text-[10.5px] leading-snug text-gray-500">
          600–640px is the safest range. Wider emails can break in Outlook reading panes.
        </p>
      </Group>

      <BackgroundGroup
        title="Page background"
        background={doc.settings.outerBackground}
        palette={palette}
        onChange={outerBackground => updateSettings({ outerBackground })}
        onPickImage={() =>
          actions.pickAsset(asset =>
            updateSettings({ outerBackground: { ...doc.settings.outerBackground, mode: 'image', imageUrl: asset.url } })
          )
        }
      />
      <BackgroundGroup
        title="Content background"
        background={doc.settings.background}
        palette={palette}
        onChange={background => updateSettings({ background })}
        onPickImage={() =>
          actions.pickAsset(asset =>
            updateSettings({ background: { ...doc.settings.background, mode: 'image', imageUrl: asset.url } })
          )
        }
      />

      <Group title="Language and direction" keywords={['language', 'lang', 'direction', 'rtl', 'accessibility']} defaultOpen={false}>
        <TextInput
          label="Document language"
          commitOnBlur
          value={doc.settings.lang}
          onChange={lang => updateSettings({ lang: lang || 'en' })}
          hint="Screen readers use this to choose the correct pronunciation."
        />
        <SelectInput
          label="Text direction"
          value={doc.settings.direction}
          options={[
            { value: 'ltr', label: 'Left to right' },
            { value: 'rtl', label: 'Right to left' },
          ]}
          onChange={direction => updateSettings({ direction })}
        />
      </Group>
    </>
  );
}

// ── section ───────────────────────────────────────────────────────────────────

function SectionInspector({
  section,
  palette,
  actions,
}: {
  section: Section;
  palette: ReturnType<typeof usePalette>;
  actions: InspectorActions;
}) {
  const update = useComposer(store => store.updateNodeById);
  const patch = (values: Record<string, unknown>, label?: string) => update(section.id, values, label);

  return (
    <>
      <Group title="Section" keywords={['role', 'header', 'footer', 'name', 'width', 'alignment', 'height']}>
        <TextInput
          label="Name"
          commitOnBlur
          placeholder="Shown in the Layers panel"
          value={section.name || ''}
          onChange={name => patch({ name: name || null }, 'Rename section')}
        />
        <SelectInput
          label="Role"
          value={section.role}
          options={[
            { value: 'header', label: 'Header' },
            { value: 'body', label: 'Body' },
            { value: 'footer', label: 'Footer' },
          ]}
          onChange={role => patch({ role }, 'Change section role')}
          hint="Roles help validation check that a footer carries the required links."
        />
        <NumberInput
          label="Content width"
          suffix="px"
          min={200}
          max={1200}
          allowEmpty
          placeholder="Inherit from the email"
          value={section.contentWidth}
          onChange={contentWidth => patch({ contentWidth }, 'Change section width')}
        />
        <NumberInput
          label="Minimum height"
          suffix="px"
          min={0}
          max={800}
          allowEmpty
          value={section.minHeight}
          onChange={minHeight => patch({ minHeight }, 'Change minimum height')}
        />
        <AlignInput value={section.align} onChange={align => patch({ align }, 'Change alignment')} />
        <VAlignInput value={section.vAlign} onChange={vAlign => patch({ vAlign }, 'Change vertical alignment')} />
      </Group>

      <SpacingGroup padding={section.padding} onChange={padding => patch({ padding }, 'Change section padding')} />

      <BackgroundGroup
        title="Full-width background"
        background={section.outerBackground}
        palette={palette}
        onChange={outerBackground => patch({ outerBackground }, 'Change section background')}
        onPickImage={() =>
          actions.pickAsset(asset =>
            patch({ outerBackground: { ...section.outerBackground, mode: 'image', imageUrl: asset.url } })
          )
        }
      />
      <BackgroundGroup
        title="Inner background"
        background={section.background}
        palette={palette}
        onChange={background => patch({ background }, 'Change section background')}
        onPickImage={() =>
          actions.pickAsset(asset => patch({ background: { ...section.background, mode: 'image', imageUrl: asset.url } }))
        }
      />
      <BorderGroup border={section.border} palette={palette} onChange={border => patch({ border }, 'Change section border')} />

      <ResponsiveGroup
        visibility={section.visibility}
        onVisibilityChange={visibility => patch({ visibility }, 'Change section visibility')}
      />

      <Group title="Advanced" keywords={['lock', 'reusable', 'save']} defaultOpen={false}>
        <ToggleInput
          label="Locked"
          value={!!section.locked}
          onChange={locked => patch({ locked }, 'Change lock')}
        />
        <button
          type="button"
          onClick={() => actions.saveReusable(section.id, 'section')}
          className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-200"
        >
          Save section as reusable content
        </button>
      </Group>
    </>
  );
}

// ── row ───────────────────────────────────────────────────────────────────────

function RowInspector({
  row,
  palette,
  actions,
}: {
  row: Row;
  palette: ReturnType<typeof usePalette>;
  actions: InspectorActions;
}) {
  const update = useComposer(store => store.updateNodeById);
  const commit = useComposer(store => store.commit);
  const patch = (values: Record<string, unknown>, label?: string) => update(row.id, values, label);

  const applyWidths = (widths: number[]) => {
    commit(doc => setColumnProportions(doc, row.id, widths), 'Resize columns');
  };

  return (
    <>
      <Group title="Columns" keywords={['columns', 'count', 'proportions', 'width', 'split']}>
        <SelectInput
          label="Number of columns"
          value={String(row.columns.length)}
          options={[1, 2, 3, 4].map(count => ({ value: String(count), label: `${count} column${count === 1 ? '' : 's'}` }))}
          onChange={value => commit(doc => setColumnCount(doc, row.id, Number(value)), 'Change column count')}
          hint="Removing a column moves its blocks into the previous column."
        />
        {row.columns.length > 1 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-gray-600">Proportions</p>
            <ColumnProportionBar row={row} onChange={applyWidths} />
            <div className="flex flex-wrap gap-1">
              {presetsFor(row.columns.length).map(preset => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyWidths(preset.widths)}
                  className="rounded-md border border-gray-200 px-1.5 py-0.5 text-[10.5px] font-medium text-gray-600 hover:border-brand-300 hover:text-brand-700"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <NumberInput
          label="Gap between columns"
          suffix="px"
          min={0}
          max={48}
          value={row.gap}
          onChange={gap => patch({ gap: gap ?? 0 }, 'Change column gap')}
        />
        <VAlignInput value={row.vAlign} onChange={vAlign => patch({ vAlign }, 'Change vertical alignment')} />
        <NumberInput
          label="Minimum height"
          suffix="px"
          min={0}
          max={600}
          allowEmpty
          value={row.minHeight}
          onChange={minHeight => patch({ minHeight }, 'Change minimum height')}
        />
      </Group>

      <Group title="Mobile stacking" keywords={['stack', 'mobile', 'order', 'reverse', 'responsive']}>
        <ToggleInput
          label="Stack columns on mobile"
          hint="Recommended. Side-by-side columns are usually unreadable below 480px."
          value={row.stackOnMobile}
          onChange={stackOnMobile => patch({ stackOnMobile }, 'Change mobile stacking')}
        />
        {row.stackOnMobile && row.columns.length > 1 && (
          <ToggleInput
            label="Reverse the order when stacked"
            hint="Useful when the image should appear above the text on mobile."
            value={row.reverseOnMobile}
            onChange={reverseOnMobile => patch({ reverseOnMobile }, 'Change mobile order')}
          />
        )}
      </Group>

      <SpacingGroup padding={row.padding} onChange={padding => patch({ padding }, 'Change row padding')} />
      <BackgroundGroup
        background={row.background}
        palette={palette}
        onChange={background => patch({ background }, 'Change row background')}
        onPickImage={() => actions.pickAsset(asset => patch({ background: { ...row.background, mode: 'image', imageUrl: asset.url } }))}
      />
      <BorderGroup border={row.border} palette={palette} onChange={border => patch({ border }, 'Change row border')} />
      <ResponsiveGroup visibility={row.visibility} onVisibilityChange={visibility => patch({ visibility }, 'Change row visibility')} />

      <Group title="Advanced" keywords={['name', 'lock']} defaultOpen={false}>
        <TextInput
          label="Name"
          commitOnBlur
          value={row.name || ''}
          onChange={name => patch({ name: name || null }, 'Rename row')}
        />
        <ToggleInput label="Locked" value={!!row.locked} onChange={locked => patch({ locked }, 'Change lock')} />
      </Group>
    </>
  );
}

function presetsFor(count: number): { label: string; widths: number[] }[] {
  if (count === 2) {
    return [
      { label: '50 / 50', widths: [50, 50] },
      { label: '33 / 67', widths: [33, 67] },
      { label: '67 / 33', widths: [67, 33] },
      { label: '25 / 75', widths: [25, 75] },
      { label: '75 / 25', widths: [75, 25] },
    ];
  }
  if (count === 3) {
    return [
      { label: 'Equal', widths: [34, 33, 33] },
      { label: '25 / 50 / 25', widths: [25, 50, 25] },
      { label: '50 / 25 / 25', widths: [50, 25, 25] },
    ];
  }
  if (count === 4) return [{ label: 'Equal', widths: [25, 25, 25, 25] }];
  return [];
}

// ── column ────────────────────────────────────────────────────────────────────

function ColumnInspector({
  column,
  palette,
  actions,
}: {
  column: Column;
  palette: ReturnType<typeof usePalette>;
  actions: InspectorActions;
}) {
  const update = useComposer(store => store.updateNodeById);
  const patch = (values: Record<string, unknown>, label?: string) => update(column.id, values, label);

  return (
    <>
      <Group title="Column" keywords={['width', 'name', 'alignment', 'minimum width', 'order']}>
        <TextInput
          label="Name"
          commitOnBlur
          value={column.name || ''}
          onChange={name => patch({ name: name || null }, 'Rename column')}
        />
        <SliderInput
          label="Width"
          suffix="%"
          min={10}
          max={100}
          value={Math.round(column.widthPct)}
          onChange={widthPct => patch({ widthPct }, 'Resize column')}
        />
        <p className="text-[10.5px] leading-snug text-gray-500">
          Widths in a row are normalized to 100% when you leave this panel.
        </p>
        <NumberInput
          label="Minimum width"
          suffix="px"
          min={0}
          max={600}
          allowEmpty
          value={column.minWidth}
          onChange={minWidth => patch({ minWidth }, 'Change minimum width')}
        />
        <VAlignInput value={column.vAlign} onChange={vAlign => patch({ vAlign }, 'Change vertical alignment')} />
        <NumberInput
          label="Mobile stacking position"
          min={1}
          max={4}
          allowEmpty
          placeholder="Document order"
          value={column.mobileOrder}
          onChange={mobileOrder => patch({ mobileOrder }, 'Change mobile order')}
        />
        <ToggleInput
          label="Keep side by side on mobile"
          hint="Only suitable for very narrow content such as icons."
          value={column.keepSideBySideOnMobile}
          onChange={keepSideBySideOnMobile => patch({ keepSideBySideOnMobile }, 'Change mobile behaviour')}
        />
      </Group>

      <SpacingGroup padding={column.padding} onChange={padding => patch({ padding }, 'Change column padding')} />
      <BackgroundGroup
        background={column.background}
        palette={palette}
        onChange={background => patch({ background }, 'Change column background')}
        onPickImage={() =>
          actions.pickAsset(asset => patch({ background: { ...column.background, mode: 'image', imageUrl: asset.url } }))
        }
      />
      <BorderGroup border={column.border} palette={palette} onChange={border => patch({ border }, 'Change column border')} />
      <ResponsiveGroup
        visibility={column.visibility}
        onVisibilityChange={visibility => patch({ visibility }, 'Change column visibility')}
      />

      <Group title="Advanced" keywords={['lock']} defaultOpen={false}>
        <ToggleInput label="Locked" value={!!column.locked} onChange={locked => patch({ locked }, 'Change lock')} />
        {!column.blocks.length && (
          <InlineEmpty title="This column is empty" description="Add a block from the left panel or drag one in." />
        )}
      </Group>
    </>
  );
}