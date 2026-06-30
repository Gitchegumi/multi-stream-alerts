'use client';

import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useMemo, useRef, useState, useTransition } from 'react';

export type ElementType = 'text' | 'image' | 'video' | 'alert-box' | 'goal-bar';

export type OverlayElement = {
  id: string;
  type: ElementType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  properties: {
    textTemplate?: string;
    fontFamily?: string;
    fontSize?: number;
    color?: string;
    backgroundColor?: string;
    opacity?: number;
    animationIn?: string;
    animationOut?: string;
    duration?: number;
  };
  assets?: {
    image?: string | null;
    video?: string | null;
    audio?: string | null;
  };
};

export type EditorLayout = {
  version: 1;
  resolution: { width: number; height: number };
  elements: OverlayElement[];
};

export type NormalizedEditorLayout = {
  layout: EditorLayout;
  warnings: string[];
};

type WorkspaceAsset = {
  id: string;
  assetType: 'image' | 'video' | 'audio';
  originalFilename: string | null;
  externalUrl: string | null;
  previewUrl: string;
};

type AlertLayout = {
  id: string;
  name: string;
  animationSettings: Record<string, unknown>;
  editorLayout: Record<string, unknown>;
};

const palette: Array<{ type: ElementType; label: string }> = [
  { type: 'text', label: 'Text' },
  { type: 'image', label: 'Image' },
  { type: 'video', label: 'Video' },
  { type: 'alert-box', label: 'Alert Box' },
  { type: 'goal-bar', label: 'Goal Bar' },
];
const EDITOR_LAYOUT_VERSION = 1;
const BRAND_SOFT_WHITE = '#f0f0f0';
const BRAND_CHARCOAL = '#2c2c2c';
const BRAND_ULTRAMARINE = '#4166f5';

export function OverlayLayoutEditor({
  channelSlug,
  layout,
  assets,
  canManage,
}: {
  channelSlug: string;
  layout: AlertLayout;
  assets: WorkspaceAsset[];
  canManage: boolean;
}) {
  const normalized = useMemo(
    () => normalizeEditorLayout(layout.editorLayout, layout.animationSettings),
    [layout],
  );
  const initialLayout = normalized.layout;
  const [draft, setDraft] = useState(initialLayout);
  const [selectedId, setSelectedId] = useState(draft.elements[0]?.id ?? '');
  const [history, setHistory] = useState<EditorLayout[]>([]);
  const [future, setFuture] = useState<EditorLayout[]>([]);
  const [zoom, setZoom] = useState(0.5);
  const [previewing, setPreviewing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const selected = draft.elements.find((element) => element.id === selectedId) ?? null;
  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  function commit(next: EditorLayout) {
    setHistory((current) => [...current.slice(-24), draft]);
    setFuture([]);
    setDraft(next);
  }

  function patchElement(id: string, patch: Partial<OverlayElement>) {
    commit({
      ...draft,
      elements: draft.elements.map((element) =>
        element.id === id ? { ...element, ...patch } : element,
      ),
    });
  }

  function patchProperties(id: string, patch: OverlayElement['properties']) {
    const element = draft.elements.find((item) => item.id === id);
    if (!element) return;
    patchElement(id, { properties: { ...element.properties, ...patch } });
  }

  function addElement(type: ElementType) {
    const count = draft.elements.filter((element) => element.type === type).length + 1;
    const element = createElement(type, count, draft.elements.length + 1);
    commit({ ...draft, elements: [...draft.elements, element] });
    setSelectedId(element.id);
  }

  function removeSelected() {
    if (!selected) return;
    const elements = draft.elements.filter((element) => element.id !== selected.id);
    commit({ ...draft, elements });
    setSelectedId(elements[0]?.id ?? '');
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((current) => [draft, ...current]);
    setHistory((current) => current.slice(0, -1));
    setDraft(previous);
    setSelectedId(previous.elements[0]?.id ?? '');
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setHistory((current) => [...current, draft]);
    setFuture((current) => current.slice(1));
    setDraft(next);
    setSelectedId(next.elements[0]?.id ?? '');
  }

  function save() {
    setResult(null);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/channels/${encodeURIComponent(channelSlug)}/alert-layouts/${encodeURIComponent(
            layout.id,
          )}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              editorLayout: serializeEditorLayout(draft),
            }),
          },
        );
        setResult(response.ok ? 'Saved.' : 'Could not save layout.');
      } catch {
        setResult('Could not save layout.');
      }
    });
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>, element: OverlayElement) {
    if (!canManage || previewing || element.locked) return;
    event.preventDefault();
    setSelectedId(element.id);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = draft.resolution.width / rect.width;
    const scaleY = draft.resolution.height / rect.height;
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { x: element.x, y: element.y };

    function move(pointerEvent: PointerEvent) {
      const x = origin.x + (pointerEvent.clientX - startX) * scaleX;
      const y = origin.y + (pointerEvent.clientY - startY) * scaleY;
      setDraft((current) => ({
        ...current,
        elements: current.elements.map((item) =>
          item.id === element.id
            ? {
                ...item,
                x: clamp(Math.round(x), 0, current.resolution.width - item.width),
                y: clamp(Math.round(y), 0, current.resolution.height - item.height),
              }
            : item,
        ),
      }));
    }

    function stop() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      setHistory((current) => [...current.slice(-24), draft]);
      setFuture([]);
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  function selectElementWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>, elementId: string) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setSelectedId(elementId);
  }

  function updateTransformValue(
    element: OverlayElement,
    key: 'x' | 'y' | 'width' | 'height' | 'zIndex',
    value: number,
  ) {
    if (!Number.isFinite(value)) return;

    if (key === 'width') {
      const width = clamp(Math.round(value), 1, draft.resolution.width);
      patchElement(element.id, {
        width,
        x: clamp(element.x, 0, draft.resolution.width - width),
      });
      return;
    }

    if (key === 'height') {
      const height = clamp(Math.round(value), 1, draft.resolution.height);
      patchElement(element.id, {
        height,
        y: clamp(element.y, 0, draft.resolution.height - height),
      });
      return;
    }

    if (key === 'x') {
      patchElement(element.id, {
        x: clamp(Math.round(value), 0, draft.resolution.width - element.width),
      });
      return;
    }

    if (key === 'y') {
      patchElement(element.id, {
        y: clamp(Math.round(value), 0, draft.resolution.height - element.height),
      });
      return;
    }

    patchElement(element.id, { zIndex: Math.max(0, Math.round(value)) });
  }

  return (
    <div className="overlay-editor-shell">
      <header className="overlay-editor-nav">
        <a
          className="button-secondary"
          href={`/dashboard/${encodeURIComponent(channelSlug)}/alerts`}
        >
          Back
        </a>
        <input
          className="overlay-title-input"
          value={layout.name}
          readOnly
          aria-label="Overlay layout name"
        />
        <div className="overlay-editor-tools">
          <button
            className="button-secondary"
            type="button"
            disabled={!history.length}
            onClick={undo}
          >
            Undo
          </button>
          <button
            className="button-secondary"
            type="button"
            disabled={!future.length}
            onClick={redo}
          >
            Redo
          </button>
          <select
            className="select"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          >
            <option value={0.35}>35%</option>
            <option value={0.5}>50%</option>
            <option value={0.75}>75%</option>
            <option value={1}>100%</option>
          </select>
          <button
            className="button-secondary"
            type="button"
            onClick={() => setPreviewing((value) => !value)}
          >
            {previewing ? 'Edit' : 'Preview'}
          </button>
          <button
            className="button"
            type="button"
            disabled={isPending || !canManage}
            onClick={save}
          >
            Save
          </button>
        </div>
      </header>

      {result ? <p className="overlay-editor-result muted">{result}</p> : null}
      {!canManage ? <p className="overlay-editor-result muted">Read-only access.</p> : null}
      {normalized.warnings.length ? (
        <p className="overlay-editor-result muted">
          Layout data was repaired while loading: {normalized.warnings.join('; ')}
        </p>
      ) : null}

      <div className="overlay-editor-grid">
        <aside className="overlay-editor-sidebar">
          <section>
            <h2>Elements</h2>
            <div className="element-palette">
              {palette.map((item) => (
                <button
                  className="palette-button"
                  key={item.type}
                  type="button"
                  disabled={!canManage}
                  onClick={() => addElement(item.type)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h2>Layers</h2>
            <div className="layer-list">
              {[...draft.elements]
                .sort((a, b) => b.zIndex - a.zIndex)
                .map((element) => (
                  <button
                    className={`layer-row${element.id === selectedId ? ' layer-row-active' : ''}`}
                    key={element.id}
                    type="button"
                    onClick={() => setSelectedId(element.id)}
                  >
                    <span>{element.name}</span>
                    <span className="muted small">{element.visible ? 'Shown' : 'Hidden'}</span>
                  </button>
                ))}
            </div>
          </section>
        </aside>

        <main className="overlay-workspace">
          <div
            className="overlay-canvas"
            ref={canvasRef}
            style={{
              width: draft.resolution.width * zoom,
              height: draft.resolution.height * zoom,
            }}
          >
            {draft.elements
              .filter((element) => element.visible)
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((element) => (
                <div
                  className={`overlay-canvas-element${
                    element.id === selectedId && !previewing
                      ? ' overlay-canvas-element-selected'
                      : ''
                  }`}
                  key={element.id}
                  role="button"
                  aria-label={element.name}
                  tabIndex={0}
                  onPointerDown={(event) => startDrag(event, element)}
                  onClick={() => setSelectedId(element.id)}
                  onKeyDown={(event) => selectElementWithKeyboard(event, element.id)}
                  style={{
                    left: element.x * zoom,
                    top: element.y * zoom,
                    width: element.width * zoom,
                    height: element.height * zoom,
                    zIndex: element.zIndex,
                    opacity: element.properties.opacity ?? 1,
                    color: element.properties.color,
                    background: element.properties.backgroundColor,
                    fontFamily: element.properties.fontFamily,
                    fontSize: (element.properties.fontSize ?? 24) * zoom,
                  }}
                >
                  <ElementPreview element={element} assetById={assetById} />
                </div>
              ))}
          </div>
        </main>

        <aside className="overlay-editor-sidebar">
          <h2>Properties</h2>
          {selected ? (
            <div className="property-stack">
              <label className="field">
                <span>Name</span>
                <input
                  className="input"
                  value={selected.name}
                  disabled={!canManage}
                  onChange={(event) => patchElement(selected.id, { name: event.target.value })}
                />
              </label>
              <div className="number-fields">
                {(['x', 'y', 'width', 'height', 'zIndex'] as const).map((key) => (
                  <label className="field" key={key}>
                    <span>{key}</span>
                    <input
                      className="input"
                      type="number"
                      min={key === 'width' || key === 'height' ? 1 : 0}
                      value={selected[key]}
                      disabled={!canManage}
                      onChange={(event) =>
                        updateTransformValue(selected, key, event.target.valueAsNumber)
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="toggle-line">
                <input
                  type="checkbox"
                  checked={selected.visible}
                  disabled={!canManage}
                  onChange={(event) => patchElement(selected.id, { visible: event.target.checked })}
                />
                Visible
              </label>
              <label className="toggle-line">
                <input
                  type="checkbox"
                  checked={selected.locked}
                  disabled={!canManage}
                  onChange={(event) => patchElement(selected.id, { locked: event.target.checked })}
                />
                Locked
              </label>
              <label className="field">
                <span>Text template</span>
                <textarea
                  className="input"
                  value={selected.properties.textTemplate ?? ''}
                  disabled={!canManage}
                  onChange={(event) =>
                    patchProperties(selected.id, { textTemplate: event.target.value })
                  }
                />
              </label>
              <div className="number-fields">
                <label className="field">
                  <span>Font size</span>
                  <input
                    className="input"
                    type="number"
                    min={8}
                    max={200}
                    value={selected.properties.fontSize ?? 24}
                    disabled={!canManage}
                    onChange={(event) =>
                      patchProperties(selected.id, { fontSize: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="field">
                  <span>Opacity</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={selected.properties.opacity ?? 1}
                    disabled={!canManage}
                    onChange={(event) =>
                      patchProperties(selected.id, { opacity: Number(event.target.value) })
                    }
                  />
                </label>
              </div>
              <div className="number-fields">
                <label className="field">
                  <span>Text color</span>
                  <input
                    className="input"
                    type="color"
                    value={selected.properties.color ?? BRAND_SOFT_WHITE}
                    disabled={!canManage}
                    onChange={(event) =>
                      patchProperties(selected.id, { color: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Background</span>
                  <input
                    className="input"
                    type="color"
                    value={selected.properties.backgroundColor ?? BRAND_CHARCOAL}
                    disabled={!canManage}
                    onChange={(event) =>
                      patchProperties(selected.id, { backgroundColor: event.target.value })
                    }
                  />
                </label>
              </div>
              {selected.type === 'image' || selected.type === 'video' ? (
                <label className="field">
                  <span>Asset</span>
                  <select
                    className="select"
                    value={selected.assets?.image ?? selected.assets?.video ?? ''}
                    disabled={!canManage}
                    onChange={(event) =>
                      patchElement(selected.id, {
                        assets:
                          selected.type === 'image'
                            ? { ...selected.assets, image: event.target.value || null }
                            : { ...selected.assets, video: event.target.value || null },
                      })
                    }
                  >
                    <option value="">Missing asset placeholder</option>
                    {assets
                      .filter((asset) => asset.assetType === selected.type)
                      .map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.originalFilename ?? asset.externalUrl ?? asset.id}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
              <button
                className="button-secondary"
                type="button"
                disabled={!canManage}
                onClick={removeSelected}
              >
                Delete element
              </button>
            </div>
          ) : (
            <p className="muted">Select an element to edit it.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function ElementPreview({
  element,
  assetById,
}: {
  element: OverlayElement;
  assetById: Map<string, WorkspaceAsset>;
}) {
  const text = element.properties.textTemplate ?? element.name;
  if (element.type === 'image') {
    const asset = element.assets?.image ? assetById.get(element.assets.image) : null;
    return asset ? <img alt="" src={asset.previewUrl} /> : <span>Missing Asset</span>;
  }
  if (element.type === 'video') {
    const asset = element.assets?.video ? assetById.get(element.assets.video) : null;
    return asset ? (
      <video src={asset.previewUrl} muted loop playsInline autoPlay />
    ) : (
      <span>Missing Asset</span>
    );
  }
  if (element.type === 'goal-bar') {
    return (
      <div className="goal-preview">
        <span style={{ width: '64%' }} />
        <strong>{text}</strong>
      </div>
    );
  }
  return <span>{text}</span>;
}

export function normalizeEditorLayout(
  editorLayout: unknown,
  legacySettings: Record<string, unknown> = {},
): NormalizedEditorLayout {
  const warnings: string[] = [];
  const candidate =
    isRecord(editorLayout) && Object.keys(editorLayout).length
      ? editorLayout
      : isRecord(legacySettings.editorLayout)
        ? legacySettings.editorLayout
        : null;

  if (candidate) {
    const version = candidate.version ?? 1;
    if (!('version' in candidate)) {
      warnings.push('missing editor layout version');
    }
    if (version !== EDITOR_LAYOUT_VERSION) {
      warnings.push(
        typeof version === 'number' && version > EDITOR_LAYOUT_VERSION
          ? `unsupported editor layout version ${version}`
          : 'missing or invalid editor layout version',
      );
      if (typeof version === 'number' && version > EDITOR_LAYOUT_VERSION) {
        return { layout: createDefaultLayout(), warnings };
      }
    }

    if (!isRecord(candidate.resolution) || !Array.isArray(candidate.elements)) {
      warnings.push('invalid layout shape');
      return { layout: createDefaultLayout(), warnings };
    }

    const resolution = {
      width: coerceNumber(candidate.resolution.width, 1920, 1, 7680),
      height: coerceNumber(candidate.resolution.height, 1080, 1, 4320),
    };
    if (
      resolution.width !== Number(candidate.resolution.width) ||
      resolution.height !== Number(candidate.resolution.height)
    ) {
      warnings.push('resolution values were normalized');
    }

    return {
      layout: {
        version: EDITOR_LAYOUT_VERSION,
        resolution,
        elements: candidate.elements.flatMap((element, index) => {
          if (!isRecord(element)) {
            warnings.push(`element ${index + 1} was skipped because it is not an object`);
            return [];
          }
          const parsed = element as Partial<OverlayElement>;
          if (!isElementType(parsed.type)) {
            warnings.push(`element ${index + 1} was skipped because its type is unsupported`);
            return [];
          }
          const type = parsed.type;
          const base = createElement(type, index + 1, index + 1);
          const width = coerceNumber(parsed.width, base.width, 1, resolution.width);
          const height = coerceNumber(parsed.height, base.height, 1, resolution.height);
          const properties = isRecord(parsed.properties) ? parsed.properties : {};
          const assets = isRecord(parsed.assets) ? parsed.assets : {};
          if (
            parsed.x !== undefined &&
            parsed.y !== undefined &&
            parsed.width !== undefined &&
            parsed.height !== undefined &&
            (width !== Number(parsed.width) ||
              height !== Number(parsed.height) ||
              coerceNumber(parsed.x, base.x, 0, resolution.width - width) !== Number(parsed.x) ||
              coerceNumber(parsed.y, base.y, 0, resolution.height - height) !== Number(parsed.y))
          ) {
            warnings.push(`${base.name} transform values were normalized`);
          }

          return [
            {
              ...base,
              id: typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id : base.id,
              type,
              name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : base.name,
              x: coerceNumber(parsed.x, base.x, 0, resolution.width - width),
              y: coerceNumber(parsed.y, base.y, 0, resolution.height - height),
              width,
              height,
              zIndex: coerceNumber(parsed.zIndex, base.zIndex, 0, 10000),
              visible: typeof parsed.visible === 'boolean' ? parsed.visible : base.visible,
              locked: typeof parsed.locked === 'boolean' ? parsed.locked : base.locked,
              properties: { ...base.properties, ...properties },
              assets: { ...base.assets, ...assets },
            },
          ];
        }),
      },
      warnings,
    };
  }
  return { layout: createDefaultLayout(), warnings };
}

export function serializeEditorLayout(layout: EditorLayout): EditorLayout {
  return {
    ...layout,
    version: EDITOR_LAYOUT_VERSION,
  };
}

function createDefaultLayout(): EditorLayout {
  return {
    version: EDITOR_LAYOUT_VERSION,
    resolution: { width: 1920, height: 1080 },
    elements: [createElement('alert-box', 1, 1)],
  };
}

function createElement(type: ElementType, count: number, zIndex: number): OverlayElement {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${type}-${Date.now()}-${count}`;
  const defaults: Record<ElementType, Pick<OverlayElement, 'width' | 'height' | 'properties'>> = {
    text: {
      width: 520,
      height: 110,
      properties: {
        textTemplate: 'Stream text',
        fontSize: 42,
        color: BRAND_SOFT_WHITE,
        opacity: 1,
      },
    },
    image: {
      width: 360,
      height: 240,
      properties: { backgroundColor: BRAND_CHARCOAL, opacity: 1 },
    },
    video: {
      width: 420,
      height: 260,
      properties: { backgroundColor: BRAND_CHARCOAL, opacity: 1 },
    },
    'alert-box': {
      width: 560,
      height: 220,
      properties: {
        textTemplate: '{user} just subscribed!',
        fontFamily: 'Inter',
        fontSize: 36,
        color: BRAND_SOFT_WHITE,
        backgroundColor: BRAND_ULTRAMARINE,
        opacity: 0.92,
        animationIn: 'fade-in',
        animationOut: 'fade-out',
        duration: 5000,
      },
    },
    'goal-bar': {
      width: 640,
      height: 96,
      properties: {
        textTemplate: 'Goal progress',
        fontSize: 24,
        color: BRAND_SOFT_WHITE,
        backgroundColor: BRAND_CHARCOAL,
        opacity: 1,
      },
    },
  };
  return {
    id,
    type,
    name: `${labelForType(type)} ${count}`,
    x: 180 + count * 24,
    y: 140 + count * 24,
    width: defaults[type].width,
    height: defaults[type].height,
    zIndex,
    visible: true,
    locked: false,
    properties: defaults[type].properties,
    assets: {},
  };
}

function labelForType(type: ElementType) {
  return type
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isElementType(value: unknown): value is ElementType {
  return (
    value === 'text' ||
    value === 'image' ||
    value === 'video' ||
    value === 'alert-box' ||
    value === 'goal-bar'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function coerceNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === 'number' || typeof value === 'string' ? Number(value) : fallback;
  return clamp(Math.round(Number.isFinite(numeric) ? numeric : fallback), min, max);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
