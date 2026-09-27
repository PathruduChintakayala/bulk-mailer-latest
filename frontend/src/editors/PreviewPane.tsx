import type { ThemeConfig } from '../types';
import { EMAIL_CONTENT_WIDTH } from '../constants/email';

function buildThemeCss(t: ThemeConfig): string {
  return `
    body {
      background-color: ${t.backgroundColor || '#ffffff'};
      color: ${t.textColor || '#1f2937'};
    }
    h1, h2, h3, h4, h5, h6 {
      color: ${t.headingColor || t.textColor || '#111827'};
    }
    a {
      color: ${t.linkColor || '#4f46e5'};
    }
    blockquote {
      border-left: 3px solid ${t.primaryColor || t.linkColor || '#4f46e5'};
      color: ${t.textColor || '#1f2937'};
      opacity: 0.85;
    }
  `;
}

interface Props {
  html: string;
  themeConfig?: ThemeConfig | null;
}

export default function PreviewPane({ html, themeConfig }: Props) {
  if (!html) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-50 rounded-lg text-gray-400 text-sm">
        Preview will appear here once you start composing
      </div>
    );
  }

  const themeCss = themeConfig ? `<style>${buildThemeCss(themeConfig)}</style>` : '';
  const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;font-family:Arial,sans-serif;line-height:1.6;max-width:${EMAIL_CONTENT_WIDTH}px;margin-left:auto;margin-right:auto;}</style>${themeCss}</head><body>${html}</body></html>`;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white h-full flex flex-col min-h-0">
      <iframe
        srcDoc={srcDoc}
        className="w-full flex-1 min-h-[400px]"
        sandbox="allow-same-origin"
        title="Email Preview"
      />
    </div>
  );
}
