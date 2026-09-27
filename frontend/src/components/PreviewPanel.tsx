import { useState } from 'react';
import { PanelRightClose, PanelBottomClose, Eye, EyeOff, Monitor, Smartphone } from 'lucide-react';
import type { ThemeConfig } from '../types';

export type PreviewLayout = 'side' | 'bottom' | 'hidden';

function buildThemeCss(t: ThemeConfig): string {
  return `
    body {
      background-color: ${t.backgroundColor};
      color: ${t.textColor};
    }
    h1, h2, h3, h4, h5, h6 {
      color: ${t.headingColor};
    }
    a {
      color: ${t.linkColor};
    }
    blockquote {
      border-left: 3px solid ${t.primaryColor};
      color: ${t.textColor};
      opacity: 0.85;
    }
  `;
}

interface PreviewPanelProps {
  html: string;
  layout: PreviewLayout;
  themeConfig?: ThemeConfig | null;
}

export default function PreviewPanel({ html, layout, themeConfig }: PreviewPanelProps) {
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'mobile'>('desktop');

  if (layout === 'hidden') return null;

  return (
    <div className={`flex flex-col border border-gray-200 rounded-lg overflow-hidden bg-white ${
      layout === 'side' ? 'w-[420px] flex-shrink-0' : 'w-full'
    }`}>
      {/* Preview Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-medium text-gray-600">Live Preview</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDeviceMode('desktop')}
            title="Desktop preview"
            className={`p-1 rounded transition-colors ${deviceMode === 'desktop' ? 'bg-brand-100 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Monitor size={14} />
          </button>
          <button
            onClick={() => setDeviceMode('mobile')}
            title="Mobile preview (375px)"
            className={`p-1 rounded transition-colors ${deviceMode === 'mobile' ? 'bg-brand-100 text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Smartphone size={14} />
          </button>
        </div>
      </div>

      {/* Preview Content */}
      <div className="flex-1 overflow-auto p-3 bg-gray-100 flex justify-center items-start">
        {html ? (
          <div className={`bg-white shadow-sm rounded border border-gray-200 overflow-hidden transition-all ${
            deviceMode === 'mobile' ? 'w-[375px]' : 'w-full'
          }`}>
            <iframe
              srcDoc={`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;font-family:Arial,sans-serif;line-height:1.6;color:#333;}</style>${themeConfig ? `<style>${buildThemeCss(themeConfig)}</style>` : ''}</head><body>${html}</body></html>`}
              className="w-full border-0"
              style={{ minHeight: layout === 'side' ? '500px' : '350px' }}
              sandbox="allow-same-origin"
              title="Email Preview"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 w-full text-gray-400 text-sm gap-2">
            <Eye size={24} className="opacity-30" />
            <span>Preview will appear once you start composing</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Standalone layout toggle for placement in toolbars
export function PreviewLayoutToggle({ layout, onLayoutChange }: { layout: PreviewLayout; onLayoutChange: (l: PreviewLayout) => void }) {
  return (
    <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
      <button
        onClick={() => onLayoutChange('side')}
        title="Side by side"
        className={`p-1.5 rounded transition-colors ${layout === 'side' ? 'bg-white shadow-sm text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
      >
        <PanelRightClose size={14} />
      </button>
      <button
        onClick={() => onLayoutChange('bottom')}
        title="Below editor"
        className={`p-1.5 rounded transition-colors ${layout === 'bottom' ? 'bg-white shadow-sm text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
      >
        <PanelBottomClose size={14} />
      </button>
      <button
        onClick={() => onLayoutChange(layout === 'hidden' ? 'bottom' : 'hidden')}
        title={layout === 'hidden' ? 'Show preview' : 'Hide preview'}
        className={`p-1.5 rounded transition-colors ${layout === 'hidden' ? 'bg-amber-50 text-amber-500' : 'text-gray-400 hover:text-gray-600'}`}
      >
        {layout === 'hidden' ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}
