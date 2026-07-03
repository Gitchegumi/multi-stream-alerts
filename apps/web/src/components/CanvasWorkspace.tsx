'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { AlertEvent } from '@multi-stream-alerts/shared';
import {
  createCanvasElement,
  EVENT_VARIABLES,
  normalizeCanvasSettings,
  renderCanvasText,
  serializeCanvasSettings,
  type CanvasElement,
  type CanvasElementType,
  type CanvasSettings,
} from '@/lib/canvas-schema';

type CanvasProfile = {
  id: string;
  name: string;
  slug: string;
  displayKey: string;
  isActive: boolean;
  updatedAt: string;
  url: string;
  settings: CanvasSettings;
};

type AlertConfig = {
  id: string;
  enabled: boolean;
  layoutId: string | null;
  configJson: Record<string, unknown> | null;
  alertEventType: {
    platform: string;
    eventKey: string;
    displayName: string;
  };
};

type LinkedAccountInfo = {
  id: string;
  platform: 'twitch' | 'youtube';
  platformAccountId: string;
  platformAccountName: string | null;
  isActive: boolean;
  isPrimary: boolean;
};

type WorkspaceAsset = {
  id: string;
  assetType: 'image' | 'video' | 'audio';
  originalFilename: string | null;
  externalUrl: string | null;
  previewUrl: string;
};

type ResizeMode = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

type ElementStart = Pick<CanvasElement, 'x' | 'y' | 'width' | 'height'> & {
  clientX: number;
  clientY: number;
};

export function CanvasWorkspace({
  channelId,
  channelSlug,
  initialCanvases,
  alertConfigs,
  assets,
  linkedAccounts,
}: {
  channelId: string;
  channelSlug: string;
  initialCanvases: CanvasProfile[];
  alertConfigs: AlertConfig[];
  assets: WorkspaceAsset[];
  linkedAccounts: LinkedAccountInfo[];
}) {
  const [canvases, setCanvases] = useState(initialCanvases);
  const [configs, setConfigs] = useState(alertConfigs);
  const [selectedSlug, setSelectedSlug] = useState(initialCanvases[0]?.slug ?? '');
  const [draftName, setDraftName] = useState(initialCanvases[0]?.name ?? '');
  const [canvasSizeDraft, setCanvasSizeDraft] = useState({
    width: String(initialCanvases[0]?.settings.width ?? 1920),
    height: String(initialCanvases[0]?.settings.height ?? 1080),
  });
  const [selectedElementId, setSelectedElementId] = useState(
    initialCanvases[0]?.settings.elements[0]?.id ?? '',
  );
  const [result, setResult] = useState<string | null>(null);
  const [previewAlert, setPreviewAlert] = useState<AlertEvent | null>(null);
  const [snapGuides, setSnapGuides] = useState({ horizontal: false, vertical: false });
  const [isPending, startTransition] = useTransition();
  const canvasStageRef = useRef<HTMLDivElement | null>(null);

  const selected = canvases.find((canvas) => canvas.slug === selectedSlug) ?? canvases[0];
  const selectedElement =
    selected?.settings.elements.find((element) => element.id === selectedElementId) ?? null;
  const assignedKeys = new Set(selected?.settings.alertEventKeys ?? []);
  const imageAssets = assets.filter(
    (asset) => asset.assetType === 'image' || asset.assetType === 'video',
  );
  const audioAssets = assets.filter((asset) => asset.assetType === 'audio');
  const groupedConfigs = useMemo(() => {
    return configs.reduce<Record<string, AlertConfig[]>>((groups, config) => {
      const platform = config.alertEventType.platform;
      groups[platform] = groups[platform] ?? [];
      groups[platform]?.push(config);
      return groups;
    }, {});
  }, [configs]);

  useEffect(() => {
    if (!selected) return;
    setCanvasSizeDraft({
      width: String(selected.settings.width),
      height: String(selected.settings.height),
    });
  }, [selected?.id, selected?.settings.width, selected?.settings.height]);

  function selectCanvas(slug: string) {
    const next = canvases.find((canvas) => canvas.slug === slug);
    setSelectedSlug(slug);
    setDraftName(next?.name ?? '');
    setCanvasSizeDraft({
      width: String(next?.settings.width ?? 1920),
      height: String(next?.settings.height ?? 1080),
    });
    setSelectedElementId(next?.settings.elements[0]?.id ?? '');
    setResult(null);
  }

  function commitCanvasDimension(axis: 'width' | 'height') {
    if (!selected) return;
    const min = axis === 'width' ? 320 : 240;
    const max = axis === 'width' ? 7680 : 4320;
    const nextValue = Number(canvasSizeDraft[axis]);
    if (!Number.isFinite(nextValue)) {
      setCanvasSizeDraft((current) => ({ ...current, [axis]: String(selected.settings[axis]) }));
      return;
    }

    const rounded = Math.max(min, Math.min(max, Math.round(nextValue)));
    setCanvasSizeDraft((current) => ({ ...current, [axis]: String(rounded) }));
    if (rounded !== selected.settings[axis]) {
      patchCanvas(selected.slug, { settings: { [axis]: rounded } });
    }
  }

  function createCanvas(duplicateFromSlug?: string) {
    const source = duplicateFromSlug
      ? canvases.find((canvas) => canvas.slug === duplicateFromSlug)
      : undefined;
    const name = source ? `${source.name} copy` : 'New canvas';
    setResult(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelSlug)}/overlay-profiles`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, duplicateFromSlug }),
        },
      );
      if (!response.ok) {
        setResult('Could not create canvas.');
        return;
      }
      const body = (await response.json()) as { profile: RawProfile };
      const canvas = normalizeProfile(body.profile, channelSlug);
      setCanvases((current) => [...current, canvas]);
      setSelectedSlug(canvas.slug);
      setDraftName(canvas.name);
      setSelectedElementId(canvas.settings.elements[0]?.id ?? '');
      setResult(source ? 'Canvas duplicated.' : 'Canvas created.');
    });
  }

  function patchCanvas(
    slug: string,
    patch: Omit<Partial<CanvasProfile>, 'settings'> & { settings?: Partial<CanvasSettings> },
  ) {
    const currentCanvas = canvases.find((canvas) => canvas.slug === slug);
    if (patch.settings && !currentCanvas) return;
    setResult(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelSlug)}/overlay-profiles/${encodeURIComponent(slug)}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: patch.name,
            slug: patch.slug,
            isActive: patch.isActive,
            settings: patch.settings
              ? serializeCanvasSettings({ ...currentCanvas!.settings, ...patch.settings })
              : undefined,
          }),
        },
      );
      if (!response.ok) {
        setResult('Could not update canvas.');
        return;
      }
      const body = (await response.json()) as { profile: RawProfile };
      const canvas = normalizeProfile(body.profile, channelSlug);
      setCanvases((current) => current.map((item) => (item.id === canvas.id ? canvas : item)));
      setSelectedSlug(canvas.slug);
      setDraftName(canvas.name);
      setSelectedElementId((current) =>
        canvas.settings.elements.some((element) => element.id === current)
          ? current
          : (canvas.settings.elements[0]?.id ?? ''),
      );
      setResult('Canvas updated.');
    });
  }

  function deleteCanvas(slug: string) {
    setResult(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelSlug)}/overlay-profiles/${encodeURIComponent(slug)}`,
        { method: 'DELETE' },
      );
      if (!response.ok) {
        setResult('Could not delete canvas.');
        return;
      }
      setCanvases((current) => {
        const next = current.filter((canvas) => canvas.slug !== slug);
        const replacement = next[0]?.slug ?? '';
        setSelectedSlug(replacement);
        setDraftName(next[0]?.name ?? '');
        return next;
      });
      setResult('Canvas deleted.');
    });
  }

  async function copyUrl() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.url);
      setResult('Canvas URL copied.');
    } catch {
      setResult('Could not copy the URL.');
    }
  }

  function toggleAlert(config: AlertConfig, checked: boolean) {
    if (!selected) return;
    const nextKeys = applyAlertAssignment(
      selected.settings.alertEventKeys,
      config.alertEventType.eventKey,
      checked,
    );
    patchCanvas(selected.slug, { settings: { alertEventKeys: nextKeys } });
    if (checked && !config.enabled) {
      enableAlertConfig(config);
    }
  }

  function addElement(type: CanvasElementType) {
    if (!selected) return;
    const count = selected.settings.elements.filter((element) => element.type === type).length + 1;
    const element = createCanvasElement(type, count, selected.settings.elements.length + 1);
    patchCanvas(selected.slug, {
      settings: { elements: [...selected.settings.elements, element] },
    });
    setSelectedElementId(element.id);
  }

  function patchElement(elementId: string, patch: Partial<CanvasElement>) {
    if (!selected) return;
    patchCanvas(selected.slug, {
      settings: {
        elements: selected.settings.elements.map((element) =>
          element.id === elementId ? { ...element, ...patch } : element,
        ),
      },
    });
  }

  function patchElementStyles(element: CanvasElement, styles: CanvasElement['styles']) {
    patchElement(element.id, { styles: { ...element.styles, ...styles } });
  }

  function patchElementBindings(element: CanvasElement, bindings: CanvasElement['bindings']) {
    patchElement(element.id, { bindings: { ...element.bindings, ...bindings } });
  }

  function updateCanvasElements(elements: CanvasElement[]) {
    if (!selected) return;
    setCanvases((current) =>
      current.map((canvas) =>
        canvas.id === selected.id
          ? {
              ...canvas,
              settings: {
                ...canvas.settings,
                elements,
              },
            }
          : canvas,
      ),
    );
  }

  function centerElement(element: CanvasElement, axis: 'horizontal' | 'vertical' | 'both') {
    if (!selected) return;
    patchElement(element.id, {
      x:
        axis === 'horizontal' || axis === 'both'
          ? Math.round((selected.settings.width - element.width) / 2)
          : element.x,
      y:
        axis === 'vertical' || axis === 'both'
          ? Math.round((selected.settings.height - element.height) / 2)
          : element.y,
    });
  }

  function startElementPointer(
    event: ReactPointerEvent<HTMLElement>,
    element: CanvasElement,
    mode: ResizeMode | 'move',
  ) {
    if (!selected || element.locked) return;
    const activeCanvas = selected;
    event.preventDefault();
    event.stopPropagation();
    setSelectedElementId(element.id);
    const stage = canvasStageRef.current;
    if (!stage) return;

    const stageRect = stage.getBoundingClientRect();
    const scaleX = activeCanvas.settings.width / stageRect.width;
    const scaleY = activeCanvas.settings.height / stageRect.height;
    const start = {
      clientX: event.clientX,
      clientY: event.clientY,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    };
    let latestElements = activeCanvas.settings.elements;
    let moved = false;

    function move(pointerEvent: PointerEvent) {
      moved = true;
      const dx = (pointerEvent.clientX - start.clientX) * scaleX;
      const dy = (pointerEvent.clientY - start.clientY) * scaleY;
      const transform = transformElement(start, mode, dx, dy, activeCanvas.settings);
      latestElements = activeCanvas.settings.elements.map((item) =>
        item.id === element.id ? { ...item, ...transform.element } : item,
      );
      setSnapGuides(transform.guides);
      updateCanvasElements(latestElements);
    }

    function stop() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      setSnapGuides({ horizontal: false, vertical: false });
      if (moved) {
        patchCanvas(activeCanvas.slug, { settings: { elements: latestElements } });
      }
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  function deleteElement(elementId: string) {
    if (!selected || selected.settings.elements.length <= 1) return;
    const elements = selected.settings.elements.filter((element) => element.id !== elementId);
    patchCanvas(selected.slug, { settings: { elements } });
    setSelectedElementId(elements[0]?.id ?? '');
  }

  function enableAlertConfig(config: AlertConfig) {
    startTransition(async () => {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelSlug)}/alert-configs/${encodeURIComponent(
          config.id,
        )}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: true }),
        },
      );
      if (!response.ok) {
        setResult('Canvas assignment saved, but the alert type could not be enabled.');
        return;
      }
      const body = (await response.json()) as { config: AlertConfig };
      setConfigs((current) => current.map((item) => (item.id === config.id ? body.config : item)));
    });
  }

  function saveAccountTargeting(config: AlertConfig, selectedAccountIds: string[]) {
    startTransition(async () => {
      const configJson = (config.configJson ?? {}) as Record<string, unknown>;
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelSlug)}/alert-configs/${encodeURIComponent(
          config.id,
        )}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            configJson: {
              ...configJson,
              selectedLinkedAccountIds: selectedAccountIds,
            },
          }),
        },
      );
      if (!response.ok) {
        setResult('Could not save account targeting.');
        return;
      }
      const body = (await response.json()) as { config: AlertConfig };
      setConfigs((current) => current.map((item) => (item.id === config.id ? body.config : item)));
    });
  }

  function toggleAccountSelection(config: AlertConfig, accountId: string, checked: boolean) {
    const configJson = (config.configJson ?? {}) as Record<string, unknown>;
    const currentIds = Array.isArray(configJson.selectedLinkedAccountIds)
      ? (configJson.selectedLinkedAccountIds as string[])
      : [];
    const nextIds = checked
      ? [...new Set([...currentIds, accountId])]
      : currentIds.filter((id) => id !== accountId);
    saveAccountTargeting(config, nextIds);
  }

  function testAlert(eventKey = 'manual.test') {
    if (!selected) return;
    const preview: AlertEvent = {
      id: `preview-${Date.now()}`,
      channelId,
      platform:
        eventKey.split('.')[0] === eventKey
          ? 'manual'
          : (eventKey.split('.')[0] as AlertEvent['platform']),
      type: 'test',
      eventKey,
      displayName: 'Preview viewer',
      message: `Canvas preview for ${selected.name}.`,
      rawEventId: `preview-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setPreviewAlert(preview);
    window.setTimeout(() => setPreviewAlert(null), selected.settings.defaultDurationMs);
    startTransition(async () => {
      const response = await fetch('/api/test-alert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          channelId,
          eventKey,
          message: `Canvas preview for ${selected.name}.`,
          isPublic: true,
        }),
      });
      setResult(
        response.ok
          ? 'Test alert sent and previewed.'
          : 'Local preview shown, but the alert was not sent.',
      );
    });
  }

  if (!selected) {
    return (
      <section className="panel">
        <button
          className="button"
          type="button"
          disabled={isPending}
          onClick={() => createCanvas()}
        >
          Create canvas
        </button>
      </section>
    );
  }

  return (
    <div className="canvas-workspace">
      <aside className="canvas-panel canvas-list-panel">
        <div className="canvas-panel-header">
          <h2>Canvases</h2>
          <button
            className="button"
            type="button"
            disabled={isPending}
            onClick={() => createCanvas()}
          >
            Create
          </button>
        </div>
        <div className="canvas-list">
          {canvases.map((canvas) => (
            <button
              className={`canvas-list-item${canvas.slug === selected.slug ? ' canvas-list-item-active' : ''}`}
              key={canvas.id}
              type="button"
              onClick={() => selectCanvas(canvas.slug)}
            >
              <strong>{canvas.name}</strong>
              <span>
                {canvas.settings.width}x{canvas.settings.height}
              </span>
              <span>
                {canvas.isActive ? 'Active' : 'Inactive'} / {formatCanvasDate(canvas.updatedAt)}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <main className="canvas-main">
        {result ? <p className="muted">{result}</p> : null}
        <section className="canvas-url-bar">
          <div>
            <span className="muted small">Browser-source URL</span>
            <div className="url-item">{selected.url}</div>
          </div>
          <button className="button-secondary" type="button" onClick={copyUrl}>
            Copy URL
          </button>
        </section>

        <section className="canvas-preview-shell">
          <div className="canvas-stage-scroll">
            <div
              className={`canvas-design-stage canvas-preview-${selected.settings.background}`}
              ref={canvasStageRef}
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) {
                  setSelectedElementId('');
                }
              }}
              style={{
                aspectRatio: `${selected.settings.width} / ${selected.settings.height}`,
                width: 'min(100%, 960px)',
              }}
            >
              {snapGuides.vertical ? (
                <span className="canvas-snap-guide canvas-snap-guide-v" />
              ) : null}
              {snapGuides.horizontal ? (
                <span className="canvas-snap-guide canvas-snap-guide-h" />
              ) : null}
              {selected.settings.elements
                .filter((element) => !element.hidden)
                .sort((a, b) => a.zIndex - b.zIndex)
                .map((element) => (
                  <button
                    className={`canvas-design-element${
                      element.id === selectedElement?.id ? ' canvas-design-element-selected' : ''
                    } canvas-design-element-${element.type}`}
                    key={element.id}
                    type="button"
                    onClick={() => setSelectedElementId(element.id)}
                    onPointerDown={(event) => startElementPointer(event, element, 'move')}
                    style={{
                      left: `${(element.x / selected.settings.width) * 100}%`,
                      top: `${(element.y / selected.settings.height) * 100}%`,
                      width: `${(element.width / selected.settings.width) * 100}%`,
                      height: `${(element.height / selected.settings.height) * 100}%`,
                      zIndex: element.zIndex,
                      opacity: element.opacity,
                      transform: `rotate(${element.rotation}deg)`,
                      color: element.styles.color,
                      background: element.styles.backgroundColor,
                      borderRadius: element.styles.borderRadius,
                      fontFamily: element.styles.fontFamily,
                      fontSize: Math.max(10, (element.styles.fontSize ?? 32) / 2.8),
                      fontWeight: element.styles.fontWeight,
                      textShadow: element.styles.textShadow,
                      WebkitTextStroke:
                        element.styles.textStrokeWidth && element.styles.textStrokeColor
                          ? `${Math.max(0, element.styles.textStrokeWidth / 2.8)}px ${
                              element.styles.textStrokeColor
                            }`
                          : undefined,
                    }}
                  >
                    {element.type === 'alert-image' ? (
                      <PreviewAsset
                        asset={assetForElement(element, assets)}
                        eventUrl={previewAlert?.visualAssetUrl}
                        fallback={previewAlert ? 'Event image' : 'Event image'}
                        previewKey={previewAlert?.id}
                      />
                    ) : element.type === 'shape' ? null : (
                      renderCanvasText(element.bindings.textTemplate ?? element.name, previewAlert)
                    )}
                    {element.id === selectedElement?.id && !element.locked
                      ? (['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'] as const).map((handle) => (
                          <span
                            aria-label={`Resize ${handle}`}
                            className={`canvas-resize-handle canvas-resize-handle-${handle}`}
                            key={handle}
                            role="presentation"
                            onPointerDown={(event) => startElementPointer(event, element, handle)}
                          />
                        ))
                      : null}
                  </button>
                ))}
            </div>
          </div>
          <details className="runtime-preview-toggle">
            <summary>OBS browser-source preview</summary>
            <div
              className={`canvas-preview canvas-preview-${selected.settings.background}`}
              style={{ aspectRatio: `${selected.settings.width} / ${selected.settings.height}` }}
            >
              <iframe
                allow="autoplay"
                title={`${selected.name} runtime preview`}
                src={selected.url}
              />
            </div>
          </details>
        </section>

        <section className="canvas-settings-grid">
          <label className="field">
            <span>Name</span>
            <input
              className="input"
              value={draftName}
              onChange={(event) => setDraftName(event.currentTarget.value)}
              onBlur={(event) => {
                const name = event.currentTarget.value.trim();
                if (name && name !== selected.name)
                  patchCanvas(selected.slug, { name, slug: name });
              }}
            />
          </label>
          <label className="field">
            <span>Width</span>
            <input
              className="input"
              type="number"
              min={320}
              max={7680}
              value={canvasSizeDraft.width}
              onBlur={() => commitCanvasDimension('width')}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setCanvasSizeDraft((current) => ({
                  ...current,
                  width: value,
                }));
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                }
              }}
            />
          </label>
          <label className="field">
            <span>Height</span>
            <input
              className="input"
              type="number"
              min={240}
              max={4320}
              value={canvasSizeDraft.height}
              onBlur={() => commitCanvasDimension('height')}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setCanvasSizeDraft((current) => ({
                  ...current,
                  height: value,
                }));
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                }
              }}
            />
          </label>
          <label className="field">
            <span>Background</span>
            <select
              className="select"
              value={selected.settings.background}
              onChange={(event) =>
                patchCanvas(selected.slug, {
                  settings: {
                    background: event.currentTarget.value as CanvasSettings['background'],
                  },
                })
              }
            >
              <option value="transparent">Transparent</option>
              <option value="dark">Dark preview</option>
            </select>
          </label>
          <label className="toggle-line canvas-active-toggle">
            <input
              type="checkbox"
              checked={selected.isActive}
              onChange={(event) =>
                patchCanvas(selected.slug, { isActive: event.currentTarget.checked })
              }
            />
            Active
          </label>
        </section>

        <div className="canvas-actions">
          <button
            className="button-secondary"
            type="button"
            disabled={isPending}
            onClick={() => testAlert()}
          >
            Test canvas
          </button>
          <button
            className="button-secondary"
            type="button"
            disabled={isPending}
            onClick={() => createCanvas(selected.slug)}
          >
            Duplicate
          </button>
          <button
            className="button-secondary"
            type="button"
            disabled={isPending || canvases.length <= 1}
            onClick={() => deleteCanvas(selected.slug)}
          >
            Delete
          </button>
        </div>
      </main>

      <aside className="canvas-panel canvas-components-panel">
        <h2 className="component-panel-title">On-screen components</h2>
        <div className="component-stack">
          {[...selected.settings.elements]
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((element) => {
              const expanded = element.id === selectedElement?.id;
              return (
                <section
                  className={`component-card${expanded ? ' component-card-open' : ''}`}
                  key={element.id}
                >
                  <button
                    className="component-card-header"
                    type="button"
                    onClick={() => setSelectedElementId(element.id)}
                  >
                    <span>{element.name}</span>
                    <span className="component-card-menu">...</span>
                    <span aria-hidden>{expanded ? '^' : 'v'}</span>
                  </button>
                  {expanded ? (
                    <div className="component-card-body">
                      <label className="field">
                        <span>Name</span>
                        <input
                          className="input"
                          value={element.name}
                          onChange={(event) =>
                            patchElement(element.id, { name: event.target.value })
                          }
                        />
                      </label>
                      {element.type === 'alert-image' ? (
                        <>
                          <div className="component-media-preview">
                            <PreviewAsset
                              asset={assetForElement(element, assets)}
                              eventUrl={previewAlert?.visualAssetUrl}
                              fallback="Event image"
                              previewKey={previewAlert?.id}
                            />
                          </div>
                          <label className="field">
                            <span>Stored asset</span>
                            <select
                              className="select"
                              value={element.bindings.assetId ?? ''}
                              onChange={(event) => {
                                const asset = assets.find(
                                  (item) => item.id === event.currentTarget.value,
                                );
                                patchElementBindings(element, {
                                  assetRole: event.currentTarget.value ? undefined : 'eventVisual',
                                  assetType:
                                    asset?.assetType === 'image' || asset?.assetType === 'video'
                                      ? asset.assetType
                                      : undefined,
                                  assetId: event.currentTarget.value || undefined,
                                  assetUrl: asset?.externalUrl ?? undefined,
                                });
                              }}
                            >
                              <option value="">Use event image/video</option>
                              {imageAssets.map((asset) => (
                                <option key={asset.id} value={asset.id}>
                                  {assetLabel(asset)}
                                </option>
                              ))}
                            </select>
                          </label>
                        </>
                      ) : element.type === 'shape' ? null : (
                        <>
                          <label className="field">
                            <span>Content</span>
                            <textarea
                              className="input"
                              value={element.bindings.textTemplate ?? ''}
                              onChange={(event) =>
                                patchElementBindings(element, { textTemplate: event.target.value })
                              }
                            />
                          </label>
                          <span className="component-data-hint">Type / to see available data</span>
                          <div className="token-list component-token-list">
                            {EVENT_VARIABLES.map((token) => (
                              <button
                                className="token-button"
                                key={token}
                                type="button"
                                onClick={() =>
                                  patchElementBindings(element, {
                                    textTemplate: `${element.bindings.textTemplate ?? ''}${token}`,
                                  })
                                }
                              >
                                {token}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      <div className="component-control-row component-control-row-fill">
                        <label className="compact-field">
                          <span>A</span>
                          <input
                            type="color"
                            value={element.styles.color ?? '#f0f0f0'}
                            onChange={(event) =>
                              patchElementStyles(element, { color: event.target.value })
                            }
                          />
                        </label>
                        <label className="compact-field">
                          <span>Fill</span>
                          <input
                            type="color"
                            value={solidColor(element.styles.backgroundColor) ?? '#2c2c2c'}
                            onChange={(event) =>
                              patchElementStyles(element, {
                                backgroundColor: event.target.value,
                              })
                            }
                          />
                        </label>
                        <button
                          className="button-secondary compact-action-button"
                          type="button"
                          onClick={() =>
                            patchElementStyles(element, { backgroundColor: undefined })
                          }
                        >
                          No fill
                        </button>
                        <label className="compact-field compact-field-wide">
                          <span>Size</span>
                          <input
                            className="input"
                            type="number"
                            min={8}
                            max={300}
                            value={element.styles.fontSize ?? 32}
                            onChange={(event) =>
                              patchElementStyles(element, {
                                fontSize: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                      {element.type === 'text' || element.type === 'alert-message' ? (
                        <div className="component-control-row">
                          <label className="compact-field">
                            <span>Stroke</span>
                            <input
                              type="color"
                              value={element.styles.textStrokeColor ?? '#000000'}
                              onChange={(event) =>
                                patchElementStyles(element, {
                                  textStrokeColor: event.target.value,
                                  textStrokeWidth: element.styles.textStrokeWidth ?? 2,
                                })
                              }
                            />
                          </label>
                          <label className="compact-field compact-field-wide">
                            <span>Px</span>
                            <input
                              className="input"
                              type="number"
                              min={0}
                              max={24}
                              value={element.styles.textStrokeWidth ?? 0}
                              onChange={(event) =>
                                patchElementStyles(element, {
                                  textStrokeWidth: Number(event.target.value),
                                  textStrokeColor: element.styles.textStrokeColor ?? '#000000',
                                })
                              }
                            />
                          </label>
                          <button
                            className="button-secondary compact-action-button"
                            type="button"
                            onClick={() =>
                              patchElementStyles(element, {
                                textStrokeColor: undefined,
                                textStrokeWidth: undefined,
                              })
                            }
                          >
                            No stroke
                          </button>
                        </div>
                      ) : null}
                      <div className="component-control-row">
                        <span>Fade-In</span>
                        <span>Fade-Out</span>
                        <span>{Math.round((element.animation.durationMs ?? 0) / 1000)} s</span>
                      </div>
                      <div className="component-metric-row">
                        {(['x', 'y', 'width'] as const).map((key) => (
                          <label className="metric-field" key={key}>
                            <span>{key.toUpperCase()}</span>
                            <input
                              className="input"
                              type="number"
                              min={key === 'width' ? 1 : 0}
                              value={element[key]}
                              onChange={(event) =>
                                patchElement(element.id, { [key]: Number(event.target.value) })
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <div className="component-metric-row">
                        <label className="metric-field">
                          <span>H</span>
                          <input
                            className="input"
                            type="number"
                            min={1}
                            value={element.height}
                            onChange={(event) =>
                              patchElement(element.id, { height: Number(event.target.value) })
                            }
                          />
                        </label>
                        <label className="metric-field">
                          <span>Layer</span>
                          <input
                            className="input"
                            type="number"
                            min={0}
                            value={element.zIndex}
                            onChange={(event) =>
                              patchElement(element.id, { zIndex: Number(event.target.value) })
                            }
                          />
                        </label>
                        <label className="metric-field">
                          <span>Opacity</span>
                          <input
                            className="input"
                            type="number"
                            min={0}
                            max={1}
                            step={0.05}
                            value={element.opacity}
                            onChange={(event) =>
                              patchElement(element.id, { opacity: Number(event.target.value) })
                            }
                          />
                        </label>
                      </div>
                      <div className="canvas-align-actions">
                        <button
                          className="button-secondary"
                          type="button"
                          onClick={() => centerElement(element, 'horizontal')}
                        >
                          Center X
                        </button>
                        <button
                          className="button-secondary"
                          type="button"
                          onClick={() => centerElement(element, 'vertical')}
                        >
                          Center Y
                        </button>
                        <button
                          className="button-secondary"
                          type="button"
                          onClick={() => centerElement(element, 'both')}
                        >
                          Center
                        </button>
                      </div>
                      <div className="component-toggle-row">
                        <label className="toggle-line">
                          <input
                            type="checkbox"
                            checked={!element.hidden}
                            onChange={(event) =>
                              patchElement(element.id, { hidden: !event.target.checked })
                            }
                          />
                          Visible
                        </label>
                        <label className="toggle-line">
                          <input
                            type="checkbox"
                            checked={element.locked}
                            onChange={(event) =>
                              patchElement(element.id, { locked: event.target.checked })
                            }
                          />
                          Locked
                        </label>
                      </div>
                      <button
                        className="button-secondary"
                        type="button"
                        disabled={selected.settings.elements.length <= 1}
                        onClick={() => deleteElement(element.id)}
                      >
                        Delete layer
                      </button>
                    </div>
                  ) : null}
                </section>
              );
            })}
        </div>
        <details className="component-add-menu">
          <summary>+ Add element</summary>
          <div className="component-add-grid">
            {(['text', 'alert-message', 'alert-image', 'shape'] as const).map((type) => (
              <button
                className="palette-button"
                key={type}
                type="button"
                disabled={isPending}
                onClick={() => addElement(type)}
              >
                {elementTypeLabel(type)}
              </button>
            ))}
          </div>
        </details>
        <section className="component-card">
          <div className="component-card-header component-card-header-static">
            <span>Audio</span>
            <span className="component-card-menu">...</span>
            <span aria-hidden>^</span>
          </div>
          <div className="component-card-body">
            <label className="field">
              <span>Stored sound</span>
              <select
                className="select"
                value={selected.settings.audioAssetId ?? ''}
                onChange={(event) =>
                  patchCanvas(selected.slug, {
                    settings: {
                      audioAssetId: event.currentTarget.value || null,
                      audioAssetUrl:
                        audioAssets.find((asset) => asset.id === event.currentTarget.value)
                          ?.externalUrl ?? null,
                    },
                  })
                }
              >
                <option value="">Use event/default audio</option>
                {audioAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {assetLabel(asset)}
                  </option>
                ))}
              </select>
            </label>
            <label className="metric-field">
              <span>Volume</span>
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                value={selected.settings.volume}
                onChange={(event) =>
                  patchCanvas(selected.slug, {
                    settings: { volume: Number(event.currentTarget.value) },
                  })
                }
              />
            </label>
          </div>
        </section>
        <section className="canvas-panel-section component-alert-bindings">
          <h2>Alert bindings</h2>
          {Object.entries(groupedConfigs).map(([platform, configs]) => (
            <div className="canvas-alert-group" key={platform}>
              <h3>{platformLabel(platform)}</h3>
              {configs.map((config) => (
                <div className="canvas-alert-row-wrapper" key={config.id}>
                  <label className="canvas-alert-row">
                    <input
                      type="checkbox"
                      checked={assignedKeys.has(config.alertEventType.eventKey)}
                      onChange={(event) => toggleAlert(config, event.currentTarget.checked)}
                    />
                    <span>
                      <strong>{config.alertEventType.displayName}</strong>
                      <span className="muted small">
                        {config.alertEventType.eventKey}
                        {config.enabled ? '' : ' / disabled'}
                      </span>
                    </span>
                    <button
                      className="link-button"
                      type="button"
                      disabled={isPending}
                      onClick={(event) => {
                        event.preventDefault();
                        testAlert(config.alertEventType.eventKey);
                      }}
                    >
                      Test
                    </button>
                  </label>
                  {(platform === 'twitch' || platform === 'youtube') && (
                    <AccountTargetingControl
                      config={config}
                      platform={platform as 'twitch' | 'youtube'}
                      linkedAccounts={linkedAccounts}
                      channelSlug={channelSlug}
                      onToggle={toggleAccountSelection}
                    />
                  )}
                </div>
              ))}
            </div>
          ))}
        </section>
        <div className="component-preview-footer">
          <button
            className="button-secondary"
            type="button"
            disabled={isPending}
            onClick={() => testAlert()}
          >
            ▶ Preview
          </button>
        </div>
      </aside>
    </div>
  );
}

type RawProfile = Omit<CanvasProfile, 'updatedAt' | 'url' | 'settings'> & {
  updatedAt?: string | Date;
  url?: string;
  settings?: Partial<CanvasSettings>;
  settingsJson?: unknown;
};

function normalizeProfile(profile: RawProfile, channelSlug: string): CanvasProfile {
  const settings = readSettings(profile.settings ?? profile.settingsJson);
  return {
    id: profile.id,
    name: profile.name,
    slug: profile.slug,
    displayKey: profile.displayKey,
    isActive: profile.isActive,
    updatedAt: new Date(profile.updatedAt ?? Date.now()).toISOString(),
    url:
      profile.url ??
      `${clientOrigin()}/overlay/${channelSlug}/${profile.slug}?displayKey=${encodeURIComponent(
        profile.displayKey,
      )}`,
    settings,
  };
}

function clientOrigin() {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

function readSettings(value: unknown): CanvasSettings {
  return normalizeCanvasSettings(value).settings;
}

export function applyAlertAssignment(currentKeys: string[], eventKey: string, assigned: boolean) {
  const nextKeys = new Set(currentKeys);
  if (assigned) {
    nextKeys.add(eventKey);
  } else {
    nextKeys.delete(eventKey);
  }
  return [...nextKeys];
}

function platformLabel(platform: string) {
  const labels: Record<string, string> = {
    generic: 'Generic/API',
    kofi: 'Ko-fi',
    manual: 'Manual',
    twitch: 'Twitch',
    youtube: 'YouTube',
  };
  return labels[platform] ?? platform;
}

function elementTypeLabel(type: CanvasElementType) {
  const labels: Record<CanvasElementType, string> = {
    text: 'Text',
    'alert-message': 'Message',
    'alert-image': 'Image',
    shape: 'Shape',
  };
  return labels[type];
}

function solidColor(value: string | undefined) {
  return value?.startsWith('#') ? value : undefined;
}

function assetLabel(asset: WorkspaceAsset) {
  return asset.originalFilename ?? asset.externalUrl ?? asset.id;
}

function formatCanvasDate(value: string) {
  return value.slice(0, 10);
}

function assetForElement(element: CanvasElement, assets: WorkspaceAsset[]) {
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
  asset: WorkspaceAsset | null | undefined;
  eventUrl?: string;
  fallback: string;
  previewKey?: string;
}) {
  const url = asset?.previewUrl ?? eventUrl;
  if (!url) return <span className="canvas-image-placeholder">{fallback}</span>;
  if (asset?.assetType === 'video' || /\.(mp4|webm)(\?|$)/i.test(url)) {
    return (
      <video
        className="canvas-preview-asset"
        key={previewKey ?? url}
        src={url}
        muted={!previewKey}
        loop
        playsInline
        autoPlay
      />
    );
  }
  return <img className="canvas-preview-asset" alt="" src={url} />;
}

function transformElement(
  start: ElementStart,
  mode: ResizeMode | 'move',
  dx: number,
  dy: number,
  settings: CanvasSettings,
) {
  let x = start.x;
  let y = start.y;
  let width = start.width;
  let height = start.height;

  if (mode === 'move') {
    x = start.x + dx;
    y = start.y + dy;
  } else {
    if (mode.includes('e')) width = start.width + dx;
    if (mode.includes('s')) height = start.height + dy;
    if (mode.includes('w')) {
      x = start.x + dx;
      width = start.width - dx;
    }
    if (mode.includes('n')) {
      y = start.y + dy;
      height = start.height - dy;
    }
  }

  width = clamp(Math.round(width), 16, settings.width);
  height = clamp(Math.round(height), 16, settings.height);
  x = clamp(Math.round(x), 0, settings.width - width);
  y = clamp(Math.round(y), 0, settings.height - height);

  const snapped = snapToCanvasCenter({ x, y, width, height }, settings);
  return {
    element: snapped.element,
    guides: snapped.guides,
  };
}

function snapToCanvasCenter(
  element: Pick<CanvasElement, 'x' | 'y' | 'width' | 'height'>,
  settings: CanvasSettings,
) {
  const threshold = Math.max(8, Math.round(settings.width * 0.006));
  const centerX = settings.width / 2;
  const centerY = settings.height / 2;
  const elementCenterX = element.x + element.width / 2;
  const elementCenterY = element.y + element.height / 2;
  const guides = {
    vertical: Math.abs(elementCenterX - centerX) <= threshold,
    horizontal: Math.abs(elementCenterY - centerY) <= threshold,
  };

  return {
    element: {
      ...element,
      x: guides.vertical ? Math.round(centerX - element.width / 2) : element.x,
      y: guides.horizontal ? Math.round(centerY - element.height / 2) : element.y,
    },
    guides,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function AccountTargetingControl({
  config,
  platform,
  linkedAccounts,
  channelSlug,
  onToggle,
}: {
  config: AlertConfig;
  platform: 'twitch' | 'youtube';
  linkedAccounts: LinkedAccountInfo[];
  channelSlug: string;
  onToggle: (config: AlertConfig, accountId: string, checked: boolean) => void;
}) {
  const platformAccounts = linkedAccounts.filter((a) => a.platform === platform && a.isActive);

  if (platformAccounts.length === 0) {
    return (
      <div className="canvas-alert-account-targeting">
        <p className="muted small">
          No {platform === 'twitch' ? 'Twitch' : 'YouTube'} accounts linked. Connect one in{' '}
          <a href={`/dashboard/${encodeURIComponent(channelSlug)}/settings#integrations`}>
            Settings → Integrations
          </a>
          .
        </p>
      </div>
    );
  }

  const configJson = (config.configJson ?? {}) as Record<string, unknown>;
  const selectedIds = Array.isArray(configJson.selectedLinkedAccountIds)
    ? (configJson.selectedLinkedAccountIds as string[])
    : [];

  return (
    <div className="canvas-alert-account-targeting">
      <span className="muted small">Listen to accounts:</span>
      <div className="canvas-alert-account-list">
        {platformAccounts.map((account) => {
          const checked = selectedIds.includes(account.id);
          const label = account.platformAccountName ?? account.platformAccountId;
          return (
            <label className="canvas-alert-account-chip" key={account.id}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onToggle(config, account.id, event.currentTarget.checked)}
              />
              <span>
                {label}
                {account.isPrimary ? ' ⭐' : ''}
              </span>
            </label>
          );
        })}
      </div>
      {selectedIds.length === 0 && (
        <p className="muted small warning">
          No accounts selected — this alert will not fire until one or more{' '}
          {platform === 'twitch' ? 'Twitch' : 'YouTube'} accounts are selected.
        </p>
      )}
    </div>
  );
}
