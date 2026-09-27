import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { useState, useCallback, useRef } from 'react';
import {
  AlignLeft, AlignCenter, AlignRight, Trash2, Type as TypeIcon,
} from 'lucide-react';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── Resizable Image Extension ───
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ResizableImageView({ node, updateAttributes, selected, deleteNode }: any) {
  const { src, alt, title, width, alignment } = node.attrs;
  const [_resizing, setResizing] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent, direction: 'left' | 'right') => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    const initialX = e.clientX;
    const initialWidth = imgRef.current?.offsetWidth || 0;
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const diff = direction === 'right' ? moveEvent.clientX - initialX : initialX - moveEvent.clientX;
      const parentWidth = containerRef.current?.parentElement?.offsetWidth || 600;
      const newWidth = Math.max(60, Math.min(parentWidth, initialWidth + diff));
      const percent = Math.round((newWidth / parentWidth) * 100);
      updateAttributes({ width: `${Math.min(100, Math.max(10, percent))}%` });
    };
    const handleMouseUp = () => {
      setResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [updateAttributes]);

  const alignCls = alignment === 'center' ? 'mx-auto' : alignment === 'right' ? 'ml-auto' : '';

  return (
    <NodeViewWrapper className="my-3 relative" data-drag-handle>
      <div ref={containerRef} className={`relative group inline-block ${alignCls}`} style={{ width: width || '100%', display: 'block' }}>
        <img ref={imgRef} src={src} alt={alt || ''} title={title || ''}
          className={`block w-full h-auto rounded-lg transition-shadow ${selected ? 'ring-2 ring-brand-500 ring-offset-2 shadow-lg' : 'hover:shadow-md'}`}
          draggable={false} />
        {selected && (
          <>
            <div onMouseDown={e => handleMouseDown(e, 'left')}
              className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-8 bg-white border-2 border-brand-500 rounded-full cursor-ew-resize shadow-md hover:bg-brand-50 z-10" />
            <div onMouseDown={e => handleMouseDown(e, 'right')}
              className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-3 h-8 bg-white border-2 border-brand-500 rounded-full cursor-ew-resize shadow-md hover:bg-brand-50 z-10" />
            <div onMouseDown={e => handleMouseDown(e, 'right')}
              className="absolute right-0 bottom-0 translate-x-1/3 translate-y-1/3 w-3.5 h-3.5 bg-brand-500 border-2 border-white rounded-sm cursor-nwse-resize shadow-md z-10" />
          </>
        )}
        {selected && (
          <div className="absolute -top-11 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-xl px-1.5 py-1 z-20 whitespace-nowrap">
            <ImgBtn onClick={() => updateAttributes({ alignment: 'left' })} active={alignment === 'left'} title="Align left"><AlignLeft size={13} /></ImgBtn>
            <ImgBtn onClick={() => updateAttributes({ alignment: 'center' })} active={alignment === 'center' || !alignment} title="Center"><AlignCenter size={13} /></ImgBtn>
            <ImgBtn onClick={() => updateAttributes({ alignment: 'right' })} active={alignment === 'right'} title="Align right"><AlignRight size={13} /></ImgBtn>
            <div className="w-px h-5 bg-gray-200 mx-0.5" />
            {[['S','25%'],['M','50%'],['L','75%'],['Full','100%']].map(([l,v]) => (
              <button key={v} onClick={() => updateAttributes({ width: v })}
                className={`px-1.5 py-0.5 text-[10px] font-semibold rounded transition-colors ${width === v ? 'bg-brand-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{l}</button>
            ))}
            <div className="w-px h-5 bg-gray-200 mx-0.5" />
            <ImgBtn onClick={() => { const a = window.prompt('Alt text:', alt || ''); if (a !== null) updateAttributes({ alt: a }); }} title="Alt text"><TypeIcon size={13} /></ImgBtn>
            <ImgBtn onClick={deleteNode} title="Remove" className="hover:!bg-red-50 hover:!text-red-500"><Trash2 size={13} /></ImgBtn>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

function ImgBtn({ onClick, active, title, className = '', children }: { onClick: () => void; active?: boolean; title: string; className?: string; children: React.ReactNode }) {
  return <button onClick={onClick} title={title} className={`p-1 rounded-md transition-colors ${active ? 'bg-brand-100 text-brand-700' : 'text-gray-500 hover:bg-gray-100'} ${className}`}>{children}</button>;
}

export const ResizableImage = Node.create({
  name: 'image',
  group: 'block',
  selectable: true,
  draggable: true,
  atom: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: { default: '100%' },
      alignment: { default: 'center' },
    };
  },
  parseHTML() { return [{ tag: 'img[src]' }]; },
  renderHTML({ HTMLAttributes }) {
    const { alignment, width, ...rest } = HTMLAttributes;
    const align = alignment === 'right' ? 'margin-left:auto;' : alignment === 'center' ? 'margin:0 auto;' : '';
    return ['img', mergeAttributes(rest, {
      style: `width:${width || '100%'};max-width:100%;height:auto;display:block;border-radius:8px;${align}`,
    })];
  },
  addNodeView() { return ReactNodeViewRenderer(ResizableImageView); },
  addCommands(): any {
    return {
      setImage: (options: { src: string; alt?: string; title?: string; width?: string }) => ({ commands }: any) => {
        return commands.insertContent({ type: 'image', attrs: options });
      },
    };
  },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── Merge Field (inline node) ───
export const MergeFieldExtension = Node.create({
  name: 'mergeField',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      name: {
        default: '',
        parseHTML: element =>
          element.getAttribute('data-merge-field') || element.getAttribute('name') || '',
        renderHTML: () => ({}),
      },
      label: { default: '', renderHTML: () => ({}) },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-merge-field]' }];
  },

  // This HTML is what gets emailed, so it carries no styling of its own: the
  // recipient must see their name as ordinary text. The chip look in the
  // editor comes from index.css.
  renderHTML({ node }) {
    const name = node.attrs.name || '';
    return ['span', { 'data-merge-field': name }, `{{${name}}}`];
  },
});

// ─── Divider (block node) ───
function DividerView({ node, updateAttributes, selected }: any) {
  const { color, thickness, lineStyle, width } = node.attrs;
  return (
    <NodeViewWrapper className={`my-3 group relative ${selected ? 'outline outline-2 outline-brand-400 outline-offset-2 rounded' : ''}`}>
      <hr
        style={{
          borderTop: `${thickness}px ${lineStyle} ${color}`,
          width: `${width}%`,
          margin: '0 auto',
        }}
      />
      {selected && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white border border-gray-200 rounded-lg shadow-lg px-2 py-1 z-10">
          <input type="color" value={color} onChange={e => updateAttributes({ color: e.target.value })} className="w-5 h-5 cursor-pointer border-0" title="Color" />
          <select value={thickness} onChange={e => updateAttributes({ thickness: Number(e.target.value) })} className="text-xs border rounded px-1 py-0.5">
            {[1, 2, 3, 4].map(t => <option key={t} value={t}>{t}px</option>)}
          </select>
          <select value={lineStyle} onChange={e => updateAttributes({ lineStyle: e.target.value })} className="text-xs border rounded px-1 py-0.5">
            {['solid', 'dashed', 'dotted'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={width} onChange={e => updateAttributes({ width: Number(e.target.value) })} className="text-xs border rounded px-1 py-0.5">
            {[50, 75, 100].map(w => <option key={w} value={w}>{w}%</option>)}
          </select>
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const DividerExtension = Node.create({
  name: 'emailDivider',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      color: { default: '#e5e7eb' },
      thickness: { default: 1 },
      lineStyle: { default: 'solid' },
      width: { default: 100 },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="email-divider"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'email-divider' }),
      ['hr', { style: `border-top:${HTMLAttributes.thickness}px ${HTMLAttributes.lineStyle} ${HTMLAttributes.color};width:${HTMLAttributes.width}%;margin:0 auto;` }],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DividerView);
  },
});

// ─── Spacer (block node) ───
function SpacerView({ node, updateAttributes, selected }: any) {
  const { height } = node.attrs;
  return (
    <NodeViewWrapper className={`relative group ${selected ? 'outline outline-2 outline-brand-400 outline-offset-2 rounded' : ''}`}>
      <div style={{ height: `${height}px` }} className="bg-gray-50/50 border border-dashed border-gray-200 rounded flex items-center justify-center">
        <span className="text-[10px] text-gray-300">{height}px spacer</span>
      </div>
      {selected && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white border border-gray-200 rounded-lg shadow-lg px-2 py-1 z-10">
          {[16, 24, 32, 48, 64].map(h => (
            <button key={h} onClick={() => updateAttributes({ height: h })}
              className={`text-xs px-2 py-0.5 rounded ${height === h ? 'bg-brand-500 text-white' : 'hover:bg-gray-100'}`}>
              {h}
            </button>
          ))}
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const SpacerExtension = Node.create({
  name: 'emailSpacer',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return { height: { default: 32 } };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="email-spacer"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-type': 'email-spacer',
      style: `height:${HTMLAttributes.height}px;`,
    })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SpacerView);
  },
});

// ─── Callout Box (block node with editable content) ───
function CalloutView({ node, updateAttributes, selected }: any) {
  const { bgColor, borderColor, textColor, icon } = node.attrs;
  return (
    <NodeViewWrapper className={`my-3 ${selected ? 'ring-2 ring-brand-400 ring-offset-2 rounded-xl' : ''}`}>
      <div
        style={{ backgroundColor: bgColor, borderLeft: `4px solid ${borderColor}`, color: textColor }}
        className="rounded-xl p-4 flex gap-3"
      >
        {selected && (
          <div className="absolute -top-9 left-0 flex items-center gap-1 bg-white border border-gray-200 rounded-lg shadow-lg px-2 py-1 z-10">
            {['💡', '⚠️', 'ℹ️', '✅', '❌', '📌'].map(e => (
              <button key={e} onClick={() => updateAttributes({ icon: e })}
                className={`text-sm px-1 rounded ${icon === e ? 'bg-gray-200' : 'hover:bg-gray-100'}`}>{e}</button>
            ))}
            <input type="color" value={bgColor} onChange={e => updateAttributes({ bgColor: e.target.value })} className="w-5 h-5 cursor-pointer border-0" title="Background" />
            <input type="color" value={borderColor} onChange={e => updateAttributes({ borderColor: e.target.value })} className="w-5 h-5 cursor-pointer border-0" title="Border" />
          </div>
        )}
        <span className="text-xl flex-shrink-0 select-none">{icon}</span>
        <div className="flex-1 min-w-0 prose-sm" data-node-view-content="" />
      </div>
    </NodeViewWrapper>
  );
}

export const CalloutExtension = Node.create({
  name: 'calloutBox',
  group: 'block',
  content: 'block+',
  selectable: true,
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      bgColor: { default: '#fef3c7' },
      borderColor: { default: '#f59e0b' },
      textColor: { default: '#92400e' },
      icon: { default: '💡' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout-box"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-type': 'callout-box',
      style: `background:${node.attrs.bgColor};border-left:4px solid ${node.attrs.borderColor};color:${node.attrs.textColor};border-radius:12px;padding:16px;display:flex;gap:12px;`,
    }), ['span', { style: 'font-size:20px;flex-shrink:0;user-select:none;' }, node.attrs.icon], ['div', { style: 'flex:1;min-width:0;' }, 0]];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});

// ─── CTA Button (block node) ───
function CTAButtonView({ node, updateAttributes, selected }: any) {
  const { text, url, bgColor, textColor, size, borderRadius, fullWidth } = node.attrs;
  const sizeStyles: Record<string, string> = {
    small: 'px-4 py-2 text-sm',
    medium: 'px-6 py-3 text-base',
    large: 'px-8 py-4 text-lg',
  };

  return (
    <NodeViewWrapper className={`my-3 text-center ${selected ? 'ring-2 ring-brand-400 ring-offset-2 rounded-xl' : ''}`}>
      <div className={fullWidth ? 'w-full' : 'inline-block'}>
        <a
          href={url}
          style={{ backgroundColor: bgColor, color: textColor, borderRadius: `${borderRadius}px` }}
          className={`inline-block font-semibold no-underline ${sizeStyles[size] || sizeStyles.medium} ${fullWidth ? 'w-full text-center' : ''}`}
          onClick={e => e.preventDefault()}
        >
          {text}
        </a>
      </div>
      {selected && (
        <div className="mt-2 flex flex-wrap items-center gap-2 justify-center bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-10">
          <input value={text} onChange={e => updateAttributes({ text: e.target.value })} placeholder="Button text"
            className="text-xs border rounded-lg px-2 py-1 w-28" />
          <input value={url} onChange={e => updateAttributes({ url: e.target.value })} placeholder="URL"
            className="text-xs border rounded-lg px-2 py-1 w-40" />
          <input type="color" value={bgColor} onChange={e => updateAttributes({ bgColor: e.target.value })} className="w-6 h-6 cursor-pointer border-0" title="BG Color" />
          <input type="color" value={textColor} onChange={e => updateAttributes({ textColor: e.target.value })} className="w-6 h-6 cursor-pointer border-0" title="Text Color" />
          <select value={size} onChange={e => updateAttributes({ size: e.target.value })} className="text-xs border rounded px-1 py-0.5">
            {['small', 'medium', 'large'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={borderRadius} onChange={e => updateAttributes({ borderRadius: Number(e.target.value) })} className="text-xs border rounded px-1 py-0.5">
            {[0, 4, 8, 20, 50].map(r => <option key={r} value={r}>{r}px</option>)}
          </select>
          <label className="text-xs flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={fullWidth} onChange={e => updateAttributes({ fullWidth: e.target.checked })} />
            Full width
          </label>
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const CTAButtonExtension = Node.create({
  name: 'ctaButton',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      text: { default: 'Click Here' },
      url: { default: '#' },
      bgColor: { default: '#6366f1' },
      textColor: { default: '#ffffff' },
      size: { default: 'medium' },
      borderRadius: { default: 8 },
      fullWidth: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="cta-button"]' }];
  },

  renderHTML({ node }) {
    const { text, url, bgColor, textColor, size, borderRadius, fullWidth } = node.attrs;
    const paddings: Record<string, string> = { small: '8px 16px', medium: '12px 24px', large: '16px 32px' };
    const fontSizes: Record<string, string> = { small: '14px', medium: '16px', large: '18px' };
    return ['div', { 'data-type': 'cta-button', style: `text-align:center;margin:12px 0;${fullWidth ? 'width:100%;' : ''}` },
      ['a', {
        href: url,
        style: `display:inline-block;background:${bgColor};color:${textColor};padding:${paddings[size] || paddings.medium};font-size:${fontSizes[size] || fontSizes.medium};font-weight:600;text-decoration:none;border-radius:${borderRadius}px;${fullWidth ? 'width:100%;text-align:center;box-sizing:border-box;' : ''}`,
      }, text],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CTAButtonView);
  },
});

// ─── Two Column Layout (block node with editable columns) ───
function ColumnsView({ node, updateAttributes, selected }: any) {
  const { leftWidth, gap, borderStyle } = node.attrs;
  return (
    <NodeViewWrapper className={`my-3 ${selected ? 'ring-2 ring-brand-400 ring-offset-2 rounded-xl' : ''}`}>
      {selected && (
        <div className="mb-2 flex items-center gap-2 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-1.5 z-10">
          <label className="text-xs text-gray-500">Left:</label>
          <input type="range" min={25} max={75} value={leftWidth} onChange={e => updateAttributes({ leftWidth: Number(e.target.value) })} className="w-20" />
          <span className="text-xs text-gray-400">{leftWidth}%</span>
          <label className="text-xs text-gray-500 ml-2">Gap:</label>
          <select value={gap} onChange={e => updateAttributes({ gap: Number(e.target.value) })} className="text-xs border rounded px-1 py-0.5">
            {[8, 12, 16, 24].map(g => <option key={g} value={g}>{g}px</option>)}
          </select>
          <label className="text-xs text-gray-500 ml-2">Border:</label>
          <select value={borderStyle} onChange={e => updateAttributes({ borderStyle: e.target.value })} className="text-xs border rounded px-1 py-0.5">
            {['none', 'solid', 'dashed'].map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      )}
      <div style={{ display: 'flex', gap: `${gap}px` }}>
        <div
          style={{ width: `${leftWidth}%`, borderRight: borderStyle !== 'none' ? `1px ${borderStyle} #e5e7eb` : 'none', paddingRight: borderStyle !== 'none' ? `${gap / 2}px` : '0' }}
          className="min-h-[60px] prose-sm"
          data-node-view-content="left"
        />
        <div
          style={{ width: `${100 - leftWidth}%` }}
          className="min-h-[60px] prose-sm"
          data-node-view-content="right"
        />
      </div>
    </NodeViewWrapper>
  );
}

export const ColumnsExtension = Node.create({
  name: 'columnsLayout',
  group: 'block',
  content: 'columnLeft columnRight',
  selectable: true,
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      leftWidth: { default: 50 },
      gap: { default: 16 },
      borderStyle: { default: 'none' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="columns-layout"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-type': 'columns-layout',
      style: `display:flex;gap:${node.attrs.gap}px;`,
    }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnsView);
  },
});

export const ColumnLeft = Node.create({
  name: 'columnLeft',
  group: '',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-column="left"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-column': 'left' }), 0];
  },
});

export const ColumnRight = Node.create({
  name: 'columnRight',
  group: '',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-column="right"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-column': 'right' }), 0];
  },
});
