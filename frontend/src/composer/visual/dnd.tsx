/**
 * Drag and drop wiring for the visual editor (spec 3.1).
 *
 * A single DndContext spans the block palette and the canvas so new blocks,
 * existing blocks, rows and sections all use the same drop targets. Every drag
 * operation has a keyboard equivalent in the block action rail and Layers panel,
 * so pointer dragging is never the only way to reorder content.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { BLOCK_LABELS, type BlockType } from '../model/document';
import { LAYOUT_PRESETS, createBlock, type LayoutPresetId } from '../model/defaults';
import { useComposer } from '../store/composerStore';

export type DragPayload =
  | { kind: 'block'; blockId: string; label: string }
  | { kind: 'row'; rowId: string; label: string }
  | { kind: 'section'; sectionId: string; label: string }
  | { kind: 'new-block'; blockType: BlockType; label: string }
  | { kind: 'new-preset'; presetId: LayoutPresetId; label: string }
  | { kind: 'new-reusable'; reusableCode: string; label: string };

export type DropTarget =
  | { kind: 'block-slot'; columnId: string; index: number }
  | { kind: 'row-slot'; sectionId: string; index: number }
  | { kind: 'section-slot'; index: number };

interface DragState {
  active: DragPayload | null;
  overId: string | null;
}

const DragContext = createContext<DragState>({ active: null, overId: null });
export const useDragState = () => useContext(DragContext);

export function ComposerDndProvider({
  children,
  onInsertReusable,
}: {
  children: ReactNode;
  /** Resolves a saved block into document nodes; the library owns that lookup. */
  onInsertReusable?: (code: string, target: DropTarget) => void;
}) {
  const [state, setState] = useState<DragState>({ active: null, overId: null });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor)
  );

  const addBlock = useComposer(store => store.addBlock);
  const addSection = useComposer(store => store.addSection);
  const addRow = useComposer(store => store.addRow);
  const moveBlockTo = useComposer(store => store.moveBlockTo);
  const moveRowTo = useComposer(store => store.moveRowTo);
  const moveSectionTo = useComposer(store => store.moveSectionTo);

  const onDragStart = useCallback((event: DragStartEvent) => {
    setState({ active: (event.active.data.current as DragPayload) || null, overId: null });
  }, []);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const payload = event.active.data.current as DragPayload | undefined;
      const target = event.over?.data.current as DropTarget | undefined;
      setState({ active: null, overId: null });
      if (!payload || !target) return;

      if (payload.kind === 'new-block') {
        const block = createBlock(payload.blockType);
        if (target.kind === 'block-slot') {
          addBlock(block, { columnId: target.columnId, index: target.index });
        } else {
          // Dropped between rows or sections: wrap the block in its own section.
          addBlock(block);
        }
        return;
      }

      if (payload.kind === 'new-preset') {
        const preset = LAYOUT_PRESETS.find(entry => entry.id === payload.presetId);
        if (!preset) return;
        const section = preset.build();
        if (target.kind === 'section-slot') addSection(section, target.index);
        else if (target.kind === 'row-slot') addRow(target.sectionId, section.rows[0], target.index);
        else addSection(section);
        return;
      }

      if (payload.kind === 'new-reusable') {
        onInsertReusable?.(payload.reusableCode, target);
        return;
      }

      if (payload.kind === 'block' && target.kind === 'block-slot') {
        moveBlockTo(payload.blockId, target.columnId, target.index);
        return;
      }
      if (payload.kind === 'row' && target.kind === 'row-slot') {
        moveRowTo(payload.rowId, target.sectionId, target.index);
        return;
      }
      if (payload.kind === 'section' && target.kind === 'section-slot') {
        moveSectionTo(payload.sectionId, target.index);
      }
    },
    [addBlock, addRow, addSection, moveBlockTo, moveRowTo, moveSectionTo, onInsertReusable]
  );

  const value = useMemo(() => state, [state]);

  return (
    <DragContext.Provider value={value}>
      <DndContext
        sensors={sensors}
        // pointerWithin gives precise thin insertion slots; rect intersection is the fallback.
        collisionDetection={args => {
          const within = pointerWithin(args);
          return within.length ? within : rectIntersection(args);
        }}
        onDragStart={onDragStart}
        onDragOver={event => setState(current => ({ ...current, overId: event.over?.id ? String(event.over.id) : null }))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setState({ active: null, overId: null })}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {state.active && (
            <div className="pointer-events-none rounded-lg bg-gray-900/90 px-2.5 py-1.5 text-[12px] font-medium text-white shadow-lg">
              {state.active.label}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </DragContext.Provider>
  );
}

// ── draggable helpers ─────────────────────────────────────────────────────────

export function useNodeDrag(payload: DragPayload, id: string, disabled = false) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data: payload, disabled });
  return { attributes, listeners, setNodeRef, isDragging };
}

export function newBlockPayload(type: BlockType): DragPayload {
  return { kind: 'new-block', blockType: type, label: BLOCK_LABELS[type] };
}

export function newPresetPayload(id: LayoutPresetId, label: string): DragPayload {
  return { kind: 'new-preset', presetId: id, label };
}

// ── drop slot ─────────────────────────────────────────────────────────────────

/**
 * A thin insertion slot rendered between siblings. It grows and highlights while a
 * compatible payload is dragged over it, which is the visible insertion indicator.
 */
export function DropSlot({
  id,
  target,
  orientation = 'horizontal',
  accepts,
  label,
}: {
  id: string;
  target: DropTarget;
  orientation?: 'horizontal' | 'vertical';
  accepts: DragPayload['kind'][];
  label: string;
}) {
  const { active } = useDragState();
  const enabled = !!active && accepts.includes(active.kind);
  const { setNodeRef, isOver } = useDroppable({ id, data: target, disabled: !enabled });

  if (!active) return orientation === 'horizontal' ? <div className="h-1.5" /> : <div className="w-1.5" />;

  return (
    <div
      ref={setNodeRef}
      aria-label={label}
      className={
        orientation === 'horizontal'
          ? `relative transition-all ${enabled ? (isOver ? 'h-8' : 'h-3') : 'h-1.5'}`
          : `relative transition-all ${enabled ? (isOver ? 'w-8' : 'w-3') : 'w-1.5'}`
      }
    >
      {enabled && (
        <span
          className={
            orientation === 'horizontal'
              ? `absolute left-0 right-0 top-1/2 -translate-y-1/2 rounded-full transition-all ${
                  isOver ? 'h-1 bg-brand-500 shadow-[0_0_0_3px_rgba(99,102,241,0.18)]' : 'h-0.5 bg-brand-200'
                }`
              : `absolute bottom-0 left-1/2 top-0 -translate-x-1/2 rounded-full transition-all ${
                  isOver ? 'w-1 bg-brand-500 shadow-[0_0_0_3px_rgba(99,102,241,0.18)]' : 'w-0.5 bg-brand-200'
                }`
          }
        />
      )}
    </div>
  );
}

/** A whole-area drop target used by empty columns and the empty canvas. */
export function DropArea({
  id,
  target,
  accepts,
  children,
  className,
}: {
  id: string;
  target: DropTarget;
  accepts: DragPayload['kind'][];
  children: ReactNode;
  className?: string;
}) {
  const { active } = useDragState();
  const enabled = !!active && accepts.includes(active.kind);
  const { setNodeRef, isOver } = useDroppable({ id, data: target, disabled: !enabled });
  return (
    <div
      ref={setNodeRef}
      className={`${className || ''} ${enabled && isOver ? 'ring-2 ring-brand-400 ring-offset-1' : ''} rounded-lg transition-shadow`}
    >
      {children}
    </div>
  );
}
