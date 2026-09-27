import { useRef, useCallback } from 'react';
import EmailEditor, { EditorRef } from 'react-email-editor';

interface Props {
  onHtmlChange: (html: string) => void;
  onJsonChange: (json: string) => void;
  mergeFields: string[];
}

export default function UnlayerEditorWrapper({ onHtmlChange, onJsonChange, mergeFields }: Props) {
  const emailEditorRef = useRef<EditorRef | null>(null);

  const onReady = useCallback(() => {
    // Editor is ready
  }, []);

  const exportHtml = useCallback(() => {
    const unlayer = emailEditorRef.current?.editor;
    if (unlayer) {
      unlayer.exportHtml((data: { html: string }) => {
        onHtmlChange(data.html);
      });
      unlayer.saveDesign((design: object) => {
        onJsonChange(JSON.stringify(design));
      });
    }
  }, [onHtmlChange, onJsonChange]);

  const mergeTags = mergeFields.reduce((acc: Record<string, { name: string; value: string }>, field) => {
    acc[field] = { name: field, value: `{{${field}}}` };
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-sm text-gray-500">Drag & Drop Email Builder</span>
        <button
          onClick={exportHtml}
          className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700"
        >
          Save Design
        </button>
      </div>
      <EmailEditor
        ref={emailEditorRef}
        onReady={onReady}
        minHeight={600}
        options={{
          mergeTags,
          features: {
            textEditor: {
              spellChecker: true,
            },
          },
        }}
      />
    </div>
  );
}
