'use client';

import { useCallback } from 'react';
import { renderCanvasText, resolveCanvasElementAsset } from '@/lib/canvas-schema';
import { buildAnimationStyle } from '@/lib/canvas-animation';
import type { UseCanvasEditorReturn } from './useCanvasEditor';
import type { CanvasElement } from '@/lib/canvas-schema';

export function EditorStage({ editor }: { editor: UseCanvasEditorReturn }) {
  const selected = editor.selectedCanvas;

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
    <section className="canvas-editor-stage" tabIndex={0} onKeyDown={handleKeyDown}>
      <div
        ref={editor.stageRef}
        className={`canvas-editor-stage-canvas canvas-editor-stage-canvas-${selected?.settings.background ?? 'transparent'}`}
        style={{
          aspectRatio: selected
            ? `${selected.settings.width} / ${selected.settings.height}`
            : '16 / 9',
          transform: `scale(${editor.zoom / 100})`,
        }}
        onClick={handleStageClick}
      >
        {selected ? (
          <>
            {editor.snapGuides.vertical ? (
              <span className="canvas-editor-snap-guide canvas-editor-snap-guide-v" />
            ) : null}
            {editor.snapGuides.horizontal ? (
              <span className="canvas-editor-snap-guide canvas-editor-snap-guide-h" />
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

      {selected ? (
        <div className="canvas-editor-stage-toolbar">
          <button
            className="canvas-editor-stage-tool"
            type="button"
            aria-label="Zoom out"
            onClick={() => editor.setZoom(Math.max(25, editor.zoom - 10))}
          >
            −
          </button>
          <span className="canvas-editor-stage-zoom">{editor.zoom}%</span>
          <button
            className="canvas-editor-stage-tool"
            type="button"
            aria-label="Zoom in"
            onClick={() => editor.setZoom(Math.min(200, editor.zoom + 10))}
          >
            +
          </button>
          <span className="canvas-editor-stage-toolbar-divider" />
          <button
            className="canvas-editor-stage-tool"
            type="button"
            onClick={() => editor.setZoom(100)}
          >
            Fit
          </button>
          <button
            className={`canvas-editor-stage-tool canvas-editor-stage-tool-snap${editor.snapEnabled ? ' canvas-editor-stage-tool-active' : ''}`}
            type="button"
            aria-pressed={editor.snapEnabled}
            onClick={() => editor.toggleSnap()}
          >
            Snap
          </button>
          <button
            className={`canvas-editor-stage-tool canvas-editor-stage-tool-bg${selected.settings.background === 'dark' ? ' canvas-editor-stage-tool-active' : ''}`}
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
  const settings = editor.selectedCanvas!.settings;

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

  const left = (element.x / settings.width) * 100;
  const top = (element.y / settings.height) * 100;
  const width = (element.width / settings.width) * 100;
  const height = (element.height / settings.height) * 100;

  // Build animation style only during preview playback. The key remount
  // (above) ensures the animation replays on each test click.
  const animStyle =
    editor.previewAlert && !editor.previewExiting
      ? buildAnimationStyle(element, 'in')
      : editor.previewAlert && editor.previewExiting
        ? buildAnimationStyle(element, 'out')
        : null;

  return (
    <div
      className={`canvas-editor-element${selected ? ' canvas-editor-element-selected' : ''}${element.locked ? ' canvas-editor-element-locked' : ''} canvas-editor-element-type-${element.type}`}
      style={{
        left: `${left}%`,
        top: `${top}%`,
        width: `${width}%`,
        height: `${height}%`,
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
        className="canvas-editor-element-anim"
        style={{
          opacity: element.opacity,
          background: element.styles.backgroundColor,
          borderRadius: element.styles.borderRadius,
          color: element.styles.color,
          fontFamily: element.styles.fontFamily,
          fontSize: Math.max(10, (element.styles.fontSize ?? 32) / 2.8),
          fontWeight: element.styles.fontWeight,
          textShadow: element.styles.textShadow,
          WebkitTextStroke:
            element.styles.textStrokeWidth && element.styles.textStrokeColor
              ? `${Math.max(0, element.styles.textStrokeWidth / 2.8)}px ${element.styles.textStrokeColor}`
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
          <span className="canvas-editor-element-badge canvas-editor-element-name">
            {element.name}
          </span>
        ) : null}

        <div className="canvas-editor-element-content">
          {element.type === 'alert-image' ? (
            <AlertImageContent element={element} editor={editor} />
          ) : element.type === 'shape' ? null : (
            <span className="canvas-editor-element-text">
              {renderCanvasText(element.bindings.textTemplate ?? element.name, editor.previewAlert)}
            </span>
          )}
        </div>
      </div>
      {selected ? (
        <>
          <span className="canvas-editor-element-badge canvas-editor-element-dims">
            {element.width} × {element.height}
          </span>
          {(['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'] as const).map((handle) => (
            <span
              key={handle}
              className={`canvas-editor-handle canvas-editor-handle-${handle}`}
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
    return <span className="canvas-editor-element-placeholder">Event image</span>;
  }

  if (resolved.kind === 'video') {
    return (
      <video
        className="canvas-editor-element-image"
        src={resolved.url}
        autoPlay
        loop
        muted
        playsInline
      />
    );
  }

  return <img className="canvas-editor-element-image" src={resolved.url} alt={element.name} />;
}

type ReactPointerEvent = React.PointerEvent<HTMLElement>;
