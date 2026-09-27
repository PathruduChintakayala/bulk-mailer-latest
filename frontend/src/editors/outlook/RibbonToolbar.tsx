import { useState, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import MessageTab from './MessageTab';
import InsertTab from './InsertTab';
import LayoutTab from './LayoutTab';
import ReviewTab, { getReviewBadge, type EditorIssue } from './ReviewTab';
import MoreMenu from './MoreMenu';
import type { MergeFieldDefinition, ThemeConfig } from '../../types';

type RibbonTab = 'message' | 'insert' | 'layout' | 'html' | 'review';

interface Props {
  editor: Editor | null;
  onFindReplace: () => void;
  onImageDialog: () => void;
  onLinkDialog: () => void;
  onTableDialog: () => void;
  onFocusMode?: () => void;
  onViewHtml?: () => void;
  onEditHtml?: () => void;
  isAdmin?: boolean;
  mergeFields?: MergeFieldDefinition[];
  onInsertMergeField?: (key: string) => void;
  themeConfig?: ThemeConfig | null;
  onThemeChange?: (theme: ThemeConfig | null) => void;
  validationIssues?: EditorIssue[];
  onFocusIssue?: (issue: EditorIssue) => void;
  /** When set, HTML tab switches editor mode instead of More menu only */
  editorMode?: 'visual' | 'html';
  onEditorModeChange?: (mode: 'visual' | 'html') => void;
}

const TAB_LABELS: { key: RibbonTab; label: string }[] = [
  { key: 'message', label: 'Message' },
  { key: 'insert', label: 'Insert' },
  { key: 'layout', label: 'Layout' },
  { key: 'html', label: 'HTML' },
  { key: 'review', label: 'Review' },
];

export default function RibbonToolbar({
  editor, onFindReplace, onImageDialog, onLinkDialog, onTableDialog,
  onFocusMode, onViewHtml, onEditHtml, isAdmin,
  mergeFields = [], onInsertMergeField,
  themeConfig, onThemeChange,
  validationIssues = [], onFocusIssue,
  editorMode = 'visual',
  onEditorModeChange,
}: Props) {
  const [activeTab, setActiveTab] = useState<RibbonTab>(editorMode === 'html' ? 'html' : 'message');
  const [collapsed, setCollapsed] = useState(false);
  const [expanded] = useState(() => {
    try { return localStorage.getItem('editor-ribbon-expanded') === 'true'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem('editor-ribbon-expanded', String(expanded)); } catch { /* */ }
  }, [expanded]);

  useEffect(() => {
    if (editorMode === 'html') setActiveTab('html');
  }, [editorMode]);

  const handleTabClick = (tab: RibbonTab) => {
    if (tab === 'html') {
      setActiveTab('html');
      setCollapsed(false);
      onEditorModeChange?.('html');
      return;
    }
    if (editorMode === 'html') {
      onEditorModeChange?.('visual');
    }
    if (tab === activeTab && editorMode !== 'html') {
      setCollapsed(!collapsed);
    } else {
      setActiveTab(tab);
      setCollapsed(false);
    }
  };

  const reviewBadge = getReviewBadge(validationIssues);
  const showVisualPanels = editorMode !== 'html' && !!editor;

  return (
    <div className="select-none bg-white flex-shrink-0">
      <div className="flex items-center bg-gray-50/80 border-b border-gray-200" role="tablist" aria-label="Editor ribbon tabs">
        <div className="flex items-center overflow-x-auto scrollbar-none">
          {TAB_LABELS.map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={
                t.key === 'html'
                  ? editorMode === 'html'
                  : activeTab === t.key && !collapsed && editorMode !== 'html'
              }
              onClick={() => handleTabClick(t.key)}
              onDoubleClick={() => t.key !== 'html' && setCollapsed(!collapsed)}
              className={`relative px-4 py-2 text-[11px] font-bold tracking-wider uppercase transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                (t.key === 'html' ? editorMode === 'html' : activeTab === t.key && !collapsed && editorMode !== 'html')
                  ? 'text-brand-600 bg-white border-t-2 border-t-brand-500 border-x border-x-gray-200 -mb-px z-10 rounded-t-lg'
                  : 'text-gray-400 hover:text-gray-600 border-t-2 border-transparent'
              }`}
            >
              {t.label}
              {t.key === 'review' && reviewBadge && (
                <span className={`inline-flex items-center justify-center text-[9px] font-bold min-w-[16px] h-4 px-1 rounded-full ${reviewBadge.color}`}>
                  {reviewBadge.label}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {editor && (
          <MoreMenu
            editor={editor}
            isAdmin={isAdmin}
            onFocusMode={onFocusMode}
            onFindReplace={onFindReplace}
            onViewHtml={onViewHtml}
            onEditHtml={onEditHtml}
          />
        )}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="px-2 py-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md mr-1 transition-colors cursor-pointer"
          title={collapsed ? 'Show ribbon' : 'Hide ribbon'}
          aria-label={collapsed ? 'Expand ribbon' : 'Collapse ribbon'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            {collapsed ? <polyline points="2,4 6,8 10,4" /> : <polyline points="2,8 6,4 10,8" />}
          </svg>
        </button>
      </div>

      {!collapsed && (
        <div className="bg-white border-b border-gray-200 min-h-[40px]" role="tabpanel">
          {editorMode === 'html' && (
            <div className="px-3 py-2 text-xs text-gray-500">
              Editing HTML source. Switch to Message, Insert, or Layout to return to the visual editor.
            </div>
          )}
          {showVisualPanels && activeTab === 'message' && (
            <MessageTab editor={editor!} onFindReplace={onFindReplace} onLinkDialog={onLinkDialog} expanded={expanded} />
          )}
          {showVisualPanels && activeTab === 'insert' && (
            <InsertTab
              editor={editor!}
              onImageDialog={onImageDialog}
              onLinkDialog={onLinkDialog}
              onTableDialog={onTableDialog}
              mergeFields={mergeFields}
              onInsertMergeField={onInsertMergeField}
            />
          )}
          {showVisualPanels && activeTab === 'layout' && (
            <LayoutTab
              editor={editor}
              themeConfig={themeConfig || null}
              onThemeChange={onThemeChange || (() => {})}
            />
          )}
          {showVisualPanels && activeTab === 'review' && (
            <ReviewTab issues={validationIssues} onFocusIssue={onFocusIssue} />
          )}
        </div>
      )}
    </div>
  );
}
