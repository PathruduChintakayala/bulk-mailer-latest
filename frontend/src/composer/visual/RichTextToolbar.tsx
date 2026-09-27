/**
 * Formatting toolbar for the block being edited (spec 5.1 – 5.6).
 *
 * Shown only while a rich-text block is in edit mode, so the controls always act
 * on a known target. Overflow collapses into a menu on narrow workspaces.
 */

import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import clsx from 'clsx';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Braces,
  Brush,
  Code,
  Eraser,
  Highlighter,
  Indent,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Omega,
  Outdent,
  Replace,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Type,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { Popover, Segmented, ToolButton, ToolbarDivider, ToolbarGroup, usePopoverContext } from '../ui/primitives';
import { ColorMenu, type ColorPalette } from '../ui/controls';
import { EMAIL_SAFE_FONTS, type ThemeTokens } from '../model/theme';

const FONT_SIZES = [11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 28, 32, 36, 40, 48];
const LINE_HEIGHTS = [1, 1.15, 1.25, 1.4, 1.5, 1.6, 1.75, 2];

const SPECIAL_CHARACTERS: { char: string; name: string }[] = [
  { char: '\u00a0', name: 'Non-breaking space' },
  { char: '—', name: 'Em dash' },
  { char: '–', name: 'En dash' },
  { char: '•', name: 'Bullet' },
  { char: '·', name: 'Middle dot' },
  { char: '…', name: 'Ellipsis' },
  { char: '“', name: 'Left double quote' },
  { char: '”', name: 'Right double quote' },
  { char: '‘', name: 'Left single quote' },
  { char: '’', name: 'Right single quote' },
  { char: '©', name: 'Copyright' },
  { char: '®', name: 'Registered' },
  { char: '™', name: 'Trademark' },
  { char: '€', name: 'Euro' },
  { char: '£', name: 'Pound' },
  { char: '¥', name: 'Yen' },
  { char: '°', name: 'Degree' },
  { char: '±', name: 'Plus-minus' },
  { char: '×', name: 'Multiplication' },
  { char: '→', name: 'Right arrow' },
  { char: '←', name: 'Left arrow' },
  { char: '✓', name: 'Check mark' },
  { char: '★', name: 'Star' },
  { char: '§', name: 'Section' },
];

export interface FormatPainterState {
  fontFamily?: string;
  fontSize?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}

export function RichTextToolbar({
  editor,
  palette,
  tokens,
  onInsertMergeField,
  onEditLink,
  onOpenFindReplace,
  supportsHeadings = true,
}: {
  editor: Editor | null;
  palette: ColorPalette;
  tokens: ThemeTokens;
  onInsertMergeField: () => void;
  onEditLink: () => void;
  onOpenFindReplace: () => void;
  supportsHeadings?: boolean;
}) {
  const [painter, setPainter] = useState<FormatPainterState | null>(null);
  const [, forceRender] = useState(0);
  const painterRef = useRef<FormatPainterState | null>(null);
  painterRef.current = painter;

  // Selection changes must refresh the active states of every control.
  useEffect(() => {
    if (!editor) return;
    const refresh = () => forceRender(value => value + 1);
    editor.on('selectionUpdate', refresh);
    editor.on('transaction', refresh);
    return () => {
      editor.off('selectionUpdate', refresh);
      editor.off('transaction', refresh);
    };
  }, [editor]);

  // Applying the painter on the next selection mirrors how word processors behave.
  useEffect(() => {
    if (!editor || !painter) return;
    const apply = () => {
      const state = painterRef.current;
      if (!state || editor.state.selection.empty) return;
      const chain = editor.chain().focus();
      if (state.fontFamily) chain.setFontFamily(state.fontFamily);
      if (state.color) chain.setColor(state.color);
      state.bold ? chain.setBold() : chain.unsetBold();
      state.italic ? chain.setItalic() : chain.unsetItalic();
      state.underline ? chain.setUnderline() : chain.unsetUnderline();
      state.strike ? chain.setStrike() : chain.unsetStrike();
      chain.run();
      setPainter(null);
    };
    editor.on('selectionUpdate', apply);
    return () => {
      editor.off('selectionUpdate', apply);
    };
  }, [editor, painter]);

  if (!editor) {
    return (
      <div className="flex h-9 items-center px-3 text-[11.5px] text-gray-400">
        Select a text block and press Enter or double-click to start editing.
      </div>
    );
  }

  const attrs = editor.getAttributes('textStyle') as { fontFamily?: string; fontSize?: string; color?: string };
  const currentFont = attrs.fontFamily || '';
  const paragraphStyle = supportsHeadings
    ? editor.isActive('heading', { level: 1 })
      ? 'h1'
      : editor.isActive('heading', { level: 2 })
        ? 'h2'
        : editor.isActive('heading', { level: 3 })
          ? 'h3'
          : editor.isActive('heading', { level: 4 })
            ? 'h4'
            : editor.isActive('blockquote')
              ? 'quote'
              : 'p'
    : 'p';

  const applyParagraphStyle = (value: string) => {
    const chain = editor.chain().focus();
    if (value === 'p') chain.setParagraph().run();
    else if (value === 'quote') chain.toggleBlockquote().run();
    else chain.setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 | 4 }).run();
  };

  const setFontSize = (size: number | null) => {
    const chain = editor.chain().focus();
    // TipTap has no fontSize mark, so a textStyle attribute carries it.
    if (size) chain.setMark('textStyle', { fontSize: `${size}px` }).run();
    else chain.setMark('textStyle', { fontSize: null }).run();
  };

  return (
    <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto px-2 py-1" role="toolbar" aria-label="Text formatting">
      {supportsHeadings && (
        <>
          <select
            aria-label="Paragraph style"
            value={paragraphStyle}
            onChange={event => applyParagraphStyle(event.target.value)}
            className="h-7 shrink-0 rounded-lg border border-gray-200 bg-white px-1.5 text-[12px] text-gray-700 focus:border-brand-400 focus:outline-none"
          >
            <option value="p">Body text</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="h4">Heading 4</option>
            <option value="quote">Quote</option>
          </select>
          <ToolbarDivider />
        </>
      )}

      <select
        aria-label="Font"
        value={currentFont}
        onChange={event => {
          const stack = event.target.value;
          if (stack) editor.chain().focus().setFontFamily(stack).run();
          else editor.chain().focus().unsetFontFamily().run();
        }}
        className="h-7 w-28 shrink-0 rounded-lg border border-gray-200 bg-white px-1.5 text-[12px] text-gray-700 focus:border-brand-400 focus:outline-none"
      >
        <option value="">Theme font</option>
        {EMAIL_SAFE_FONTS.map(font => (
          <option key={font.label} value={font.stack}>
            {font.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Font size"
        value={attrs.fontSize ? parseInt(attrs.fontSize, 10) : ''}
        onChange={event => setFontSize(event.target.value ? Number(event.target.value) : null)}
        className="h-7 w-16 shrink-0 rounded-lg border border-gray-200 bg-white px-1.5 text-[12px] tabular-nums text-gray-700 focus:border-brand-400 focus:outline-none"
      >
        <option value="">{tokens.bodyFontSize}</option>
        {FONT_SIZES.map(size => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>

      <Popover
        label="Advanced typography"
        width={240}
        trigger={({ toggle, ref }) => (
          <span ref={node => ref(node)} className="inline-flex">
            <ToolButton size="sm" icon={<Type size={13} />} label="Advanced typography" onClick={toggle} />
          </span>
        )}
      >
        <TypographyMenu editor={editor} tokens={tokens} />
      </Popover>

      <ToolbarDivider />

      <ToolbarGroup label="Character formatting">
        <ToolButton
          size="sm"
          icon={<Bold size={14} />}
          label="Bold"
          shortcut="Ctrl+B"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolButton
          size="sm"
          icon={<Italic size={14} />}
          label="Italic"
          shortcut="Ctrl+I"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolButton
          size="sm"
          icon={<UnderlineIcon size={14} />}
          label="Underline"
          shortcut="Ctrl+U"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolButton
          size="sm"
          icon={<Strikethrough size={14} />}
          label="Strikethrough"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <ToolButton
          size="sm"
          icon={<SuperscriptIcon size={14} />}
          label="Superscript"
          active={editor.isActive('superscript')}
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
        />
        <ToolButton
          size="sm"
          icon={<SubscriptIcon size={14} />}
          label="Subscript"
          active={editor.isActive('subscript')}
          onClick={() => editor.chain().focus().toggleSubscript().run()}
        />
        <ToolButton
          size="sm"
          icon={<Code size={14} />}
          label="Inline code"
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />
      </ToolbarGroup>

      <ToolbarDivider />

      {/* Text colour: an A with a coloured underline, per spec 5.4. */}
      <Popover
        label="Text colour"
        width={252}
        trigger={({ toggle, ref }) => (
          <span ref={node => ref(node)} className="inline-flex">
            <button
              type="button"
              onClick={toggle}
              title="Text colour"
              aria-label="Text colour"
              className="inline-flex h-7 w-7 flex-col items-center justify-center rounded-lg text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Baseline size={13} />
              <span
                className="mt-[1px] block h-[3px] w-4 rounded-sm"
                style={{ backgroundColor: attrs.color || tokens.bodyTextColor }}
              />
            </button>
          </span>
        )}
      >
        <ColorMenu
          value={attrs.color || null}
          palette={palette}
          allowAutomatic
          automaticLabel="Automatic (theme)"
          onChange={color => {
            if (color) editor.chain().focus().setColor(color).run();
            else editor.chain().focus().unsetColor().run();
          }}
        />
      </Popover>

      <Popover
        label="Highlight colour"
        width={252}
        trigger={({ toggle, ref }) => (
          <span ref={node => ref(node)} className="inline-flex">
            <ToolButton
              size="sm"
              icon={<Highlighter size={14} />}
              label="Highlight colour"
              active={editor.isActive('highlight')}
              onClick={toggle}
            />
          </span>
        )}
      >
        <ColorMenu
          value={(editor.getAttributes('highlight') as { color?: string }).color || null}
          palette={palette}
          allowAutomatic
          automaticLabel="No highlight"
          onChange={color => {
            if (color) editor.chain().focus().setHighlight({ color }).run();
            else editor.chain().focus().unsetHighlight().run();
          }}
        />
      </Popover>

      <ToolbarDivider />

      <ToolbarGroup label="Paragraph formatting">
        <ToolButton
          size="sm"
          icon={<AlignLeft size={14} />}
          label="Align left"
          active={editor.isActive({ textAlign: 'left' })}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
        />
        <ToolButton
          size="sm"
          icon={<AlignCenter size={14} />}
          label="Align centre"
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
        />
        <ToolButton
          size="sm"
          icon={<AlignRight size={14} />}
          label="Align right"
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
        />
        <ToolButton
          size="sm"
          icon={<AlignJustify size={14} />}
          label="Justify"
          active={editor.isActive({ textAlign: 'justify' })}
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        />
      </ToolbarGroup>

      <ToolbarDivider />

      <ToolbarGroup label="Lists and indentation">
        <ToolButton
          size="sm"
          icon={<List size={14} />}
          label="Bulleted list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolButton
          size="sm"
          icon={<ListOrdered size={14} />}
          label="Numbered list"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolButton
          size="sm"
          icon={<Indent size={14} />}
          label="Increase indent"
          disabled={!editor.can().sinkListItem('listItem')}
          onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
        />
        <ToolButton
          size="sm"
          icon={<Outdent size={14} />}
          label="Decrease indent"
          disabled={!editor.can().liftListItem('listItem')}
          onClick={() => editor.chain().focus().liftListItem('listItem').run()}
        />
      </ToolbarGroup>

      <ToolbarDivider />

      <ToolbarGroup label="Insert">
        <ToolButton size="sm" icon={<Link2 size={14} />} label="Insert or edit a link" shortcut="Ctrl+K" onClick={onEditLink} />
        <ToolButton
          size="sm"
          icon={<Link2Off size={14} />}
          label="Remove link"
          disabled={!editor.isActive('link')}
          onClick={() => editor.chain().focus().unsetLink().run()}
        />
        <ToolButton size="sm" icon={<Braces size={14} />} label="Insert a merge field" onClick={onInsertMergeField} />
        <Popover
          label="Special characters"
          width={244}
          trigger={({ toggle, ref }) => (
            <span ref={node => ref(node)} className="inline-flex">
              <ToolButton size="sm" icon={<Omega size={14} />} label="Special characters" onClick={toggle} />
            </span>
          )}
        >
          <SpecialCharacterGrid onPick={char => editor.chain().focus().insertContent(char).run()} />
        </Popover>
      </ToolbarGroup>

      <ToolbarDivider />

      <ToolbarGroup label="Tools">
        <ToolButton
          size="sm"
          icon={<Brush size={14} />}
          label={painter ? 'Cancel format painter' : 'Copy formatting, then select the target text'}
          active={!!painter}
          onClick={() => {
            if (painter) {
              setPainter(null);
              return;
            }
            const current = editor.getAttributes('textStyle') as { fontFamily?: string; color?: string };
            setPainter({
              fontFamily: current.fontFamily,
              color: current.color,
              bold: editor.isActive('bold'),
              italic: editor.isActive('italic'),
              underline: editor.isActive('underline'),
              strike: editor.isActive('strike'),
            });
          }}
        />
        <ToolButton
          size="sm"
          icon={<Eraser size={14} />}
          label="Clear formatting"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        />
        <ToolButton size="sm" icon={<Replace size={14} />} label="Find and replace" shortcut="Ctrl+H" onClick={onOpenFindReplace} />
      </ToolbarGroup>
    </div>
  );
}

function TypographyMenu({ editor, tokens }: { editor: Editor; tokens: ThemeTokens }) {
  const attrs = editor.getAttributes('textStyle') as {
    lineHeight?: string;
    letterSpacing?: string;
    textTransform?: string;
  };
  const setStyle = (patch: Record<string, string | null>) => editor.chain().focus().setMark('textStyle', patch).run();

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Line height</p>
        <select
          aria-label="Line height"
          value={attrs.lineHeight || ''}
          onChange={event => setStyle({ lineHeight: event.target.value || null })}
          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-[12px] focus:border-brand-400 focus:outline-none"
        >
          <option value="">Theme ({tokens.lineHeight})</option>
          {LINE_HEIGHTS.map(height => (
            <option key={height} value={String(height)}>
              {height}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Letter spacing</p>
        <select
          aria-label="Letter spacing"
          value={attrs.letterSpacing || ''}
          onChange={event => setStyle({ letterSpacing: event.target.value || null })}
          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-[12px] focus:border-brand-400 focus:outline-none"
        >
          <option value="">Normal</option>
          {[-0.5, 0.25, 0.5, 1, 1.5, 2].map(value => (
            <option key={value} value={`${value}px`}>
              {value}px
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Capitalization</p>
        <Segmented
          label="Capitalization"
          size="sm"
          fullWidth
          value={(attrs.textTransform as 'none' | 'uppercase' | 'capitalize') || 'none'}
          onChange={value => setStyle({ textTransform: value === 'none' ? null : value })}
          options={[
            { value: 'none', label: 'Normal' },
            { value: 'uppercase', label: 'UPPER' },
            { value: 'capitalize', label: 'Title' },
          ]}
        />
      </div>

      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Weight</p>
        <select
          aria-label="Font weight"
          onChange={event => setStyle({ fontWeight: event.target.value || null })}
          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-[12px] focus:border-brand-400 focus:outline-none"
        >
          <option value="">Theme default</option>
          {[300, 400, 500, 600, 700, 800].map(weight => (
            <option key={weight} value={String(weight)}>
              {weight}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={() =>
          editor
            .chain()
            .focus()
            .setMark('textStyle', {
              fontFamily: null,
              fontSize: null,
              lineHeight: null,
              letterSpacing: null,
              textTransform: null,
              fontWeight: null,
              color: null,
            })
            .run()
        }
        className="w-full rounded-lg bg-gray-100 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-200"
      >
        Reset to theme
      </button>
    </div>
  );
}

function SpecialCharacterGrid({ onPick }: { onPick: (char: string) => void }) {
  const { close } = usePopoverContext();
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Special characters</p>
      <div className="grid grid-cols-8 gap-1">
        {SPECIAL_CHARACTERS.map(entry => (
          <button
            key={entry.name}
            type="button"
            title={entry.name}
            aria-label={entry.name}
            onClick={() => {
              onPick(entry.char);
              close();
            }}
            className={clsx(
              'flex h-7 items-center justify-center rounded-md border border-gray-200 text-[13px] text-gray-700',
              'transition-colors hover:border-brand-300 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
            )}
          >
            {entry.char === '\u00a0' ? '␣' : entry.char}
          </button>
        ))}
      </div>
    </div>
  );
}
