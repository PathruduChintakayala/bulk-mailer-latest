/**
 * The right dock holding the properties inspector (spec 4.3, 4.4).
 *
 * Collapse state and width persist per user, and collapsing leaves a rail so the
 * panel can be brought back without hunting through menus.
 */

import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { usePreferences, PANEL_MAX, PANEL_MIN } from '../store/preferences';
import { ResizeHandle } from '../shell/SplitPane';
import { Inspector } from './Inspector';
import type { InspectorActions } from './inspectorParts';

export function RightPanel({ actions }: { actions: InspectorActions }) {
  const { prefs, set } = usePreferences();

  if (!prefs.rightPanelOpen) {
    return (
      <div className="flex w-9 shrink-0 flex-col items-center gap-1 border-l border-gray-200 bg-white py-2">
        <button
          type="button"
          onClick={() => set('rightPanelOpen', true)}
          title="Show the properties panel"
          aria-label="Show the properties panel"
          className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          type="button"
          onClick={() => set('rightPanelOpen', true)}
          title="Properties"
          aria-label="Properties"
          className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
        >
          <SlidersHorizontal size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex shrink-0 border-l border-gray-200 bg-white" style={{ width: prefs.rightPanelWidth }}>
      <ResizeHandle
        orientation="horizontal"
        label="Resize the properties panel"
        edge="start"
        onDelta={delta =>
          set('rightPanelWidth', Math.min(PANEL_MAX.right, Math.max(PANEL_MIN.right, prefs.rightPanelWidth + delta)))
        }
        onReset={() => set('rightPanelWidth', 320)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5 border-b border-gray-100 px-3 py-2">
          <SlidersHorizontal size={13} className="text-gray-400" />
          <p className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Properties</p>
          <button
            type="button"
            onClick={() => set('rightPanelOpen', false)}
            title="Hide this panel"
            aria-label="Hide this panel"
            className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <Inspector actions={actions} />
        </div>
      </div>
    </div>
  );
}
