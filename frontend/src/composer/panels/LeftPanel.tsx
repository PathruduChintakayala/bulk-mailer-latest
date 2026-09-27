/**
 * The left dock: a switch between the block palette and the layers tree (spec 4).
 *
 * Collapsing and width are remembered per user through editor preferences.
 */

import { Blocks, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import clsx from 'clsx';
import { usePreferences, PANEL_MAX, PANEL_MIN } from '../store/preferences';
import { ResizeHandle } from '../shell/SplitPane';
import { Segmented } from '../ui/primitives';
import { BlocksPanel } from './BlocksPanel';
import { LayersPanel } from './LayersPanel';
import type { ReusableBlockRecord } from '../api/types';

export function LeftPanel({
  reusables,
  reusablesLoading,
  onInsertReusable,
  onOpenLibrary,
}: {
  reusables: ReusableBlockRecord[];
  reusablesLoading: boolean;
  onInsertReusable: (code: string) => void;
  onOpenLibrary: () => void;
}) {
  const { prefs, set } = usePreferences();

  if (!prefs.leftPanelOpen) {
    return (
      <div className="flex w-9 shrink-0 flex-col items-center gap-1 border-r border-gray-200 bg-white py-2">
        <button
          type="button"
          onClick={() => set('leftPanelOpen', true)}
          title="Show the blocks panel"
          aria-label="Show the blocks panel"
          className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
        >
          <ChevronRight size={15} />
        </button>
        <button
          type="button"
          onClick={() => {
            set('leftPanelView', 'blocks');
            set('leftPanelOpen', true);
          }}
          title="Blocks"
          aria-label="Blocks"
          className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
        >
          <Blocks size={15} />
        </button>
        <button
          type="button"
          onClick={() => {
            set('leftPanelView', 'layers');
            set('leftPanelOpen', true);
          }}
          title="Layers"
          aria-label="Layers"
          className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
        >
          <Layers size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex shrink-0 border-r border-gray-200 bg-white" style={{ width: prefs.leftPanelWidth }}>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5 border-b border-gray-100 px-2 py-2">
          <Segmented
            label="Left panel view"
            size="sm"
            value={prefs.leftPanelView}
            onChange={view => set('leftPanelView', view)}
            options={[
              { value: 'blocks', label: 'Blocks', icon: <Blocks size={12} /> },
              { value: 'layers', label: 'Layers', icon: <Layers size={12} /> },
            ]}
          />
          <button
            type="button"
            onClick={() => set('leftPanelOpen', false)}
            title="Hide this panel"
            aria-label="Hide this panel"
            className={clsx(
              'ml-auto rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
            )}
          >
            <ChevronLeft size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1">
          {prefs.leftPanelView === 'blocks' ? (
            <BlocksPanel
              reusables={reusables}
              reusablesLoading={reusablesLoading}
              onInsertReusable={onInsertReusable}
              onOpenLibrary={onOpenLibrary}
            />
          ) : (
            <LayersPanel />
          )}
        </div>
      </div>

      <ResizeHandle
        orientation="horizontal"
        label="Resize the left panel"
        edge="end"
        onDelta={delta =>
          set('leftPanelWidth', Math.min(PANEL_MAX.left, Math.max(PANEL_MIN.left, prefs.leftPanelWidth + delta)))
        }
        onReset={() => set('leftPanelWidth', 264)}
      />
    </div>
  );
}
