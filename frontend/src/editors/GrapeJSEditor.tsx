import { useEffect, useRef } from 'react';
import grapesjs, { Editor } from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';

interface Props {
  htmlBody: string;
  onHtmlChange: (html: string) => void;
  onJsonChange: (json: string) => void;
}

export default function GrapeJSEditorWrapper({ htmlBody, onHtmlChange, onJsonChange }: Props) {
  const editorRef = useRef<Editor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || editorRef.current) return;

    const editor = grapesjs.init({
      container: containerRef.current,
      height: '600px',
      width: 'auto',
      plugins: [],
      storageManager: false,
      panels: { defaults: [] },
      blockManager: {
        blocks: [
          {
            id: 'section',
            label: 'Section',
            category: 'Layout',
            content: '<section style="padding: 20px;"><h2>Section Title</h2><p>Content here...</p></section>',
          },
          {
            id: 'columns-2',
            label: '2 Columns',
            category: 'Layout',
            content: '<div style="display: flex; gap: 20px;"><div style="flex: 1;">Column 1</div><div style="flex: 1;">Column 2</div></div>',
          },
          {
            id: 'text-block',
            label: 'Text',
            category: 'Basic',
            content: '<p style="margin: 0; padding: 10px;">Edit this text...</p>',
          },
          {
            id: 'heading',
            label: 'Heading',
            category: 'Basic',
            content: '<h1 style="margin: 0; padding: 10px;">Heading</h1>',
          },
          {
            id: 'image',
            label: 'Image',
            category: 'Basic',
            content: '<img src="https://via.placeholder.com/600x200" style="max-width: 100%;" />',
          },
          {
            id: 'button',
            label: 'Button',
            category: 'Basic',
            content: '<a href="#" style="display: inline-block; padding: 12px 24px; background: #4f46e5; color: white; text-decoration: none; border-radius: 6px;">Click Me</a>',
          },
          {
            id: 'divider',
            label: 'Divider',
            category: 'Basic',
            content: '<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />',
          },
          {
            id: 'spacer',
            label: 'Spacer',
            category: 'Basic',
            content: '<div style="height: 30px;"></div>',
          },
        ],
      },
    });

    // Load initial content
    if (htmlBody) {
      editor.setComponents(htmlBody);
    }

    editorRef.current = editor;

    // Export on changes
    editor.on('update', () => {
      const html = editor.getHtml();
      const css = editor.getCss();
      const fullHtml = `<style>${css}</style>${html}`;
      onHtmlChange(fullHtml);
      onJsonChange(JSON.stringify(editor.getProjectData()));
    });

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExport = () => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const html = editor.getHtml();
    const css = editor.getCss();
    onHtmlChange(`<style>${css}</style>${html}`);
    onJsonChange(JSON.stringify(editor.getProjectData()));
  };

  return (
    <div>
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-sm text-gray-500">Visual Email Builder</span>
        <button
          onClick={handleExport}
          className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700"
        >
          Save Design
        </button>
      </div>
      <div ref={containerRef} />
    </div>
  );
}
