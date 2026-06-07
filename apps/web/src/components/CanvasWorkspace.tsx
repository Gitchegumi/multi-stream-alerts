'use client';

import { useMemo, useState, useTransition } from 'react';
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
  alertEventType: {
    platform: string;
    eventKey: string;
    displayName: string;
  };
};

type AlertLayout = {
  id: string;
  name: string;
  style: string;
};

type WorkspaceAsset = {
  id: string;
  assetType: 'image' | 'video' | 'audio';
  originalFilename: string | null;
  externalUrl: string | null;
  previewUrl: string;
};

export function CanvasWorkspace({
  channelId,
  channelSlug,
  initialCanvases,
  alertConfigs,
  layouts,
  assets,
}: {
  channelId: string;
  channelSlug: string;
  initialCanvases: CanvasProfile[];
  alertConfigs: AlertConfig[];
  layouts: AlertLayout[];
  assets: WorkspaceAsset[];
}) {
  const [canvases, setCanvases] = useState(initialCanvases);
  const [configs, setConfigs] = useState(alertConfigs);
  const [selectedSlug, setSelectedSlug] = useState(initialCanvases[0]?.slug ?? '');
  const [draftName, setDraftName] = useState(initialCanvases[0]?.name ?? '');
  const [selectedElementId, setSelectedElementId] = useState(
    initialCanvases[0]?.settings.elements[0]?.id ?? '',
  );
  const [result, setResult] = useState<string | null>(null);
  const [previewAlert, setPreviewAlert] = useState<AlertEvent | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = canvases.find((canvas) => canvas.slug === selectedSlug) ?? canvases[0];
  const selectedElement =
    selected?.settings.elements.find((element) => element.id === selectedElementId) ??
    selected?.settings.elements[0] ??
    null;
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

  function selectCanvas(slug: string) {
    const next = canvases.find((canvas) => canvas.slug === slug);
    setSelectedSlug(slug);
    setDraftName(next?.name ?? '');
    setSelectedElementId(next?.settings.elements[0]?.id ?? '');
    setResult(null);
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
                {canvas.isActive ? 'Active' : 'Inactive'} /{' '}
                {new Date(canvas.updatedAt).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>
        <section className="canvas-panel-section">
          <h2>Elements</h2>
          <div className="canvas-tool-grid">
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
        </section>
        <section className="canvas-panel-section">
          <h2>Layers</h2>
          <div className="layer-list">
            {[...selected.settings.elements]
              .sort((a, b) => b.zIndex - a.zIndex)
              .map((element) => (
                <button
                  className={`layer-row${element.id === selectedElement?.id ? ' layer-row-active' : ''}`}
                  key={element.id}
                  type="button"
                  onClick={() => setSelectedElementId(element.id)}
                >
                  <span>{element.name}</span>
                  <span className="muted small">{element.hidden ? 'Hidden' : 'Shown'}</span>
                </button>
              ))}
          </div>
        </section>
        <section className="canvas-panel-section">
          <h2>Variables</h2>
          <div className="token-list">
            {EVENT_VARIABLES.map((token) => (
              <button
                className="token-button"
                key={token}
                type="button"
                disabled={!selectedElement}
                onClick={() => {
                  if (!selectedElement) return;
                  patchElementBindings(selectedElement, {
                    textTemplate: `${selectedElement.bindings.textTemplate ?? ''}${token}`,
                  });
                }}
              >
                {token}
              </button>
            ))}
          </div>
        </section>
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
              style={{
                aspectRatio: `${selected.settings.width} / ${selected.settings.height}`,
                width: 'min(100%, 960px)',
              }}
            >
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
                    }}
                  >
                    {element.type === 'alert-image' ? (
                      <PreviewAsset
                        asset={assetForElement(element, assets)}
                        fallback={previewAlert ? 'Event image' : 'Event image'}
                      />
                    ) : element.type === 'shape' ? null : (
                      renderCanvasText(element.bindings.textTemplate ?? element.name, previewAlert)
                    )}
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
              <iframe title={`${selected.name} runtime preview`} src={selected.url} />
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
                if (name && name !== selected.name) patchCanvas(selected.slug, { name });
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
              value={selected.settings.width}
              onChange={(event) =>
                patchCanvas(selected.slug, {
                  settings: { width: Number(event.currentTarget.value) },
                })
              }
            />
          </label>
          <label className="field">
            <span>Height</span>
            <input
              className="input"
              type="number"
              min={240}
              max={4320}
              value={selected.settings.height}
              onChange={(event) =>
                patchCanvas(selected.slug, {
                  settings: { height: Number(event.currentTarget.value) },
                })
              }
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
          <label className="field">
            <span>Audio</span>
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
          <label className="field">
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

        <section className="panel">
          <h2>Legacy alert presets</h2>
          <p className="muted small">
            These presets still feed existing alert-type defaults. New overlay editing should happen
            on the selected canvas above.
          </p>
          <div className="canvas-layout-links">
            {layouts.map((layout) => (
              <a
                className="button-secondary"
                key={layout.id}
                href={`/dashboard/${encodeURIComponent(channelSlug)}/overlay/${encodeURIComponent(layout.id)}/edit`}
              >
                Edit {layout.name}
              </a>
            ))}
          </div>
        </section>
      </main>

      <aside className="canvas-panel">
        <h2>Inspector</h2>
        {selectedElement ? (
          <section className="property-stack">
            <label className="field">
              <span>Layer name</span>
              <input
                className="input"
                value={selectedElement.name}
                onChange={(event) => patchElement(selectedElement.id, { name: event.target.value })}
              />
            </label>
            {selectedElement.type === 'alert-image' ? (
              <label className="field">
                <span>Stored asset</span>
                <select
                  className="select"
                  value={selectedElement.bindings.assetId ?? ''}
                  onChange={(event) => {
                    const asset = assets.find((item) => item.id === event.currentTarget.value);
                    patchElementBindings(selectedElement, {
                      assetRole: event.currentTarget.value ? undefined : 'eventVisual',
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
            ) : null}
            <div className="number-fields">
              {(['x', 'y', 'width', 'height'] as const).map((key) => (
                <label className="field" key={key}>
                  <span>{key}</span>
                  <input
                    className="input"
                    type="number"
                    min={key === 'width' || key === 'height' ? 1 : 0}
                    value={selectedElement[key]}
                    onChange={(event) =>
                      patchElement(selectedElement.id, { [key]: Number(event.target.value) })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="number-fields">
              <label className="field">
                <span>Opacity</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selectedElement.opacity}
                  onChange={(event) =>
                    patchElement(selectedElement.id, { opacity: Number(event.target.value) })
                  }
                />
              </label>
              <label className="field">
                <span>Layer</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={selectedElement.zIndex}
                  onChange={(event) =>
                    patchElement(selectedElement.id, { zIndex: Number(event.target.value) })
                  }
                />
              </label>
            </div>
            <label className="field">
              <span>Text / variables</span>
              <textarea
                className="input"
                value={selectedElement.bindings.textTemplate ?? ''}
                onChange={(event) =>
                  patchElementBindings(selectedElement, { textTemplate: event.target.value })
                }
              />
            </label>
            <div className="number-fields">
              <label className="field">
                <span>Text color</span>
                <input
                  className="input"
                  type="color"
                  value={selectedElement.styles.color ?? '#f0f0f0'}
                  onChange={(event) =>
                    patchElementStyles(selectedElement, { color: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Fill</span>
                <input
                  className="input"
                  type="color"
                  value={solidColor(selectedElement.styles.backgroundColor) ?? '#2c2c2c'}
                  onChange={(event) =>
                    patchElementStyles(selectedElement, { backgroundColor: event.target.value })
                  }
                />
              </label>
            </div>
            <label className="toggle-line">
              <input
                type="checkbox"
                checked={!selectedElement.hidden}
                onChange={(event) =>
                  patchElement(selectedElement.id, { hidden: !event.target.checked })
                }
              />
              Visible
            </label>
            <label className="toggle-line">
              <input
                type="checkbox"
                checked={selectedElement.locked}
                onChange={(event) =>
                  patchElement(selectedElement.id, { locked: event.target.checked })
                }
              />
              Locked
            </label>
            <button
              className="button-secondary"
              type="button"
              disabled={selected.settings.elements.length <= 1}
              onClick={() => deleteElement(selectedElement.id)}
            >
              Delete layer
            </button>
          </section>
        ) : (
          <p className="muted">Select a layer to edit it.</p>
        )}
        <section className="canvas-panel-section">
          <h2>Alert Bindings</h2>
          {Object.entries(groupedConfigs).map(([platform, configs]) => (
            <div className="canvas-alert-group" key={platform}>
              <h3>{platformLabel(platform)}</h3>
              {configs.map((config) => (
                <label className="canvas-alert-row" key={config.id}>
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
              ))}
            </div>
          ))}
        </section>
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

function assetForElement(element: CanvasElement, assets: WorkspaceAsset[]) {
  return element.bindings.assetId
    ? assets.find((asset) => asset.id === element.bindings.assetId)
    : null;
}

function PreviewAsset({
  asset,
  fallback,
}: {
  asset: WorkspaceAsset | null | undefined;
  fallback: string;
}) {
  if (!asset) return <span className="canvas-image-placeholder">{fallback}</span>;
  if (asset.assetType === 'video') {
    return (
      <video
        className="canvas-preview-asset"
        src={asset.previewUrl}
        muted
        loop
        playsInline
        autoPlay
      />
    );
  }
  return <img className="canvas-preview-asset" alt="" src={asset.previewUrl} />;
}
