'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveCanvasElementAsset } from '@/lib/canvas-schema';
import { buildAnimationStyle } from '@/lib/canvas-animation';
import type { UseCanvasEditorReturn } from './useCanvasEditor';
import type { CanvasElement } from '@/lib/canvas-schema';
import { CanvasVideo } from '@/components/CanvasVideo';
import { CanvasRichText } from '@/components/CanvasRichText';

/* Editor chrome (badges, handles, guides) divides by the stage scale so it
   keeps a constant on-screen size inside the true-pixel, scaled-down canvas. */
const badgeClass =
  'pointer-events-none absolute z-[3] whitespace-nowrap bg-primary text-white text-[length:calc(10px/var(--stage-scale,1))] px-[calc(6px/var(--stage-scale,1))] py-[calc(2px/var(--stage-scale,1))] rounded-[calc(4px/var(--stage-scale,1))]';

const handleClass =
  'absolute z-[4] bg-panel h-[calc(9px/var(--stage-scale,1))] w-[calc(9px/var(--stage-scale,1))] [border:calc(1px/var(--stage-scale,1))_solid_var(--primary)]';

const handlePositionClasses: Record<'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw', string> = {
  n: 'left-1/2 -translate-x-1/2 cursor-ns-resize top-[calc(-5px/var(--stage-scale,1))]',
  s: 'left-1/2 -translate-x-1/2 cursor-ns-resize bottom-[calc(-5px/var(--stage-scale,1))]',
  e: 'top-1/2 -translate-y-1/2 cursor-ew-resize right-[calc(-5px/var(--stage-scale,1))]',
  w: 'top-1/2 -translate-y-1/2 cursor-ew-resize left-[calc(-5px/var(--stage-scale,1))]',
  ne: 'cursor-nesw-resize top-[calc(-5px/var(--stage-scale,1))] right-[calc(-5px/var(--stage-scale,1))]',
  nw: 'cursor-nwse-resize top-[calc(-5px/var(--stage-scale,1))] left-[calc(-5px/var(--stage-scale,1))]',
  se: 'cursor-nwse-resize right-[calc(-5px/var(--stage-scale,1))] bottom-[calc(-5px/var(--stage-scale,1))]',
  sw: 'cursor-nesw-resize left-[calc(-5px/var(--stage-scale,1))] bottom-[calc(-5px/var(--stage-scale,1))]',
};

const snapGuideClass =
  'pointer-events-none absolute z-[10000] bg-attention shadow-[0_0_14px_rgba(252,163,17,0.58)]';

/** Breathing room between the fitted canvas and the stage edges, in px. */
const STAGE_FIT_MARGIN = 48;

export function EditorStage({ editor }: { editor: UseCanvasEditorReturn }) {
  const selected = editor.selectedCanvas;
  const canvasWidth = selected?.settings.width ?? 1920;
  const canvasHeight = selected?.settings.height ?? 1080;

  // The stage renders the canvas at its true pixel size and scales it down
  // with a transform — the same technique the browser source uses — so text
  // wraps and clips identically in both places instead of approximating font
  // sizes with a fixed divisor.
  const sectionRef = useRef<HTMLElement | null>(null);
  const [fitScale, setFitScale] = useState(0.35);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    function updateFitScale() {
      if (!section) return;
      const rect = section.getBoundingClientRect();
      const availableWidth = rect.width - STAGE_FIT_MARGIN;
      const availableHeight = rect.height - STAGE_FIT_MARGIN;
      if (availableWidth <= 0 || availableHeight <= 0) return;
      setFitScale(Math.min(availableWidth / canvasWidth, availableHeight / canvasHeight));
    }

    updateFitScale();
    const observer = new ResizeObserver(updateFitScale);
    observer.observe(section);
    return () => observer.disconnect();
  }, [canvasWidth, canvasHeight]);

  const displayScale = Math.max(0.01, fitScale * (editor.zoom / 100));

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!selected) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        editor.selectElement(null);
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        if (editor.selectedElement && selected.settings.elements.length > 1) {
          editor.deleteElement(editor.selectedElement);
        }
        return;
      }

      if (editor.selectedElement) {
        const element = selected.settings.elements.find((el) => el.id === editor.selectedElement);
        if (!element) return;

        const shift = event.shiftKey;
        const delta = shift ? 10 : 1;

        switch (event.key) {
          case 'ArrowLeft': {
            event.preventDefault();
            editor.patchElement(element.id, { x: Math.max(0, element.x - delta) });
            break;
          }
          case 'ArrowRight': {
            event.preventDefault();
            editor.patchElement(element.id, {
              x: Math.min(selected.settings.width - element.width, element.x + delta),
            });
            break;
          }
          case 'ArrowUp': {
            event.preventDefault();
            editor.patchElement(element.id, { y: Math.max(0, element.y - delta) });
            break;
          }
          case 'ArrowDown': {
            event.preventDefault();
            editor.patchElement(element.id, {
              y: Math.min(selected.settings.height - element.height, element.y + delta),
            });
            break;
          }
          default:
            break;
        }
      }
    },
    [editor, selected],
  );

  const handleStageClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        editor.selectElement(null);
      }
    },
    [editor],
  );

  return (
    <section
      ref={sectionRef}
      className="flex flex-col items-center justify-center overflow-hidden bg-[#131418] [background-image:repeating-conic-gradient(rgba(204,219,220,0.05)_0%_25%,transparent_0%_50%)_50%_50%/26px_26px] [grid-area:stage]"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* The frame occupies the scaled footprint in layout (transforms don't
          affect layout), keeping the canvas centered and the toolbar in view. */}
      <div
        className="relative shrink-0 shadow-brand [outline:1px_solid_var(--line-strong)]"
        style={{
          width: canvasWidth * displayScale,
          height: canvasHeight * displayScale,
        }}
      >
        <div
          ref={editor.stageRef}
          className={`relative origin-top-left ${
            selected?.settings.background === 'dark' ? 'bg-[#101114]' : 'bg-[rgba(19,20,24,0.72)]'
          }`}
          style={{
            width: canvasWidth,
            height: canvasHeight,
            transform: `scale(${displayScale})`,
            ['--stage-scale' as string]: String(displayScale),
          }}
          onClick={handleStageClick}
        >
          {selected ? (
            <>
              {editor.snapGuides.vertical ? (
                <span
                  className={`${snapGuideClass} inset-y-0 left-1/2 -translate-x-1/2 w-[calc(2px/var(--stage-scale,1))]`}
                />
              ) : null}
              {editor.snapGuides.horizontal ? (
                <span
                  className={`${snapGuideClass} inset-x-0 top-1/2 -translate-y-1/2 h-[calc(2px/var(--stage-scale,1))]`}
                />
              ) : null}

              {[...selected.settings.elements]
                .filter((element) => !element.hidden)
                .sort((a, b) => a.zIndex - b.zIndex)
                .map((element) => (
                  <ElementView
                    // Remount per preview + phase so entrance and exit
                    // animations replay on each test click.
                    key={`${element.id}-${editor.previewAlert?.id ?? 'static'}-${editor.previewExiting ? 'out' : 'in'}`}
                    element={element}
                    editor={editor}
                    selected={editor.selectedElement === element.id}
                  />
                ))}
            </>
          ) : null}
        </div>
      </div>

      {selected ? (
        <div className="sticky left-1/2 z-20 mt-2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-[rgba(28,30,35,0.92)] px-2.5 py-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.4)]">
          <button
            className="cursor-pointer rounded-full border px-2.5 py-[5px] text-xs font-semibold border-transparent bg-transparent text-muted hover:bg-surface-soft hover:text-text"
            type="button"
            aria-label="Zoom out"
            onClick={() => editor.setZoom(Math.max(25, editor.zoom - 10))}
          >
            −
          </button>
          <span className="min-w-[38px] text-center text-xs tabular-nums text-text">
            {editor.zoom}%
          </span>
          <button
            className="cursor-pointer rounded-full border px-2.5 py-[5px] text-xs font-semibold border-transparent bg-transparent text-muted hover:bg-surface-soft hover:text-text"
            type="button"
            aria-label="Zoom in"
            onClick={() => editor.setZoom(Math.min(200, editor.zoom + 10))}
          >
            +
          </button>
          <span className="mx-0.5 h-[18px] w-px bg-line" />
          <button
            className="cursor-pointer rounded-full border px-2.5 py-[5px] text-xs font-semibold border-transparent bg-transparent text-muted hover:bg-surface-soft hover:text-text"
            type="button"
            onClick={() => editor.setZoom(100)}
          >
            Fit
          </button>
          <button
            className={`cursor-pointer rounded-full border px-2.5 py-[5px] text-xs font-semibold ${editor.snapEnabled ? 'border-accent bg-surface-hover text-accent' : 'border-transparent bg-transparent text-muted hover:bg-surface-soft hover:text-text'}`}
            type="button"
            aria-pressed={editor.snapEnabled}
            onClick={() => editor.toggleSnap()}
          >
            Snap
          </button>
          <button
            className={`cursor-pointer rounded-full border px-2.5 py-[5px] text-xs font-semibold ${
              selected.settings.background === 'dark'
                ? 'border-accent bg-surface-hover text-accent'
                : 'border-transparent bg-transparent text-muted hover:bg-surface-soft hover:text-text'
            }`}
            type="button"
            onClick={() =>
              editor.patchCanvas(selected.id, {
                settings: {
                  background: selected.settings.background === 'dark' ? 'transparent' : 'dark',
                },
              })
            }
          >
            Bg
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ElementView({
  element,
  editor,
  selected,
}: {
  element: CanvasElement;
  editor: UseCanvasEditorReturn;
  selected: boolean;
}) {
  function handlePointerDown(event: ReactPointerEvent) {
    if (element.locked) {
      event.stopPropagation();
      editor.selectElement(element.id);
      return;
    }
    editor.startElementPointer(event, element.id, 'move');
  }

  function handleResizePointerDown(
    event: ReactPointerEvent,
    mode: 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw',
  ) {
    event.stopPropagation();
    editor.startElementPointer(event, element.id, mode);
  }

  // Build animation style only during preview playback. The key remount
  // (above) ensures the animation replays on each test click.
  const animStyle =
    editor.previewAlert && !editor.previewExiting
      ? buildAnimationStyle(element, 'in')
      : editor.previewAlert && editor.previewExiting
        ? buildAnimationStyle(element, 'out')
        : null;

  // Text elements keep rendering past their box instead of slicing glyphs
  // mid-letter, matching the browser-source runtime.
  const isTextType = element.type === 'text' || element.type === 'alert-message';

  return (
    <div
      // Selection chrome uses outline (not border) so the element's content box
      // stays identical to the browser-source runtime and text wraps the same.
      className={`absolute flex min-h-4 min-w-4 touch-none select-none items-center justify-center bg-transparent text-center text-text [overflow-wrap:anywhere] ${
        isTextType ? 'overflow-visible' : 'overflow-hidden'
      }${selected ? ' [outline:calc(1.5px/var(--stage-scale,1))_solid_var(--primary)]' : ''} ${
        element.locked ? 'cursor-default' : 'cursor-pointer'
      }`}
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        zIndex: element.zIndex,
        transform: `rotate(${element.rotation}deg)`,
      }}
      onPointerDown={handlePointerDown}
      onClick={(event) => {
        event.stopPropagation();
        editor.selectElement(element.id);
      }}
    >
      <div
        className="flex h-full w-full items-center justify-center"
        style={{
          opacity: element.opacity,
          background: element.styles.backgroundColor,
          borderRadius: element.styles.borderRadius,
          color: element.styles.color,
          fontFamily: element.styles.fontFamily,
          fontSize: element.styles.fontSize,
          fontWeight: element.styles.fontWeight,
          textShadow: element.styles.textShadow,
          WebkitTextStroke:
            element.styles.textStrokeWidth && element.styles.textStrokeColor
              ? `${element.styles.textStrokeWidth}px ${element.styles.textStrokeColor}`
              : undefined,
          ...(animStyle
            ? {
                animationName: animStyle.animationName,
                animationDuration: animStyle.animationDuration,
                animationDelay: animStyle.animationDelay,
                animationFillMode: animStyle.animationFillMode,
              }
            : {}),
        }}
      >
        {selected ? (
          <span
            className={`${badgeClass} font-bold bottom-[calc(100%+5px/var(--stage-scale,1))] left-0`}
          >
            {element.name}
          </span>
        ) : null}

        <div
          className={`flex h-full w-full items-center justify-center ${isTextType ? 'overflow-visible' : 'overflow-hidden'}`}
        >
          {element.type === 'alert-image' ? (
            <AlertImageContent element={element} editor={editor} />
          ) : element.type === 'shape' ? null : (
            // Padding must match the browser-source runtime text element so
            // line wrapping is identical.
            <span className="block w-full whitespace-pre-wrap p-[18px]">
              <CanvasRichText
                content={element.bindings.richText ?? { spans: [{ text: '', styles: {} }] }}
                alert={editor.previewAlert}
              />
            </span>
          )}
        </div>
      </div>
      {selected ? (
        <>
          <span
            className={`${badgeClass} font-medium font-mono left-1/2 top-[calc(100%+5px/var(--stage-scale,1))] -translate-x-1/2`}
          >
            {element.width} × {element.height}
          </span>
          {(['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'] as const).map((handle) => (
            <span
              key={handle}
              className={`${handleClass} ${handlePositionClasses[handle]}`}
              aria-label={`Resize ${handle}`}
              role="presentation"
              onPointerDown={(event) => handleResizePointerDown(event, handle)}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

/**
 * Renders the visual for an `alert-image` element on the editor stage. Resolves
 * a bound stored asset (image or video), a bound external URL, or the visual
 * asset carried by the previewed test alert — matching the browser-source
 * runtime — and falls back to the placeholder only when nothing is available
 * (issue #117).
 */
function AlertImageContent({
  element,
  editor,
}: {
  element: CanvasElement;
  editor: UseCanvasEditorReturn;
}) {
  const storedAsset = element.bindings.assetId
    ? editor.assets.find((asset) => asset.id === element.bindings.assetId)
    : undefined;
  const resolved = resolveCanvasElementAsset(element, {
    storedAssetUrl: storedAsset?.previewUrl,
    storedAssetType: storedAsset?.assetType,
    eventVisualUrl: editor.previewAlert?.visualAssetUrl,
  });

  if (!resolved) {
    return (
      <span className="grid h-full w-full place-items-center border border-dashed border-line-strong p-2 text-[13px] text-muted">
        Event image
      </span>
    );
  }

  if (resolved.kind === 'video') {
    return (
      <CanvasVideo
        key={`${resolved.url}-${editor.previewAlert?.id ?? 'editing'}`}
        className="pointer-events-none h-full w-full object-contain"
        src={resolved.url}
        muted={!editor.previewAlert || (element.bindings.videoMuted ?? false)}
        volume={element.bindings.videoVolume ?? 100}
      />
    );
  }

  return (
    <img
      className="pointer-events-none h-full w-full object-contain"
      src={resolved.url}
      alt={element.name}
    />
  );
}

type ReactPointerEvent = React.PointerEvent<HTMLElement>;
