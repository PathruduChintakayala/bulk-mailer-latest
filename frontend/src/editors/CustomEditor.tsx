import React, { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight,
  AlignJustify, List, ListOrdered, Quote, Code, Link, Minus, Table,
  Type, Heading1, Heading2, Heading3, Undo2, Redo2, Maximize2, Minimize2,
  RemoveFormatting, IndentIncrease, IndentDecrease, Subscript, Superscript,
  Copy, Palette, Highlighter, Upload, RectangleHorizontal, Columns, Space,
  Smile, MousePointerClick, BookOpen, X
} from 'lucide-react';
import type { ThemeConfig } from '../types';

interface CustomEditorProps {
  initialHtml?: string;
  onChange?: (html: string) => void;
  onJsonChange?: (json: string) => void;
  mergeFields?: { name: string; label: string }[];
  themeConfig?: ThemeConfig | null;
}

interface ToolbarButtonProps {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ icon, title, onClick, active, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${
      active ? 'bg-blue-100 text-blue-700' : 'text-gray-600'
    } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
  >
    {icon}
  </button>
);

const ToolbarDivider = () => <div className="w-px h-6 bg-gray-300 mx-1" />;

const FONT_FAMILIES = [
  'Arial', 'Georgia', 'Helvetica', 'Times New Roman', 'Courier New',
  'Verdana', 'Tahoma', 'Trebuchet MS', 'Impact', 'Comic Sans MS',
  'Lucida Sans', 'Palatino'
];

const FONT_SIZES = ['10px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '48px', '64px'];

const EMOJI_LIST = ['😀','😊','🎉','👋','🔥','✅','❤️','👍','🚀','⭐','💡','📧','🎯','💪','🙏','👀','📣','🏆','💰','🎁'];

const BUTTON_SIZES = {
  small: { padding: '8px 20px', fontSize: '13px' },
  medium: { padding: '12px 32px', fontSize: '16px' },
  large: { padding: '16px 44px', fontSize: '18px' },
};

const BORDER_RADIUS_OPTIONS = ['0px', '4px', '8px', '20px', '50px'];

// Block configurator types
type BlockType = 'button' | 'columns' | 'divider' | 'spacer' | 'callout' | null;

interface ButtonConfig {
  text: string;
  url: string;
  bgColor: string;
  textColor: string;
  size: 'small' | 'medium' | 'large';
  borderRadius: string;
  fullWidth: boolean;
}

interface DividerConfig {
  color: string;
  thickness: string;
  style: 'solid' | 'dashed' | 'dotted';
  width: string;
}

interface SpacerConfig {
  height: string;
}

interface CalloutConfig {
  bgColor: string;
  borderColor: string;
  textColor: string;
  icon: string;
}

interface ColumnsConfig {
  leftWidth: string;
  gap: string;
  borderStyle: 'none' | 'dashed' | 'solid';
}

const CustomEditor: React.FC<CustomEditorProps> = ({ initialHtml = '', onChange, onJsonChange, mergeFields = [], themeConfig }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showMergeDropdown, setShowMergeDropdown] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [textColor, setTextColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffff00');
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  // Block configurator state
  const [activeBlock, setActiveBlock] = useState<BlockType>(null);
  const [buttonCfg, setButtonCfg] = useState<ButtonConfig>({
    text: 'Click Here', url: 'https://', bgColor: '#4f46e5', textColor: '#ffffff',
    size: 'medium', borderRadius: '6px', fullWidth: false,
  });
  const [dividerCfg, setDividerCfg] = useState<DividerConfig>({
    color: '#e5e7eb', thickness: '2px', style: 'solid', width: '100%',
  });
  const [spacerCfg, setSpacerCfg] = useState<SpacerConfig>({ height: '32px' });
  const [calloutCfg, setCalloutCfg] = useState<CalloutConfig>({
    bgColor: '#f0f9ff', borderColor: '#3b82f6', textColor: '#1e40af', icon: '💡',
  });
  const [columnsCfg, setColumnsCfg] = useState<ColumnsConfig>({
    leftWidth: '50%', gap: '12px', borderStyle: 'dashed',
  });

  // Apply theme colors to block defaults when theme changes
  useEffect(() => {
    if (themeConfig) {
      setButtonCfg(prev => ({
        ...prev,
        bgColor: themeConfig.buttonColor || themeConfig.primaryColor || prev.bgColor,
        textColor: themeConfig.buttonTextColor || '#ffffff',
      }));
      setCalloutCfg(prev => ({
        ...prev,
        borderColor: themeConfig.primaryColor || prev.borderColor,
        bgColor: themeConfig.accentColor || '#f0f9ff',
        textColor: themeConfig.headingColor || '#1e40af',
      }));
      setDividerCfg(prev => ({ ...prev, color: themeConfig.accentColor || '#e5e7eb' }));
    }
  }, [themeConfig]);

  useEffect(() => {
    if (editorRef.current && initialHtml) {
      editorRef.current.innerHTML = initialHtml;
      updateCounts();
    }
  }, []);

  const execCmd = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    emitChange();
  }, []);

  const emitChange = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    onChange?.(html);
    onJsonChange?.(JSON.stringify({ html, type: 'custom' }));
    updateCounts();
  }, [onChange, onJsonChange]);

  const updateCounts = useCallback(() => {
    if (!editorRef.current) return;
    const text = editorRef.current.innerText || '';
    setCharCount(text.length);
    setWordCount(text.trim().split(/\s+/).filter(Boolean).length);
  }, []);

  const readTime = useMemo(() => Math.max(1, Math.ceil(wordCount / 200)), [wordCount]);

  const handleInput = useCallback(() => { emitChange(); }, [emitChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b': e.preventDefault(); execCmd('bold'); break;
        case 'i': e.preventDefault(); execCmd('italic'); break;
        case 'u': e.preventDefault(); execCmd('underline'); break;
        case 'z': e.preventDefault(); execCmd(e.shiftKey ? 'redo' : 'undo'); break;
      }
    }
    if (e.key === 'Tab') { e.preventDefault(); execCmd(e.shiftKey ? 'outdent' : 'indent'); }
  }, [execCmd]);

  // Image upload
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5MB'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      execCmd('insertHTML', `<img src="${dataUrl}" alt="${file.name}" style="max-width:100%;height:auto;border-radius:4px;margin:8px 0;" />`);
    };
    reader.readAsDataURL(file);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, [execCmd]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5MB'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      execCmd('insertHTML', `<img src="${dataUrl}" alt="${file.name}" style="max-width:100%;height:auto;border-radius:4px;margin:8px 0;" />`);
    };
    reader.readAsDataURL(file);
  }, [execCmd]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);

  const insertLink = useCallback(() => {
    const url = prompt('Enter link URL:');
    if (url) { execCmd('createLink', url); }
  }, [execCmd]);

  const insertTable = useCallback(() => {
    const input = prompt('Enter rows x columns (e.g. 3x4):');
    if (!input) return;
    const parts = input.split('x').map(Number);
    if (parts.length !== 2 || parts.some(isNaN)) return;
    const [rows, cols] = parts;
    let html = '<table style="border-collapse:collapse;width:100%;margin:8px 0;"><tbody>';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        html += '<td style="border:1px solid #ddd;padding:8px;min-width:50px;">&nbsp;</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table><p></p>';
    execCmd('insertHTML', html);
  }, [execCmd]);

  // Block insertion (uses config state)
  const insertButton = useCallback(() => {
    const sizeStyle = BUTTON_SIZES[buttonCfg.size];
    const widthStyle = buttonCfg.fullWidth ? 'display:block;width:100%;text-align:center;' : 'display:inline-block;';
    execCmd('insertHTML', `<div style="text-align:center;margin:16px 0;"><a href="${buttonCfg.url}" style="${widthStyle}padding:${sizeStyle.padding};background:${buttonCfg.bgColor};color:${buttonCfg.textColor};text-decoration:none;border-radius:${buttonCfg.borderRadius};font-weight:600;font-size:${sizeStyle.fontSize};">${buttonCfg.text}</a></div><p></p>`);
    setActiveBlock(null);
  }, [buttonCfg, execCmd]);

  const insertDivider = useCallback(() => {
    execCmd('insertHTML', `<hr style="border:none;border-top:${dividerCfg.thickness} ${dividerCfg.style} ${dividerCfg.color};margin:24px auto;width:${dividerCfg.width};" /><p></p>`);
    setActiveBlock(null);
  }, [dividerCfg, execCmd]);

  const insertSpacer = useCallback(() => {
    execCmd('insertHTML', `<div style="height:${spacerCfg.height};"></div><p></p>`);
    setActiveBlock(null);
  }, [spacerCfg, execCmd]);

  const insertCallout = useCallback(() => {
    execCmd('insertHTML', `<div style="background:${calloutCfg.bgColor};border-left:4px solid ${calloutCfg.borderColor};padding:16px;margin:16px 0;border-radius:4px;"><p style="margin:0;color:${calloutCfg.textColor};">${calloutCfg.icon} Callout text here</p></div><p></p>`);
    setActiveBlock(null);
  }, [calloutCfg, execCmd]);

  const insertColumns = useCallback(() => {
    const rightWidth = `${100 - parseInt(columnsCfg.leftWidth)}%`;
    const border = columnsCfg.borderStyle === 'none' ? 'border:none;' : `border:1px ${columnsCfg.borderStyle} #e5e7eb;`;
    execCmd('insertHTML', `<table style="width:100%;border-collapse:collapse;margin:16px 0;"><tbody><tr><td style="width:${columnsCfg.leftWidth};padding:${columnsCfg.gap};vertical-align:top;${border}"><p>Left column</p></td><td style="width:${rightWidth};padding:${columnsCfg.gap};vertical-align:top;${border}"><p>Right column</p></td></tr></tbody></table><p></p>`);
    setActiveBlock(null);
  }, [columnsCfg, execCmd]);

  const insertMergeField = useCallback((field: { name: string; label: string }) => {
    const span = `<span contenteditable="false" data-merge-field="${field.name}" style="display:inline-block;padding:2px 8px;margin:0 2px;background:#ede9fe;color:#6d28d9;border-radius:4px;font-size:13px;font-weight:500;cursor:default;user-select:all;">{{${field.name}}}</span>&nbsp;`;
    execCmd('insertHTML', span);
    setShowMergeDropdown(false);
  }, [execCmd]);

  const insertEmoji = useCallback((emoji: string) => {
    execCmd('insertHTML', emoji);
    setShowEmojiPicker(false);
  }, [execCmd]);

  const copyHtml = useCallback(() => {
    if (editorRef.current) navigator.clipboard.writeText(editorRef.current.innerHTML);
  }, []);

  const toggleFullscreen = useCallback(() => { setIsFullscreen(prev => !prev); }, []);

  const openBlockConfig = useCallback((type: BlockType) => {
    setActiveBlock(type);
    setShowBlockMenu(false);
  }, []);

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-50 bg-white flex flex-col'
    : 'border border-gray-300 rounded-lg overflow-hidden flex flex-col';

  return (
    <div className={containerClass}>
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

      {/* Toolbar Row 1: Text formatting */}
      <div className="border-b border-gray-200 bg-gray-50 px-2 py-1.5 flex flex-wrap items-center gap-0.5">
        <select title="Font Family" className="h-7 text-xs border border-gray-300 rounded px-1 bg-white"
          onChange={(e) => execCmd('fontName', e.target.value)} defaultValue="">
          <option value="" disabled>Font</option>
          {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select title="Font Size" className="h-7 text-xs border border-gray-300 rounded px-1 bg-white w-16"
          onChange={(e) => execCmd('insertHTML', `<span style="font-size:${e.target.value}">${window.getSelection()?.toString() || ''}</span>`)} defaultValue="">
          <option value="" disabled>Size</option>
          {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <ToolbarDivider />
        <ToolbarButton icon={<Bold size={16} />} title="Bold (Ctrl+B)" onClick={() => execCmd('bold')} />
        <ToolbarButton icon={<Italic size={16} />} title="Italic (Ctrl+I)" onClick={() => execCmd('italic')} />
        <ToolbarButton icon={<Underline size={16} />} title="Underline (Ctrl+U)" onClick={() => execCmd('underline')} />
        <ToolbarButton icon={<Strikethrough size={16} />} title="Strikethrough" onClick={() => execCmd('strikeThrough')} />
        <ToolbarButton icon={<Subscript size={16} />} title="Subscript" onClick={() => execCmd('subscript')} />
        <ToolbarButton icon={<Superscript size={16} />} title="Superscript" onClick={() => execCmd('superscript')} />
        <ToolbarDivider />
        <ToolbarButton icon={<Heading1 size={16} />} title="Heading 1" onClick={() => execCmd('formatBlock', 'h1')} />
        <ToolbarButton icon={<Heading2 size={16} />} title="Heading 2" onClick={() => execCmd('formatBlock', 'h2')} />
        <ToolbarButton icon={<Heading3 size={16} />} title="Heading 3" onClick={() => execCmd('formatBlock', 'h3')} />
        <ToolbarButton icon={<Type size={16} />} title="Paragraph" onClick={() => execCmd('formatBlock', 'p')} />
        <ToolbarButton icon={<Quote size={16} />} title="Blockquote" onClick={() => execCmd('formatBlock', 'blockquote')} />
        <ToolbarButton icon={<Code size={16} />} title="Code Block" onClick={() => execCmd('formatBlock', 'pre')} />
        <ToolbarDivider />
        <ToolbarButton icon={<AlignLeft size={16} />} title="Align Left" onClick={() => execCmd('justifyLeft')} />
        <ToolbarButton icon={<AlignCenter size={16} />} title="Align Center" onClick={() => execCmd('justifyCenter')} />
        <ToolbarButton icon={<AlignRight size={16} />} title="Align Right" onClick={() => execCmd('justifyRight')} />
        <ToolbarButton icon={<AlignJustify size={16} />} title="Justify" onClick={() => execCmd('justifyFull')} />
        <ToolbarDivider />
        <ToolbarButton icon={<List size={16} />} title="Bullet List" onClick={() => execCmd('insertUnorderedList')} />
        <ToolbarButton icon={<ListOrdered size={16} />} title="Numbered List" onClick={() => execCmd('insertOrderedList')} />
        <ToolbarButton icon={<IndentIncrease size={16} />} title="Increase Indent" onClick={() => execCmd('indent')} />
        <ToolbarButton icon={<IndentDecrease size={16} />} title="Decrease Indent" onClick={() => execCmd('outdent')} />
        <ToolbarDivider />
        <div className="relative flex items-center">
          <label title="Text Color" className="cursor-pointer p-1.5 rounded hover:bg-gray-200">
            <Palette size={16} className="text-gray-600" />
            <input type="color" value={textColor} onChange={(e) => { setTextColor(e.target.value); execCmd('foreColor', e.target.value); }} className="absolute w-0 h-0 opacity-0" />
          </label>
        </div>
        <div className="relative flex items-center">
          <label title="Highlight Color" className="cursor-pointer p-1.5 rounded hover:bg-gray-200">
            <Highlighter size={16} className="text-gray-600" />
            <input type="color" value={bgColor} onChange={(e) => { setBgColor(e.target.value); execCmd('hiliteColor', e.target.value); }} className="absolute w-0 h-0 opacity-0" />
          </label>
        </div>
      </div>

      {/* Toolbar Row 2: Insert, Blocks, Merge Fields */}
      <div className="border-b border-gray-200 bg-gray-50 px-2 py-1.5 flex flex-wrap items-center gap-0.5">
        <button type="button" title="Upload Image" onClick={() => imageInputRef.current?.click()}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 rounded hover:bg-gray-200 transition-colors">
          <Upload size={14} /> Image
        </button>
        <ToolbarButton icon={<Link size={16} />} title="Insert Link" onClick={insertLink} />
        <ToolbarButton icon={<Table size={16} />} title="Insert Table" onClick={insertTable} />
        <ToolbarDivider />

        {/* Email Blocks Dropdown */}
        <div className="relative">
          <button type="button"
            onClick={() => { setShowBlockMenu(!showBlockMenu); setShowEmojiPicker(false); setShowMergeDropdown(false); }}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium border border-brand-200 bg-brand-50 text-brand-700 rounded hover:bg-brand-100 transition-colors">
            <RectangleHorizontal size={14} /> Blocks
          </button>
          {showBlockMenu && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 min-w-[180px]">
              <button onClick={() => openBlockConfig('button')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
                <MousePointerClick size={14} className="text-brand-500" /> CTA Button
              </button>
              <button onClick={() => openBlockConfig('columns')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
                <Columns size={14} className="text-brand-500" /> 2-Column Layout
              </button>
              <button onClick={() => openBlockConfig('divider')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
                <Minus size={14} className="text-brand-500" /> Divider
              </button>
              <button onClick={() => openBlockConfig('spacer')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
                <Space size={14} className="text-brand-500" /> Spacer
              </button>
              <button onClick={() => openBlockConfig('callout')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
                <BookOpen size={14} className="text-brand-500" /> Callout Box
              </button>
            </div>
          )}
        </div>

        {/* Emoji Picker */}
        <div className="relative">
          <ToolbarButton icon={<Smile size={16} />} title="Insert Emoji" onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowBlockMenu(false); setShowMergeDropdown(false); }} />
          {showEmojiPicker && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-2 grid grid-cols-10 gap-1 w-[240px]">
              {EMOJI_LIST.map(em => (
                <button key={em} onClick={() => insertEmoji(em)} className="w-6 h-6 text-base hover:bg-gray-100 rounded flex items-center justify-center">{em}</button>
              ))}
            </div>
          )}
        </div>
        <ToolbarDivider />

        {/* Merge Fields */}
        {mergeFields.length > 0 && (
          <div className="relative">
            <button type="button"
              onClick={() => { setShowMergeDropdown(!showMergeDropdown); setShowBlockMenu(false); setShowEmojiPicker(false); }}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium border border-purple-300 bg-purple-50 text-purple-700 rounded hover:bg-purple-100 transition-colors">
              {'{{ }}'} Merge Fields
            </button>
            {showMergeDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px] py-1 max-h-48 overflow-y-auto">
                {mergeFields.map(f => (
                  <button key={f.name} type="button" onClick={() => insertMergeField(f)}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-purple-50 text-gray-700 flex items-center gap-2">
                    <span className="text-purple-600 font-mono text-xs">{`{{${f.name}}}`}</span>
                    <span className="text-gray-400 text-xs">{f.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex-1" />
        <ToolbarButton icon={<RemoveFormatting size={16} />} title="Clear Formatting" onClick={() => execCmd('removeFormat')} />
        <ToolbarButton icon={<Undo2 size={16} />} title="Undo (Ctrl+Z)" onClick={() => execCmd('undo')} />
        <ToolbarButton icon={<Redo2 size={16} />} title="Redo (Ctrl+Shift+Z)" onClick={() => execCmd('redo')} />
        <ToolbarButton icon={<Copy size={16} />} title="Copy HTML" onClick={copyHtml} />
        <ToolbarButton icon={isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />} title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'} onClick={toggleFullscreen} />
      </div>

      {/* Block Customization Panel */}
      {activeBlock && (
        <div className="border-b border-gray-200 bg-white px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-800">
              Configure {activeBlock === 'button' ? 'CTA Button' : activeBlock === 'columns' ? '2-Column Layout' : activeBlock === 'divider' ? 'Divider' : activeBlock === 'spacer' ? 'Spacer' : 'Callout'}
            </h4>
            <button onClick={() => setActiveBlock(null)} className="p-1 hover:bg-gray-100 rounded"><X size={16} className="text-gray-400" /></button>
          </div>

          {activeBlock === 'button' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Button Text</label>
                <input value={buttonCfg.text} onChange={e => setButtonCfg(p => ({...p, text: e.target.value}))}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Link URL</label>
                <input value={buttonCfg.url} onChange={e => setButtonCfg(p => ({...p, url: e.target.value}))}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Background</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={buttonCfg.bgColor} onChange={e => setButtonCfg(p => ({...p, bgColor: e.target.value}))} className="w-8 h-8 rounded cursor-pointer border" />
                  <span className="text-xs text-gray-400 font-mono">{buttonCfg.bgColor}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Text Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={buttonCfg.textColor} onChange={e => setButtonCfg(p => ({...p, textColor: e.target.value}))} className="w-8 h-8 rounded cursor-pointer border" />
                  <span className="text-xs text-gray-400 font-mono">{buttonCfg.textColor}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Size</label>
                <select value={buttonCfg.size} onChange={e => setButtonCfg(p => ({...p, size: e.target.value as 'small'|'medium'|'large'}))}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Border Radius</label>
                <select value={buttonCfg.borderRadius} onChange={e => setButtonCfg(p => ({...p, borderRadius: e.target.value}))}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                  {BORDER_RADIUS_OPTIONS.map(r => <option key={r} value={r}>{r === '0px' ? 'Square' : r === '50px' ? 'Pill' : r}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={buttonCfg.fullWidth} onChange={e => setButtonCfg(p => ({...p, fullWidth: e.target.checked}))} className="rounded" />
                  <span className="text-xs text-gray-600">Full Width</span>
                </label>
              </div>
              <div className="flex items-end">
                <button onClick={insertButton} className="px-4 py-1.5 bg-brand-600 text-white text-sm rounded hover:bg-brand-700 transition-colors">
                  Insert Button
                </button>
              </div>
              {/* Live preview */}
              <div className="col-span-2 md:col-span-4 mt-2 p-3 bg-gray-50 rounded border border-gray-200 text-center">
                <span style={{
                  display: buttonCfg.fullWidth ? 'block' : 'inline-block',
                  padding: BUTTON_SIZES[buttonCfg.size].padding,
                  background: buttonCfg.bgColor,
                  color: buttonCfg.textColor,
                  borderRadius: buttonCfg.borderRadius,
                  fontWeight: 600,
                  fontSize: BUTTON_SIZES[buttonCfg.size].fontSize,
                  textDecoration: 'none',
                }}>{buttonCfg.text}</span>
              </div>
            </div>
          )}

          {activeBlock === 'divider' && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={dividerCfg.color} onChange={e => setDividerCfg(p => ({...p, color: e.target.value}))} className="w-8 h-8 rounded cursor-pointer border" />
                  <span className="text-xs text-gray-400 font-mono">{dividerCfg.color}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Thickness</label>
                <select value={dividerCfg.thickness} onChange={e => setDividerCfg(p => ({...p, thickness: e.target.value}))}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                  <option value="1px">1px</option><option value="2px">2px</option><option value="3px">3px</option><option value="4px">4px</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Style</label>
                <select value={dividerCfg.style} onChange={e => setDividerCfg(p => ({...p, style: e.target.value as 'solid'|'dashed'|'dotted'}))}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                  <option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Width</label>
                <select value={dividerCfg.width} onChange={e => setDividerCfg(p => ({...p, width: e.target.value}))}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                  <option value="100%">100%</option><option value="80%">80%</option><option value="60%">60%</option><option value="50%">50%</option>
                </select>
              </div>
              <button onClick={insertDivider} className="px-4 py-1.5 bg-brand-600 text-white text-sm rounded hover:bg-brand-700 transition-colors">Insert</button>
              {/* Preview */}
              <div className="col-span-2 md:col-span-5 mt-2 p-3 bg-gray-50 rounded border border-gray-200">
                <hr style={{ border: 'none', borderTop: `${dividerCfg.thickness} ${dividerCfg.style} ${dividerCfg.color}`, width: dividerCfg.width, margin: '0 auto' }} />
              </div>
            </div>
          )}

          {activeBlock === 'spacer' && (
            <div className="flex items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Height</label>
                <select value={spacerCfg.height} onChange={e => setSpacerCfg({ height: e.target.value })}
                  className="px-2 py-1.5 border border-gray-300 rounded text-sm">
                  <option value="16px">16px (Small)</option>
                  <option value="32px">32px (Medium)</option>
                  <option value="48px">48px (Large)</option>
                  <option value="64px">64px (XL)</option>
                  <option value="96px">96px (XXL)</option>
                </select>
              </div>
              <button onClick={insertSpacer} className="px-4 py-1.5 bg-brand-600 text-white text-sm rounded hover:bg-brand-700 transition-colors">Insert</button>
              <div className="flex-1 bg-gray-50 rounded border border-gray-200 flex items-center justify-center" style={{ height: spacerCfg.height }}>
                <span className="text-xs text-gray-400">{spacerCfg.height} spacer</span>
              </div>
            </div>
          )}

          {activeBlock === 'callout' && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Background</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={calloutCfg.bgColor} onChange={e => setCalloutCfg(p => ({...p, bgColor: e.target.value}))} className="w-8 h-8 rounded cursor-pointer border" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Border Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={calloutCfg.borderColor} onChange={e => setCalloutCfg(p => ({...p, borderColor: e.target.value}))} className="w-8 h-8 rounded cursor-pointer border" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Text Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={calloutCfg.textColor} onChange={e => setCalloutCfg(p => ({...p, textColor: e.target.value}))} className="w-8 h-8 rounded cursor-pointer border" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Icon</label>
                <select value={calloutCfg.icon} onChange={e => setCalloutCfg(p => ({...p, icon: e.target.value}))}
                  className="px-2 py-1.5 border border-gray-300 rounded text-sm">
                  <option value="💡">💡 Tip</option><option value="⚠️">⚠️ Warning</option><option value="ℹ️">ℹ️ Info</option>
                  <option value="✅">✅ Success</option><option value="❌">❌ Error</option><option value="📌">📌 Note</option>
                </select>
              </div>
              <button onClick={insertCallout} className="px-4 py-1.5 bg-brand-600 text-white text-sm rounded hover:bg-brand-700 transition-colors">Insert</button>
              {/* Preview */}
              <div className="col-span-2 md:col-span-5 mt-2">
                <div style={{ background: calloutCfg.bgColor, borderLeft: `4px solid ${calloutCfg.borderColor}`, padding: '12px 16px', borderRadius: '4px' }}>
                  <p style={{ margin: 0, color: calloutCfg.textColor, fontSize: '14px' }}>{calloutCfg.icon} Callout text here</p>
                </div>
              </div>
            </div>
          )}

          {activeBlock === 'columns' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Left Column Width</label>
                <select value={columnsCfg.leftWidth} onChange={e => setColumnsCfg(p => ({...p, leftWidth: e.target.value}))}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                  <option value="30%">30% / 70%</option><option value="40%">40% / 60%</option>
                  <option value="50%">50% / 50%</option><option value="60%">60% / 40%</option><option value="70%">70% / 30%</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Padding/Gap</label>
                <select value={columnsCfg.gap} onChange={e => setColumnsCfg(p => ({...p, gap: e.target.value}))}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                  <option value="8px">8px (Tight)</option><option value="12px">12px (Normal)</option>
                  <option value="16px">16px (Wide)</option><option value="24px">24px (Spacious)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Border</label>
                <select value={columnsCfg.borderStyle} onChange={e => setColumnsCfg(p => ({...p, borderStyle: e.target.value as 'none'|'dashed'|'solid'}))}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                  <option value="none">None</option><option value="dashed">Dashed</option><option value="solid">Solid</option>
                </select>
              </div>
              <button onClick={insertColumns} className="px-4 py-1.5 bg-brand-600 text-white text-sm rounded hover:bg-brand-700 transition-colors">Insert</button>
              {/* Preview */}
              <div className="col-span-2 md:col-span-4 mt-2 p-2 bg-gray-50 rounded border border-gray-200">
                <div className="flex">
                  <div style={{ width: columnsCfg.leftWidth, padding: columnsCfg.gap, border: columnsCfg.borderStyle === 'none' ? 'none' : `1px ${columnsCfg.borderStyle} #e5e7eb` }}
                    className="bg-white rounded text-xs text-gray-400 text-center">Left ({columnsCfg.leftWidth})</div>
                  <div style={{ width: `${100 - parseInt(columnsCfg.leftWidth)}%`, padding: columnsCfg.gap, border: columnsCfg.borderStyle === 'none' ? 'none' : `1px ${columnsCfg.borderStyle} #e5e7eb` }}
                    className="bg-white rounded text-xs text-gray-400 text-center">Right ({100 - parseInt(columnsCfg.leftWidth)}%)</div>
                </div>
              </div>
            </div>
          )}

          {/* Theme indicator */}
          {themeConfig && (
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
              <div className="flex gap-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: themeConfig.primaryColor }} />
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: themeConfig.buttonColor }} />
              </div>
              <span>Using theme colors for defaults</span>
            </div>
          )}
        </div>
      )}

      {/* Editor Area */}
      <div
        ref={editorRef}
        contentEditable
        className="flex-1 p-5 outline-none overflow-y-auto min-h-[400px] prose max-w-none text-gray-800"
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        style={{ lineHeight: '1.7' }}
        suppressContentEditableWarning
      />

      {/* Status Bar */}
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-1.5 flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center gap-4">
          <span>{wordCount} words</span>
          <span>{charCount} chars</span>
          <span>~{readTime} min read</span>
        </div>
        <span className="text-gray-300">Drop images directly into editor</span>
      </div>
    </div>
  );
};

export default CustomEditor;
