import { lazy, Suspense, useRef, useCallback } from 'react';
import type { EditorType, ThemeConfig, MergeFieldDefinition, SenderIdentity } from '../types';
import ComposeWorkspace from '../editors/outlook/ComposeWorkspace';
import RibbonToolbar from '../editors/outlook/RibbonToolbar';
import PreviewPane from '../editors/PreviewPane';
import { EMAIL_CONTENT_WIDTH } from '../constants/email';

const HtmlEditor = lazy(() => import('../editors/HtmlEditor'));
const OutlookEditor = lazy(() => import('../editors/OutlookEditor'));

/**
 * Wrap a body-fragment into a full email HTML document.
 * If it already looks like a full document, return as-is.
 */
function wrapAsFullHtml(bodyFragment: string, themeConfig?: ThemeConfig | null): string {
  const trimmed = bodyFragment.trim();
  if (trimmed.toLowerCase().startsWith('<!doctype') || trimmed.toLowerCase().startsWith('<html')) {
    return trimmed;
  }

  const themeCss = themeConfig
    ? `
      body {
        background-color: ${themeConfig.backgroundColor || '#ffffff'};
        color: ${themeConfig.textColor || '#333333'};
      }
      h1, h2, h3, h4, h5, h6 {
        color: ${themeConfig.headingColor || '#111111'};
      }
      a {
        color: ${themeConfig.linkColor || '#2563eb'};
      }`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #333333;
      max-width: ${EMAIL_CONTENT_WIDTH}px;
      margin-left: auto;
      margin-right: auto;
    }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; }${themeCss}
  </style>
</head>
<body>
${bodyFragment}
</body>
</html>`;
}

/**
 * Extract body content from a full HTML document.
 * If it's just a fragment, return as-is.
 */
function extractBodyContent(fullHtml: string): string {
  const trimmed = fullHtml.trim();
  if (!trimmed.toLowerCase().includes('<body')) {
    return trimmed;
  }
  const bodyMatch = trimmed.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1].trim() : trimmed;
}

interface Props {
  editorType: EditorType;
  onEditorTypeChange: (type: EditorType) => void;
  htmlBody: string;
  onHtmlChange: (html: string) => void;
  contentJson: string;
  onContentJsonChange: (json: string) => void;
  mergeFields: { name: string; label: string }[];
  themeConfig?: ThemeConfig | null;
  // Compose workspace props (passed through to OutlookEditor)
  editorContext?: 'campaign' | 'template';
  subject?: string;
  onSubjectChange?: (value: string) => void;
  preheader?: string;
  onPreheaderChange?: (value: string) => void;
  senderIdentity?: SenderIdentity | null;
  onChangeSender?: () => void;
  totalRecipients?: number;
  suppressedCount?: number;
  onViewRecipients?: () => void;
  campaignMergeFields?: MergeFieldDefinition[];
  onInsertMergeField?: (key: string) => void;
  onThemeChange?: (theme: ThemeConfig | null) => void;
  sidePanel?: React.ReactNode;
  isAdmin?: boolean;
  onFocusMode?: () => void;
  onSave?: () => void;
  onReviewSend?: () => void;
}

export default function EditorSelector({
  editorType,
  onEditorTypeChange,
  htmlBody,
  onHtmlChange,
  contentJson: _contentJson,
  onContentJsonChange,
  mergeFields,
  themeConfig,
  editorContext,
  subject,
  onSubjectChange,
  preheader,
  onPreheaderChange,
  senderIdentity,
  onChangeSender,
  totalRecipients,
  suppressedCount,
  onViewRecipients,
  campaignMergeFields,
  onInsertMergeField,
  onThemeChange,
  sidePanel,
  isAdmin,
  onFocusMode,
  onSave,
  onReviewSend,
}: Props) {
  const fullHtmlRef = useRef<string>('');

  const handleEditorTypeChange = useCallback((newType: EditorType) => {
    if (newType === editorType) return;

    if (newType === 'html') {
      const full = wrapAsFullHtml(htmlBody, themeConfig);
      fullHtmlRef.current = full;
      onHtmlChange(full);
    } else {
      const bodyContent = extractBodyContent(htmlBody);
      fullHtmlRef.current = '';
      onHtmlChange(bodyContent);
    }
    onEditorTypeChange(newType);
  }, [editorType, htmlBody, themeConfig, onHtmlChange, onEditorTypeChange]);

  const handleModeChange = useCallback((mode: 'visual' | 'html') => {
    handleEditorTypeChange(mode === 'html' ? 'html' : 'custom');
  }, [handleEditorTypeChange]);

  // Workspace mode: HTML editing keeps ComposeWorkspace chrome + preview
  if (editorContext && editorType === 'html') {
    const preview = sidePanel || (
      <div className="flex flex-col h-full p-3 overflow-y-auto">
        <PreviewPane html={htmlBody} themeConfig={themeConfig} />
      </div>
    );

    return (
      <div className="h-full">
        <Suspense fallback={
          <div className="p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
            <p className="text-sm text-gray-400 mt-3">Loading editor...</p>
          </div>
        }>
          <ComposeWorkspace
            editorContext={editorContext}
            senderIdentity={senderIdentity}
            onChangeSender={onChangeSender}
            totalRecipients={totalRecipients}
            suppressedCount={suppressedCount}
            onViewRecipients={onViewRecipients}
            subject={subject || ''}
            onSubjectChange={onSubjectChange || (() => {})}
            preheader={preheader || ''}
            onPreheaderChange={onPreheaderChange || (() => {})}
            mergeFields={campaignMergeFields}
            onInsertMergeField={onInsertMergeField}
            ribbon={
              <RibbonToolbar
                editor={null}
                onFindReplace={() => {}}
                onImageDialog={() => {}}
                onLinkDialog={() => {}}
                onTableDialog={() => {}}
                isAdmin={isAdmin}
                mergeFields={campaignMergeFields}
                themeConfig={themeConfig}
                onThemeChange={onThemeChange}
                editorMode="html"
                onEditorModeChange={handleModeChange}
              />
            }
            canvas={
              <div className="flex-1 min-h-0 overflow-hidden">
                <HtmlEditor value={htmlBody} onChange={onHtmlChange} />
              </div>
            }
            sidePanel={preview}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className={editorContext ? 'h-full' : 'space-y-0'}>
      <div className={editorContext ? 'h-full' : 'border border-gray-200 rounded-lg overflow-hidden'}>
        <Suspense fallback={
          <div className="p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
            <p className="text-sm text-gray-400 mt-3">Loading editor...</p>
          </div>
        }>
          {editorType === 'html' ? (
            <HtmlEditor
              value={htmlBody}
              onChange={onHtmlChange}
            />
          ) : (
            <OutlookEditor
              initialHtml={htmlBody}
              onChange={onHtmlChange}
              onJsonChange={onContentJsonChange}
              mergeFields={mergeFields}
              themeConfig={themeConfig}
              editorContext={editorContext}
              subject={subject}
              onSubjectChange={onSubjectChange}
              preheader={preheader}
              onPreheaderChange={onPreheaderChange}
              senderIdentity={senderIdentity}
              onChangeSender={onChangeSender}
              totalRecipients={totalRecipients}
              suppressedCount={suppressedCount}
              onViewRecipients={onViewRecipients}
              campaignMergeFields={campaignMergeFields}
              onInsertMergeField={onInsertMergeField}
              onThemeChange={onThemeChange}
              sidePanel={sidePanel}
              isAdmin={isAdmin}
              onFocusMode={onFocusMode}
              onSave={onSave}
              onReviewSend={onReviewSend}
              onRequestHtmlMode={() => handleModeChange('html')}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}
