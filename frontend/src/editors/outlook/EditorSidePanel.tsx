import React, { useState } from 'react';
import { Eye, Settings2, ChevronLeft, ChevronRight } from 'lucide-react';

interface EditorSidePanelProps {
  previewContent?: React.ReactNode;
  propertiesContent?: React.ReactNode;
  defaultTab?: 'preview' | 'properties';
  defaultCollapsed?: boolean;
}

/**
 * Side panel for the compose workspace showing Preview or Properties tabs.
 * Collapsible to maximize editor space.
 */
export default function EditorSidePanel({
  previewContent,
  propertiesContent,
  defaultTab = 'preview',
  defaultCollapsed = false,
}: EditorSidePanelProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'properties'>(defaultTab);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-2 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 w-8">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500"
          title="Expand panel"
        >
          <ChevronLeft size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-[320px] min-w-[280px] border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      {/* Tab header */}
      <div className="flex items-center border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('preview')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 ${
            activeTab === 'preview'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Eye size={13} /> Preview
        </button>
        {propertiesContent && (
          <button
            onClick={() => setActiveTab('properties')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 ${
              activeTab === 'properties'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Settings2 size={13} /> Properties
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setCollapsed(true)}
          className="p-1.5 mr-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
          title="Collapse panel"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'preview' && previewContent}
        {activeTab === 'properties' && propertiesContent}
      </div>
    </div>
  );
}
