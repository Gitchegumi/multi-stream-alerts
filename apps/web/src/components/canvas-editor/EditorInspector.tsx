'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import type { UseCanvasEditorReturn } from './useCanvasEditor';
import { NumericField } from './NumericField';
import {
  EVENT_VARIABLES,
  applyCanvasTextColor,
  canvasRichTextToPlainText,
  plainTextToCanvasRichText,
  resolveAssetKind,
  updateCanvasRichText,
  type CanvasElement,
  type CanvasRichText,
  type CanvasSettings,
} from '@/lib/canvas-schema';
import {
  editorActionButtonClass,
  editorFieldClass,
  editorHintClass,
  editorInspectorGridClass,
  editorPlaceholderClass,
  editorSectionHeadingClass,
} from './editor-styles';

/**
 * Human-readable list of visual asset formats accepted for alert image
 * elements. Animated GIF/WebP and video (MP4/WebM) play automatically in the
 * preview and browser source (issue #117).
 */
const SUPPORTED_VISUAL_FORMATS = 'PNG, JPG, GIF, WebP, SVG, MP4, WebM';

// `none` lets an asset render without any editor-applied entrance animation so
// already-animated assets (GIF/APNG/animated WebP) play untouched (issue #122).
const IN_ANIMATIONS: Array<CanvasElement['animation']['in']> = ['none', 'fade', 'pop', 'slide-up'];
const OUT_ANIMATIONS: Array<CanvasElement['animation']['out']> = ['fade'];

function assetLabel(asset: {
  originalFilename: string | null;
  externalUrl: string | null;
  id: string;
}) {
  return asset.originalFilename ?? asset.externalUrl ?? asset.id;
}

function assetForElement(element: CanvasElement, assets: UseCanvasEditorReturn['assets']) {
  return element.bindings.assetId
    ? assets.find((asset) => asset.id === element.bindings.assetId)
    : null;
}

function PreviewAsset({
  asset,
  eventUrl,
  fallback,
  previewKey,
}: {
  asset: ReturnType<typeof assetForElement>;
  eventUrl?: string;
  fallback: string;
  previewKey?: string;
}) {
  const url = asset?.previewUrl ?? eventUrl;
  if (!url)
    return (
      <span className="grid h-full w-full place-items-center border border-dashed border-line-strong text-[13px] text-muted">
        {fallback}
      </span>
    );
  if (resolveAssetKind(asset?.assetType, url) === 'video') {
    return (
      <video
        className="pointer-events-none h-full w-full object-contain"
        key={previewKey ?? url}
        src={url}
        muted={!previewKey}
        loop
        playsInline
        autoPlay
      />
    );
  }
  return <img className="pointer-events-none h-full w-full object-contain" alt="" src={url} />;
}

export function EditorInspector({ editor }: { editor: UseCanvasEditorReturn }) {
  const selected = editor.selectedCanvas;
  const selectedElement = useMemo(
    () =>
      selected?.settings.elements.find((element) => element.id === editor.selectedElement) ?? null,
    [selected, editor.selectedElement],
  );

  if (!selected) {
    return (
      <aside className="min-w-0 overflow-auto border-l border-line bg-bg [grid-area:inspector]">
        <div className={editorPlaceholderClass}>No canvas selected</div>
      </aside>
    );
  }

  return (
    <aside className="min-w-0 overflow-auto border-l border-line bg-bg [grid-area:inspector]">
      {selectedElement ? (
        <ElementInspector editor={editor} element={selectedElement} />
      ) : (
        <CanvasInspector editor={editor} />
      )}
    </aside>
  );
}

function CanvasInspector({ editor }: { editor: UseCanvasEditorReturn }) {
  const selected = editor.selectedCanvas!;

  function handleAudioChange(event: ChangeEvent<HTMLSelectElement>) {
    const assetId = event.currentTarget.value || null;
    const asset = editor.audioAssets.find((item) => item.id === assetId);
    editor.patchCanvas(selected.id, {
      settings: {
        audioAssetId: assetId,
        audioAssetUrl: asset?.externalUrl ?? null,
      },
    });
  }

  function handleVolumeChange(event: ChangeEvent<HTMLInputElement>) {
    const volume = clamp(Number(event.currentTarget.value), 0, 100);
    editor.patchCanvas(selected.id, { settings: { volume } });
  }

  return (
    <div className="grid gap-3.5 p-3.5">
      <div className="grid gap-2.5 border-b border-line pb-3.5 last:border-b-0 last:pb-0">
        <h3 className="m-0 text-sm font-bold">Canvas settings</h3>
        <label className={editorFieldClass}>
          <span>Name</span>
          <input
            className="input"
            value={editor.draftName}
            onChange={(event) => editor.setDraftName(event.currentTarget.value)}
            onBlur={() => editor.commitName()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
        </label>
        <div className={editorInspectorGridClass}>
          <label className={editorFieldClass}>
            <span>Width</span>
            <input
              className="input"
              type="number"
              min={320}
              max={7680}
              value={editor.canvasSizeDraft.width}
              onChange={(event) =>
                editor.setCanvasSizeDraftAxis('width', event.currentTarget.value)
              }
              onBlur={() => editor.commitCanvasDimension('width')}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
          </label>
          <label className={editorFieldClass}>
            <span>Height</span>
            <input
              className="input"
              type="number"
              min={240}
              max={4320}
              value={editor.canvasSizeDraft.height}
              onChange={(event) =>
                editor.setCanvasSizeDraftAxis('height', event.currentTarget.value)
              }
              onBlur={() => editor.commitCanvasDimension('height')}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
          </label>
        </div>
      </div>

      <div className="grid gap-2.5 border-b border-line pb-3.5 last:border-b-0 last:pb-0">
        <label className={editorFieldClass}>
          <span>Background</span>
          <select
            className="select"
            value={selected.settings.background}
            onChange={(event) =>
              editor.patchCanvas(selected.id, {
                settings: { background: event.currentTarget.value as CanvasSettings['background'] },
              })
            }
          >
            <option value="transparent">Transparent</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>

      <div className="grid gap-2.5 border-b border-line pb-3.5 last:border-b-0 last:pb-0">
        <label className={editorFieldClass}>
          <span>Stored sound</span>
          <select
            className="select"
            value={selected.settings.audioAssetId ?? ''}
            onChange={handleAudioChange}
          >
            <option value="">Default / event audio</option>
            {editor.audioAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {assetLabel(asset)}
              </option>
            ))}
          </select>
        </label>
        <label className={editorFieldClass}>
          <span>Volume {selected.settings.volume}%</span>
          <input
            className="w-full accent-accent"
            type="range"
            min={0}
            max={100}
            value={selected.settings.volume}
            onChange={handleVolumeChange}
          />
        </label>
      </div>

      <div className="grid gap-2.5 border-b border-line pb-3.5 last:border-b-0 last:pb-0">
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={selected.isActive}
            onChange={() => editor.patchCanvas(selected.id, { isActive: !selected.isActive })}
          />
          Active
        </label>
      </div>

      <p className={editorHintClass}>Select an element to edit it</p>
    </div>
  );
}

function ElementInspector({
  editor,
  element,
}: {
  editor: UseCanvasEditorReturn;
  element: CanvasElement;
}) {
  const selected = editor.selectedCanvas!;
  const [renaming, setRenaming] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);

  function patch(patch: Partial<CanvasElement>) {
    editor.patchElement(element.id, patch);
  }

  function patchStyles(styles: CanvasElement['styles']) {
    editor.patchElementStyles(element.id, styles);
  }

  function patchBindings(bindings: CanvasElement['bindings']) {
    editor.patchElementBindings(element.id, bindings);
  }

  function handleRenameBlur(event: ChangeEvent<HTMLInputElement>) {
    const name = event.currentTarget.value.trim();
    if (name) patch({ name });
    setRenaming(false);
  }

  function handleRenameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      setRenaming(false);
    }
  }

  function handleImageAssetChange(event: ChangeEvent<HTMLSelectElement>) {
    const assetId = event.currentTarget.value;
    const asset = editor.assets.find((item) => item.id === assetId);
    patchBindings({
      assetRole: 'eventVisual',
      assetType:
        asset?.assetType === 'image' || asset?.assetType === 'video' ? asset.assetType : undefined,
      assetId: assetId || undefined,
      assetUrl: asset?.externalUrl ?? undefined,
    });
  }

  function handleAnimationInChange(value: CanvasElement['animation']['in']) {
    patch({ animation: { ...element.animation, in: value } });
  }

  function handleAnimationOutChange(value: CanvasElement['animation']['out']) {
    patch({ animation: { ...element.animation, out: value } });
  }

  const isText = element.type === 'text' || element.type === 'alert-message';
  const isImage = element.type === 'alert-image';
  const selectedAsset = isImage ? assetForElement(element, editor.assets) : null;
  const isVideo = selectedAsset?.assetType === 'video' || element.bindings.assetType === 'video';

  return (
    <div className="grid gap-3.5 p-3.5">
      <div className="grid gap-2.5 border-b border-line pb-3.5 last:border-b-0 last:pb-0">
        <div className="flex items-center justify-between gap-2.5">
          {renaming ? (
            <input
              ref={renameRef}
              className="input flex-1"
              defaultValue={element.name}
              onBlur={handleRenameBlur}
              onKeyDown={handleRenameKeyDown}
            />
          ) : (
            <button
              className="min-w-0 flex-1 cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap border-0 bg-transparent p-0 text-left text-sm font-bold text-text hover:text-accent"
              type="button"
              onClick={() => setRenaming(true)}
              title="Click to rename"
            >
              {element.name}
            </button>
          )}
          <div className="flex gap-1.5">
            <button
              className={editorActionButtonClass(element.hidden)}
              type="button"
              title={element.hidden ? 'Show' : 'Hide'}
              onClick={() => patch({ hidden: !element.hidden })}
            >
              {element.hidden ? 'Show' : 'Hide'}
            </button>
            <button
              className={editorActionButtonClass(element.locked)}
              type="button"
              title={element.locked ? 'Unlock' : 'Lock'}
              onClick={() => patch({ locked: !element.locked })}
            >
              {element.locked ? 'Unlock' : 'Lock'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-2.5 border-b border-line pb-3.5 last:border-b-0 last:pb-0">
        <h4 className={editorSectionHeadingClass}>Position &amp; size</h4>
        <div className={editorInspectorGridClass}>
          <NumericField
            label="X"
            value={element.x}
            onChange={(value) => patch({ x: value })}
            min={0}
            max={selected.settings.width}
          />
          <NumericField
            label="Y"
            value={element.y}
            onChange={(value) => patch({ y: value })}
            min={0}
            max={selected.settings.height}
          />
          <NumericField
            label="W"
            value={element.width}
            onChange={(value) => patch({ width: value })}
            min={1}
            max={selected.settings.width}
          />
          <NumericField
            label="H"
            value={element.height}
            onChange={(value) => patch({ height: value })}
            min={1}
            max={selected.settings.height}
          />
          <NumericField
            label="°"
            value={element.rotation}
            onChange={(value) => patch({ rotation: value })}
            min={-360}
            max={360}
          />
          <NumericField
            label="Opacity"
            value={element.opacity}
            onChange={(value) => patch({ opacity: value })}
            min={0}
            max={1}
            step={0.1}
          />
        </div>
        <div className="flex gap-1.5">
          <button
            className="button-secondary flex-1 px-1 py-1.5 text-[11px]"
            type="button"
            title="Align left"
            onClick={() => patch({ x: 0 })}
          >
            Left
          </button>
          <button
            className="button-secondary flex-1 px-1 py-1.5 text-[11px]"
            type="button"
            title="Center horizontally"
            onClick={() => editor.centerElement(element.id, 'horizontal')}
          >
            Center
          </button>
          <button
            className="button-secondary flex-1 px-1 py-1.5 text-[11px]"
            type="button"
            title="Align right"
            onClick={() => patch({ x: Math.max(0, selected.settings.width - element.width) })}
          >
            Right
          </button>
          <button
            className="button-secondary flex-1 px-1 py-1.5 text-[11px]"
            type="button"
            title="Center vertically"
            onClick={() => editor.centerElement(element.id, 'vertical')}
          >
            Middle
          </button>
        </div>
      </div>

      {isText || isImage ? (
        <div className="grid gap-2.5 border-b border-line pb-3.5 last:border-b-0 last:pb-0">
          {isText ? (
            <TemplateField element={element} onChange={(richText) => patchBindings({ richText })} />
          ) : (
            <>
              <div className="grid min-h-[120px] place-items-center overflow-hidden rounded-md border border-line bg-panel">
                <PreviewAsset
                  asset={assetForElement(element, editor.assets)}
                  fallback="Event image"
                />
              </div>
              <label className={editorFieldClass}>
                <span>Stored asset</span>
                <select
                  className="select"
                  value={element.bindings.assetId ?? ''}
                  onChange={handleImageAssetChange}
                >
                  <option value="">Use event image/video</option>
                  {editor.imageAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {assetLabel(asset)}
                    </option>
                  ))}
                </select>
              </label>
              <p className={editorHintClass}>
                Supported: {SUPPORTED_VISUAL_FORMATS}. Animated GIF/WebP and video play
                automatically.
              </p>
              {isVideo ? (
                <div className="grid gap-2.5 rounded-md border border-line bg-panel p-2.5">
                  <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={element.bindings.videoMuted ?? false}
                      onChange={(event) =>
                        patchBindings({ videoMuted: event.currentTarget.checked })
                      }
                    />
                    Mute video audio
                  </label>
                  <label className={editorFieldClass}>
                    <span>Video volume {element.bindings.videoVolume ?? 100}%</span>
                    <input
                      className="w-full accent-accent"
                      type="range"
                      min={0}
                      max={100}
                      disabled={element.bindings.videoMuted ?? false}
                      value={element.bindings.videoVolume ?? 100}
                      onChange={(event) =>
                        patchBindings({
                          videoVolume: clamp(Number(event.currentTarget.value), 0, 100),
                        })
                      }
                    />
                  </label>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {isText ? (
        <div className="grid gap-2.5 border-b border-line pb-3.5 last:border-b-0 last:pb-0">
          <h4 className={editorSectionHeadingClass}>Text</h4>
          <label className={editorFieldClass}>
            <span>Font family</span>
            <input
              className="input"
              value={element.styles.fontFamily ?? ''}
              onChange={(event) => patchStyles({ fontFamily: event.currentTarget.value })}
            />
          </label>
          <div className={editorInspectorGridClass}>
            <NumericField
              label="Size (px)"
              value={element.styles.fontSize ?? 32}
              onChange={(value) => patchStyles({ fontSize: value })}
              min={8}
              max={300}
            />
            <label className="grid grid-cols-[1fr_28px] items-center gap-2 text-xs text-muted [&>span:first-child]:font-semibold">
              <span>Default color</span>
              <input
                className="h-7 w-7 cursor-pointer rounded-sm border border-line bg-transparent p-0"
                type="color"
                value={element.styles.color ?? '#f0f0f0'}
                onChange={(event) => patchStyles({ color: event.currentTarget.value })}
              />
            </label>
          </div>
          <div className={editorInspectorGridClass}>
            <label className="grid grid-cols-[1fr_28px] items-center gap-2 text-xs text-muted [&>span:first-child]:font-semibold">
              <span>Stroke</span>
              <input
                className="h-7 w-7 cursor-pointer rounded-sm border border-line bg-transparent p-0"
                type="color"
                value={element.styles.textStrokeColor ?? '#000000'}
                onChange={(event) =>
                  patchStyles({
                    textStrokeColor: event.currentTarget.value,
                    textStrokeWidth: element.styles.textStrokeWidth ?? 2,
                  })
                }
              />
            </label>
            <NumericField
              label="Px"
              value={element.styles.textStrokeWidth ?? 0}
              onChange={(value) =>
                patchStyles({
                  textStrokeWidth: value,
                  textStrokeColor: element.styles.textStrokeColor ?? '#000000',
                })
              }
              min={0}
              max={24}
            />
          </div>
          <button
            className={editorActionButtonClass(element.styles.fontWeight === '700')}
            type="button"
            onClick={() =>
              patchStyles({ fontWeight: element.styles.fontWeight === '700' ? '400' : '700' })
            }
          >
            Bold
          </button>
        </div>
      ) : null}

      <div className="grid gap-2.5 border-b border-line pb-3.5 last:border-b-0 last:pb-0">
        <h4 className={editorSectionHeadingClass}>Animation</h4>
        <div className={editorInspectorGridClass}>
          <label className={editorFieldClass}>
            <span>In</span>
            <select
              className="select"
              value={element.animation.in ?? 'fade'}
              onChange={(event) =>
                handleAnimationInChange(
                  event.currentTarget.value as CanvasElement['animation']['in'],
                )
              }
            >
              {IN_ANIMATIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className={editorFieldClass}>
            <span>Out</span>
            <select
              className="select"
              value={element.animation.out ?? 'fade'}
              onChange={(event) =>
                handleAnimationOutChange(
                  event.currentTarget.value as CanvasElement['animation']['out'],
                )
              }
            >
              {OUT_ANIMATIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        <NumericField
          label="Duration (ms)"
          value={element.animation.durationMs ?? 6500}
          onChange={(value) => patch({ animation: { ...element.animation, durationMs: value } })}
          min={500}
          max={60000}
          step={100}
        />
      </div>
    </div>
  );
}

function TemplateField({
  element,
  onChange,
}: {
  element: CanvasElement;
  onChange: (value: CanvasRichText) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showTokens, setShowTokens] = useState(false);
  const [tokenIndex, setTokenIndex] = useState(0);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [selectionColor, setSelectionColor] = useState(element.styles.color ?? '#f0f0f0');
  const content = element.bindings.richText ?? plainTextToCanvasRichText('');
  const value = canvasRichTextToPlainText(content);

  function rememberSelection(textarea: HTMLTextAreaElement) {
    setSelection({
      start: textarea.selectionStart ?? 0,
      end: textarea.selectionEnd ?? textarea.selectionStart ?? 0,
    });
  }

  function insertToken(token: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(
        updateCanvasRichText(content, insertTokenAt(value, token, value.length, value.length)),
      );
      return;
    }
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? start;
    onChange(updateCanvasRichText(content, insertTokenAt(value, token, start, end)));
    setShowTokens(false);
    window.setTimeout(() => {
      const position = start + token.length;
      textarea.focus();
      textarea.setSelectionRange(position, position);
    }, 0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!showTokens) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setTokenIndex((index) => (index + 1) % EVENT_VARIABLES.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setTokenIndex((index) => (index - 1 + EVENT_VARIABLES.length) % EVENT_VARIABLES.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      insertToken(EVENT_VARIABLES[tokenIndex] ?? '');
    } else if (event.key === 'Escape') {
      setShowTokens(false);
    }
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const text = event.currentTarget.value;
    onChange(updateCanvasRichText(content, text));
    const cursor = event.currentTarget.selectionStart ?? text.length;
    setSelection({ start: cursor, end: event.currentTarget.selectionEnd ?? cursor });
    const charBefore = text[cursor - 1];
    if (charBefore === '/') {
      setShowTokens(true);
      setTokenIndex(0);
    } else if (showTokens && charBefore !== undefined && !/[a-zA-Z0-9_{}]/i.test(charBefore)) {
      setShowTokens(false);
    }
  }

  function handleSelectionColor(event: ChangeEvent<HTMLInputElement>) {
    const color = event.currentTarget.value;
    setSelectionColor(color);
    if (selection.start === selection.end) return;
    onChange(applyCanvasTextColor(content, selection.start, selection.end, color));
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(selection.start, selection.end);
    });
  }

  return (
    <div className="relative grid gap-1.5">
      <label className={editorFieldClass}>
        <span>Content</span>
        <textarea
          ref={textareaRef}
          className="input resize-y"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={(event) => rememberSelection(event.currentTarget)}
          rows={4}
          placeholder={CONTENT_PLACEHOLDER}
        />
      </label>
      <label className="flex items-center justify-between gap-3 text-xs text-muted">
        <span>Selection color</span>
        <input
          aria-label="Selection color"
          className="h-7 w-7 cursor-pointer rounded-sm border border-line bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-40"
          type="color"
          value={selectionColor}
          disabled={selection.start === selection.end}
          onChange={handleSelectionColor}
        />
      </label>
      {showTokens ? (
        <div
          className="absolute left-2 top-[calc(26px+3.5em)] z-[60] grid min-w-[140px] overflow-hidden rounded-lg border border-line bg-panel shadow-brand"
          role="listbox"
        >
          {EVENT_VARIABLES.map((token, index) => (
            <button
              key={token}
              className={`cursor-pointer border-0 bg-transparent px-2.5 py-[7px] text-left font-mono text-xs ${
                index === tokenIndex
                  ? 'bg-surface-hover text-accent'
                  : 'text-text hover:bg-surface-hover hover:text-accent'
              }`}
              type="button"
              role="option"
              aria-selected={index === tokenIndex}
              onClick={() => insertToken(token)}
            >
              {token}
            </button>
          ))}
        </div>
      ) : null}
      <p className={editorHintClass}>Type / to insert event data. Select text to apply a color.</p>
    </div>
  );
}

/**
 * Insert a token into a template string at the given selection range.
 * Exported for unit testing (issue #109 regression coverage).
 */
export function insertTokenAt(template: string, token: string, start: number, end: number): string {
  return template.slice(0, start) + token + template.slice(end);
}

/**
 * Placeholder text for the Content textarea. The browser only shows this
 * when the value is empty — no manual overlay needed (issue #109).
 */
export const CONTENT_PLACEHOLDER =
  'Enter alert text. Type / to insert event data like {{viewerName}}.';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
