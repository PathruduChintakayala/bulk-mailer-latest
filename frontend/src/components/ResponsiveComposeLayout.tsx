import React, { useState } from 'react';

interface ResponsiveComposeLayoutProps {
  editor: React.ReactNode;
  preview: React.ReactNode;
  editorToolbar?: React.ReactNode;
}

export default function ResponsiveComposeLayout({ editor, preview, editorToolbar }: ResponsiveComposeLayoutProps) {
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');

  return (
    <>
      {/* Mobile tab toggle (< 768px) */}
      <div className="md:hidden flex mb-3">
        <button
          onClick={() => setActiveTab('editor')}
          className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'editor'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Editor
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'preview'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Preview
        </button>
      </div>

      {/* Desktop side-by-side (≥1280px), tablet stacked (768-1279px), mobile tabbed (<768px) */}
      <div className="flex flex-col xl:flex-row gap-5 min-h-0 flex-1">
        {/* Editor panel */}
        <div
          className={`xl:w-[62%] min-w-0 flex flex-col ${
            activeTab !== 'editor' ? 'hidden md:flex' : 'flex'
          }`}
        >
          {editorToolbar && (
            <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
              {editorToolbar}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto">{editor}</div>
        </div>

        {/* Preview panel */}
        <div
          className={`xl:w-[38%] min-w-0 xl:min-w-[360px] flex flex-col ${
            activeTab !== 'preview' ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="flex-1 min-h-0 overflow-y-auto border border-gray-200 rounded-xl bg-gray-50">
            {preview}
          </div>
        </div>
      </div>
    </>
  );
}
