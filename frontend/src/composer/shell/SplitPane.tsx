/**
 * Draggable split with a keyboard-operable handle (spec 2.4).
 *
 * Minimum sizes are enforced on both panes, the ratio is remembered by the
 * caller, and double-clicking the handle restores the default balance.
 */

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

const DEFAULT_RATIO = 0.58;

export function SplitPane({
  orientation,
  ratio,
  onRatioChange,
  first,
  second,
  minFirstPx = 320,
  minSecondPx = 280,
  firstLabel,
  secondLabel,
}: {
  orientation: 'horizontal' | 'vertical';
  ratio: number;
  onRatioChange: (ratio: number) => void;
  first: ReactNode;
  second: ReactNode;
  minFirstPx?: number;
  minSecondPx?: number;
  firstLabel: string;
  secondLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const horizontal = orientation === 'horizontal';

  const clampToPixels = useCallback(
    (value: number) => {
      const container = containerRef.current;
      if (!container) return Math.min(0.82, Math.max(0.18, value));
      const total = horizontal ? container.clientWidth : container.clientHeight;
      if (total <= minFirstPx + minSecondPx) return 0.5;
      const min = minFirstPx / total;
      const max = 1 - minSecondPx / total;
      return Math.min(max, Math.max(min, value));
    },
    [horizontal, minFirstPx, minSecondPx]
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const next = horizontal
        ? (event.clientX - rect.left) / rect.width
        : (event.clientY - rect.top) / rect.height;
      onRatioChange(clampToPixels(next));
    };
    const onUp = () => setDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    // Keep the drag cursor and prevent the iframe from swallowing pointer events.
    document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, horizontal, onRatioChange, clampToPixels]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 0.08 : 0.02;
    const decrease = horizontal ? 'ArrowLeft' : 'ArrowUp';
    const increase = horizontal ? 'ArrowRight' : 'ArrowDown';
    if (event.key === decrease) {
      event.preventDefault();
      onRatioChange(clampToPixels(ratio - step));
    } else if (event.key === increase) {
      event.preventDefault();
      onRatioChange(clampToPixels(ratio + step));
    } else if (event.key === 'Home') {
      event.preventDefault();
      onRatioChange(clampToPixels(0.3));
    } else if (event.key === 'End') {
      event.preventDefault();
      onRatioChange(clampToPixels(0.7));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onRatioChange(DEFAULT_RATIO);
    }
  };

  const percent = Math.round(ratio * 1000) / 10;

  return (
    <div
      ref={containerRef}
      className={clsx('flex min-h-0 min-w-0 flex-1', horizontal ? 'flex-row' : 'flex-col')}
    >
      <div
        className="flex min-h-0 min-w-0 flex-col overflow-hidden"
        style={horizontal ? { width: `${percent}%` } : { height: `${percent}%` }}
      >
        {first}
      </div>

      <div
        role="separator"
        tabIndex={0}
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        aria-label={`Resize ${firstLabel} and ${secondLabel}`}
        aria-valuenow={percent}
        aria-valuemin={10}
        aria-valuemax={90}
        title="Drag to resize. Double-click to reset."
        onPointerDown={event => {
          event.preventDefault();
          setDragging(true);
        }}
        onDoubleClick={() => onRatioChange(DEFAULT_RATIO)}
        onKeyDown={onKeyDown}
        className={clsx(
          'group relative shrink-0 bg-gray-200/70 transition-colors',
          'focus:outline-none focus-visible:bg-brand-500',
          horizontal ? 'w-px cursor-col-resize hover:bg-brand-400' : 'h-px cursor-row-resize hover:bg-brand-400',
          dragging && 'bg-brand-500'
        )}
      >
        {/* Widened hit area without changing the visual line. */}
        <span
          aria-hidden="true"
          className={clsx(
            'absolute',
            horizontal ? '-left-1.5 -right-1.5 top-0 bottom-0' : '-top-1.5 -bottom-1.5 left-0 right-0'
          )}
        />
        <span
          aria-hidden="true"
          className={clsx(
            'absolute rounded-full bg-gray-400 opacity-0 transition-opacity group-hover:opacity-100',
            horizontal
              ? 'left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2'
              : 'left-1/2 top-1/2 h-1 w-8 -translate-x-1/2 -translate-y-1/2'
          )}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{second}</div>
    </div>
  );
}

/** Vertical/horizontal resize handle for docked panels. */
export function ResizeHandle({
  orientation,
  onDelta,
  onReset,
  label,
  edge = 'end',
}: {
  orientation: 'horizontal' | 'vertical';
  onDelta: (delta: number) => void;
  onReset?: () => void;
  label: string;
  edge?: 'start' | 'end';
}) {
  const [dragging, setDragging] = useState(false);
  const last = useRef(0);
  const horizontal = orientation === 'horizontal';

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => {
      const current = horizontal ? event.clientX : event.clientY;
      const delta = current - last.current;
      last.current = current;
      onDelta(edge === 'end' ? delta : -delta);
    };
    const onUp = () => setDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, horizontal, onDelta, edge]);

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      aria-label={label}
      title="Drag to resize. Double-click to reset."
      onPointerDown={event => {
        event.preventDefault();
        last.current = horizontal ? event.clientX : event.clientY;
        setDragging(true);
      }}
      onDoubleClick={onReset}
      onKeyDown={event => {
        const step = event.shiftKey ? 32 : 8;
        const dec = horizontal ? 'ArrowLeft' : 'ArrowUp';
        const inc = horizontal ? 'ArrowRight' : 'ArrowDown';
        if (event.key === dec) {
          event.preventDefault();
          onDelta(edge === 'end' ? -step : step);
        } else if (event.key === inc) {
          event.preventDefault();
          onDelta(edge === 'end' ? step : -step);
        } else if (event.key === 'Enter' && onReset) {
          event.preventDefault();
          onReset();
        }
      }}
      className={clsx(
        'shrink-0 bg-transparent transition-colors hover:bg-brand-400/60 focus:outline-none focus-visible:bg-brand-500',
        horizontal ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize',
        dragging && 'bg-brand-500'
      )}
    />
  );
}
