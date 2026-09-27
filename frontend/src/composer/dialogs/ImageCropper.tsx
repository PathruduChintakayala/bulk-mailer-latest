/**
 * Image cropper (spec 7.3).
 *
 * Crop with a free or fixed ratio, rotate, flip and zoom, then either replace the
 * image in place or keep the original and save the crop as a new asset.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { FlipHorizontal, FlipVertical, RotateCcw, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import * as composerApi from '../api/composerApi';
import type { ImageBlock } from '../model/document';
import { findNode } from '../model/mutations';
import { useComposer } from '../store/composerStore';
import { Dialog, DialogButton } from '../ui/Dialog';
import { SelectInput, SliderInput } from '../ui/controls';
import { Segmented } from '../ui/primitives';

type Ratio = 'free' | '1:1' | '4:3' | '3:2' | '16:9' | '3:4' | '2:3';

const RATIOS: Record<Ratio, number | null> = {
  free: null,
  '1:1': 1,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
  '16:9': 16 / 9,
  '3:4': 3 / 4,
  '2:3': 2 / 3,
};

interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FULL: Crop = { x: 0, y: 0, w: 1, h: 1 };

export function ImageCropper({ blockId, onClose }: { blockId: string | null; onClose: () => void }) {
  const doc = useComposer(store => store.doc);
  const updateNodeById = useComposer(store => store.updateNodeById);
  const found = blockId ? findNode(doc, blockId) : null;
  const block = found?.location.kind === 'block' ? (found.node as ImageBlock) : undefined;

  const [ratio, setRatio] = useState<Ratio>('free');
  const [crop, setCrop] = useState<Crop>(FULL);
  const [rotation, setRotation] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [saving, setSaving] = useState<'replace' | 'new' | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tainted, setTainted] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'; startX: number; startY: number; origin: Crop } | null>(
    null
  );

  const reset = useCallback(() => {
    setCrop(FULL);
    setRotation(0);
    setFlipX(false);
    setFlipY(false);
    setZoom(100);
    setRatio('free');
  }, []);

  useEffect(() => {
    if (blockId) {
      reset();
      setLoaded(false);
      setTainted(false);
    }
  }, [blockId, reset]);

  // Keep the crop rectangle valid whenever a fixed ratio is chosen.
  useEffect(() => {
    const target = RATIOS[ratio];
    const image = imgRef.current;
    if (!target || !image) return;
    const natural = image.naturalWidth / image.naturalHeight || 1;
    setCrop(current => {
      // Ratio is expressed in output pixels, so convert through the natural ratio.
      const desired = target / natural;
      let w = current.w;
      let h = w / desired;
      if (h > 1) {
        h = 1;
        w = h * desired;
      }
      return { x: Math.min(current.x, 1 - w), y: Math.min(current.y, 1 - h), w, h };
    });
  }, [ratio]);

  const onPointerDown = (mode: 'move' | 'nw' | 'ne' | 'sw' | 'se') => (event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    dragRef.current = { mode, startX: event.clientX, startY: event.clientY, origin: crop };
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    const frame = frameRef.current;
    if (!drag || !frame) return;
    // The stage is rotated and mirrored in CSS, so screen movement is converted
    // back into image space before it is applied to the crop rectangle.
    const [screenX, screenY] = [event.clientX - drag.startX, event.clientY - drag.startY];
    const radians = (-rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const localX = (screenX * cos - screenY * sin) * (flipX ? -1 : 1);
    const localY = (screenX * sin + screenY * cos) * (flipY ? -1 : 1);
    const dx = localX / (frame.offsetWidth || 1);
    const dy = localY / (frame.offsetHeight || 1);
    const target = RATIOS[ratio];
    const image = imgRef.current;
    const natural = image ? image.naturalWidth / image.naturalHeight || 1 : 1;
    const desired = target ? target / natural : null;

    setCrop(() => {
      const origin = drag.origin;
      if (drag.mode === 'move') {
        return {
          ...origin,
          x: Math.min(Math.max(0, origin.x + dx), 1 - origin.w),
          y: Math.min(Math.max(0, origin.y + dy), 1 - origin.h),
        };
      }

      let { x, y, w, h } = origin;
      const min = 0.05;
      if (drag.mode === 'se') {
        w = Math.max(min, Math.min(origin.w + dx, 1 - x));
        h = desired ? w / desired : Math.max(min, Math.min(origin.h + dy, 1 - y));
      } else if (drag.mode === 'sw') {
        const nextW = Math.max(min, Math.min(origin.w - dx, origin.x + origin.w));
        x = origin.x + origin.w - nextW;
        w = nextW;
        h = desired ? w / desired : Math.max(min, Math.min(origin.h + dy, 1 - y));
      } else if (drag.mode === 'ne') {
        w = Math.max(min, Math.min(origin.w + dx, 1 - x));
        const nextH = desired ? w / desired : Math.max(min, Math.min(origin.h - dy, origin.y + origin.h));
        y = origin.y + origin.h - nextH;
        h = nextH;
      } else {
        const nextW = Math.max(min, Math.min(origin.w - dx, origin.x + origin.w));
        x = origin.x + origin.w - nextW;
        w = nextW;
        const nextH = desired ? w / desired : Math.max(min, Math.min(origin.h - dy, origin.y + origin.h));
        y = origin.y + origin.h - nextH;
        h = nextH;
      }
      if (y + h > 1) h = 1 - y;
      if (x + w > 1) w = 1 - x;
      return { x: Math.max(0, x), y: Math.max(0, y), w, h };
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const outputSize = useMemo(() => {
    const image = imgRef.current;
    if (!image || !image.naturalWidth) return null;
    const swap = rotation % 180 !== 0;
    const w = Math.round(image.naturalWidth * crop.w);
    const h = Math.round(image.naturalHeight * crop.h);
    return swap ? { w: h, h: w } : { w, h };
  }, [crop, rotation, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const render = useCallback((): Promise<Blob> => {
    const image = imgRef.current;
    if (!image) return Promise.reject(new Error('The image is not ready yet.'));
    const sx = image.naturalWidth * crop.x;
    const sy = image.naturalHeight * crop.y;
    const sw = image.naturalWidth * crop.w;
    const sh = image.naturalHeight * crop.h;
    const swap = rotation % 180 !== 0;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(swap ? sh : sw));
    canvas.height = Math.max(1, Math.round(swap ? sw : sh));
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.reject(new Error('This browser cannot render the crop.'));
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(image, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('The crop could not be encoded.'))), 'image/png');
      } catch {
        reject(new Error('This image is served from another site without cross-origin permission, so it cannot be cropped here.'));
      }
    });
  }, [crop, flipX, flipY, rotation]);

  const apply = async (mode: 'replace' | 'new') => {
    if (!block || !blockId) return;
    setSaving(mode);
    try {
      const blob = await render();
      const base = (block.src.split('/').pop() || 'image').replace(/\.[^.]+$/, '');
      const file = new File([blob], `${base}-crop.png`, { type: 'image/png' });
      const uploaded = await composerApi.uploadAsset(file);
      updateNodeById(
        blockId,
        {
          src: uploaded.url,
          assetCode: uploaded.public_code,
          naturalWidth: outputSize?.w ?? block.naturalWidth ?? null,
          naturalHeight: outputSize?.h ?? block.naturalHeight ?? null,
          ...(block.width && outputSize
            ? { height: Math.round((block.width * outputSize.h) / outputSize.w) }
            : {}),
        },
        'Crop image'
      );
      toast.success(mode === 'replace' ? 'Image replaced with the crop.' : 'Crop saved as a new image and applied.');
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The crop could not be saved.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Dialog
      open={!!blockId && !!block}
      onClose={onClose}
      size="lg"
      title="Crop image"
      description="The original stays in the library. The crop is saved as a new image."
      footer={
        <>
          <DialogButton onClick={reset}>Reset</DialogButton>
          <DialogButton onClick={onClose}>Cancel</DialogButton>
          <DialogButton onClick={() => apply('new')} busy={saving === 'new'} disabled={!loaded || tainted}>
            Save as new
          </DialogButton>
          <DialogButton variant="primary" onClick={() => apply('replace')} busy={saving === 'replace'} disabled={!loaded || tainted}>
            Apply crop
          </DialogButton>
        </>
      }
    >
      {block && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SelectInput
              label="Aspect ratio"
              inline
              value={ratio}
              onChange={value => setRatio(value as Ratio)}
              options={(Object.keys(RATIOS) as Ratio[]).map(key => ({
                value: key,
                label: key === 'free' ? 'Free' : key,
              }))}
            />
            <div className="ml-auto flex items-center gap-1">
              <IconAction label="Rotate left" onClick={() => setRotation(value => (value + 270) % 360)}>
                <RotateCcw size={13} />
              </IconAction>
              <IconAction label="Rotate right" onClick={() => setRotation(value => (value + 90) % 360)}>
                <RotateCw size={13} />
              </IconAction>
              <IconAction label="Flip horizontally" active={flipX} onClick={() => setFlipX(value => !value)}>
                <FlipHorizontal size={13} />
              </IconAction>
              <IconAction label="Flip vertically" active={flipY} onClick={() => setFlipY(value => !value)}>
                <FlipVertical size={13} />
              </IconAction>
              <IconAction label="Zoom out" onClick={() => setZoom(value => Math.max(40, value - 20))}>
                <ZoomOut size={13} />
              </IconAction>
              <IconAction label="Zoom in" onClick={() => setZoom(value => Math.min(200, value + 20))}>
                <ZoomIn size={13} />
              </IconAction>
            </div>
          </div>

          <div className="flex min-h-[220px] items-center justify-center overflow-auto rounded-xl bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px] p-4">
            <div
              className="flex items-center justify-center"
              style={{
                width: `${zoom}%`,
                transform: `rotate(${rotation}deg) scaleX(${flipX ? -1 : 1}) scaleY(${flipY ? -1 : 1})`,
              }}
            >
              <div
                ref={frameRef}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className="relative w-full touch-none select-none"
              >
              <img
                ref={imgRef}
                src={block.src}
                alt=""
                crossOrigin="anonymous"
                draggable={false}
                onLoad={() => setLoaded(true)}
                onError={() => {
                  setLoaded(true);
                  setTainted(true);
                }}
                className="block w-full"
              />
              <div className="pointer-events-none absolute inset-0 bg-black/45" />
              <div
                onPointerDown={onPointerDown('move')}
                className="absolute cursor-move overflow-hidden ring-2 ring-white"
                style={{
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.w * 100}%`,
                  height: `${crop.h * 100}%`,
                }}
              >
                {/* Unmasked copy of the source so the selection reads as a real crop. */}
                  <img
                  src={block.src}
                  alt=""
                  draggable={false}
                  aria-hidden="true"
                  className="pointer-events-none absolute"
                  style={{
                    width: `${(1 / crop.w) * 100}%`,
                    height: `${(1 / crop.h) * 100}%`,
                    left: `${(-crop.x / crop.w) * 100}%`,
                    top: `${(-crop.y / crop.h) * 100}%`,
                  }}
                />
                <span className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                  {Array.from({ length: 9 }).map((_, index) => (
                    <span key={index} className="border border-white/25" />
                  ))}
                </span>
                {(['nw', 'ne', 'sw', 'se'] as const).map(corner => (
                  <span
                    key={corner}
                    onPointerDown={onPointerDown(corner)}
                    role="presentation"
                    className={clsx(
                      'absolute h-3 w-3 rounded-sm border border-gray-500 bg-white',
                      corner === 'nw' && '-left-1.5 -top-1.5 cursor-nwse-resize',
                      corner === 'ne' && '-right-1.5 -top-1.5 cursor-nesw-resize',
                      corner === 'sw' && '-bottom-1.5 -left-1.5 cursor-nesw-resize',
                      corner === 'se' && '-bottom-1.5 -right-1.5 cursor-nwse-resize'
                    )}
                  />
                ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[180px] flex-1">
              <SliderInput label="Zoom" value={zoom} onChange={setZoom} min={40} max={200} step={10} suffix="%" />
            </div>
            <Segmented
              label="Crop preset"
              size="sm"
              value={crop.w === 1 && crop.h === 1 ? 'full' : 'custom'}
              onChange={value => value === 'full' && setCrop(FULL)}
              options={[
                { value: 'full', label: 'Whole image' },
                { value: 'custom', label: 'Cropped' },
              ]}
            />
            {outputSize && (
              <p className="text-[11.5px] tabular-nums text-gray-500">
                Output {outputSize.w}×{outputSize.h}px
              </p>
            )}
          </div>

          {tainted && (
            <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11.5px] leading-snug text-amber-800">
              This image is hosted elsewhere and does not allow cross-origin access, so it cannot be cropped here. Upload
              it to the library first.
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}

function IconAction({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={clsx(
        'rounded-lg border p-1.5 transition-colors',
        active ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
      )}
    >
      {children}
    </button>
  );
}
