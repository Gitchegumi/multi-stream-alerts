'use client';

import { useMemo, useRef, useState, useTransition } from 'react';

type ElementType = 'text' | 'image' | 'video' | 'alert-box' | 'goal-bar';

type OverlayElement = {
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

type EditorLayout = {
  resolution: { width: number; height: number };
  elements: OverlayElement[];
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
};

const palette: Array<{ type: ElementType; label: string }> = [
  { type: 'text', label: 'Text' },
  { type: 'image', label: 'Image' },
  { type: 'video', label: 'Video' },
  { type: 'alert-box', label: 'Alert Box' },
  { type: 'goal-bar', label: 'Goal Bar' },
];

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
  const initialLayout = useMemo(() => normalizeEditorLayout(layout.animationSettings), [layout]);
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
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelSlug)}/alert-layouts/${encodeURIComponent(
          layout.id,
        )}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            style: 'custom',
            animationSettings: {
              ...layout.animationSettings,
              editorLayout: draft,
            },
          }),
        },
      );
      setResult(response.ok ? 'Saved.' : 'Could not save layout.');
    });
  }

  function startDrag(event: React.PointerEvent, element: OverlayElement) {
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
      setHistory((current) => [...current.slice(-24), draft]);
      setFuture([]);
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
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
                  tabIndex={0}
                  onPointerDown={(event) => startDrag(event, element)}
                  onClick={() => setSelectedId(element.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedId(element.id);
                    }
                  }}
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
                  {element.id === selectedId && !previewing ? (
                    <span className="resize-corner" />
                  ) : null}
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
                      value={selected[key]}
                      disabled={!canManage}
                      onChange={(event) =>
                        patchElement(selected.id, { [key]: Number(event.target.value) })
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
                    value={selected.properties.color ?? '#ffffff'}
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
                    value={selected.properties.backgroundColor ?? '#1b1f27'}
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

function normalizeEditorLayout(settings: Record<string, unknown>): EditorLayout {
  const candidate = settings.editorLayout as Partial<EditorLayout> | undefined;
  if (candidate?.resolution?.width && Array.isArray(candidate.elements)) {
    return {
      resolution: {
        width: Number(candidate.resolution.width) || 1920,
        height: Number(candidate.resolution.height) || 1080,
      },
      elements: candidate.elements.flatMap((element, index) => {
        if (!element || typeof element !== 'object') return [];
        const parsed = element as Partial<OverlayElement>;
        return [
          {
            ...createElement('alert-box', index + 1, index + 1),
            ...parsed,
            properties: { ...(parsed.properties ?? {}) },
          },
        ];
      }),
    };
  }
  return {
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
      properties: { textTemplate: 'Stream text', fontSize: 42, color: '#ffffff', opacity: 1 },
    },
    image: {
      width: 360,
      height: 240,
      properties: { backgroundColor: '#242a35', opacity: 1 },
    },
    video: {
      width: 420,
      height: 260,
      properties: { backgroundColor: '#242a35', opacity: 1 },
    },
    'alert-box': {
      width: 560,
      height: 220,
      properties: {
        textTemplate: '{user} just subscribed!',
        fontFamily: 'Inter',
        fontSize: 36,
        color: '#ffffff',
        backgroundColor: '#1b1f27',
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
        color: '#ffffff',
        backgroundColor: '#242a35',
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
