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
  normalizeCanvasSettings,
  serializeCanvasSettings,
  type CanvasElement,
  type CanvasElementType,
  type CanvasSettings,
} from '@/lib/canvas-schema';

export type CanvasProfile = {
  id: string;
  name: string;
  slug: string;
  displayKey: string;
  isActive: boolean;
  updatedAt: string;
  url: string;
  settings: CanvasSettings;
};

export type AlertConfig = {
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

export type LinkedAccountInfo = {
  id: string;
  platform: 'twitch' | 'youtube';
  platformAccountId: string;
  platformAccountName: string | null;
  isActive: boolean;
  isPrimary: boolean;
};

export type WorkspaceAsset = {
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

type RawProfile = Omit<CanvasProfile, 'updatedAt' | 'url' | 'settings'> & {
  updatedAt?: string | Date;
  url?: string;
  settings?: Partial<CanvasSettings>;
  settingsJson?: unknown;
};

export type UseCanvasEditorProps = {
  channelId: string;
  channelSlug: string;
  initialCanvases: CanvasProfile[];
  alertConfigs: AlertConfig[];
  assets: WorkspaceAsset[];
  linkedAccounts: LinkedAccountInfo[];
};

export type UseCanvasEditorReturn = {
  /** All canvases for the channel. */
  canvases: CanvasProfile[];
  /** Id of the currently selected canvas. */
  selected: string;
  /** Full selected canvas profile (derived from `selected`). */
  selectedCanvas: CanvasProfile | null;
  /** Id of the currently selected element, or `null`. */
  selectedElement: string | null;
  /** Select an element by id (or clear the selection). */
  selectElement: (id: string | null) => void;
  /** Select a canvas by id. */
  selectCanvas: (id: string) => void;
  /** Apply a committed patch to a canvas. */
  patchCanvas: (
    canvasId: string,
    patch: Omit<Partial<CanvasProfile>, 'settings'> & { settings?: Partial<CanvasSettings> },
  ) => void;
  /** Apply a committed patch to an element on the selected canvas. */
  patchElement: (elementId: string, patch: Partial<CanvasElement>) => void;
  /** Patch an element's styles on the selected canvas. */
  patchElementStyles: (elementId: string, styles: CanvasElement['styles']) => void;
  /** Patch an element's bindings on the selected canvas. */
  patchElementBindings: (elementId: string, bindings: CanvasElement['bindings']) => void;
  /** Add a new element of the given type to the selected canvas. */
  addElement: (type: CanvasElementType) => void;
  /** Delete an element from the selected canvas. */
  deleteElement: (elementId: string) => void;
  /** Reorder an element to a new z-index position. */
  reorderElement: (elementId: string, newIndex: number) => void;
  /** Center an element horizontally, vertically, or both. */
  centerElement: (elementId: string, axis: 'horizontal' | 'vertical' | 'both') => void;
  /** Create a new canvas, optionally duplicating an existing one by id. */
  createCanvas: (duplicateFromId?: string) => void;
  /** Delete a canvas by id. */
  deleteCanvas: (canvasId: string) => void;
  /** Toggle an alert assignment for the selected canvas. */
  toggleAlert: (config: AlertConfig, checked: boolean) => void;
  /** Enable an alert config when it is assigned but disabled. */
  enableAlertConfig: (config: AlertConfig) => void;
  /** Save account targeting ids for a config. */
  saveAccountTargeting: (config: AlertConfig, selectedAccountIds: string[]) => void;
  /** Toggle a single linked account selection for a config. */
  toggleAccountSelection: (config: AlertConfig, accountId: string, checked: boolean) => void;
  /** Send a test alert for an event key. */
  testAlert: (eventKey?: string) => void;
  /** Copy the selected canvas URL to the clipboard. */
  copyUrl: () => void;
  /** Current zoom level (percentage). */
  zoom: number;
  /** Set the zoom level. */
  setZoom: (zoom: number) => void;
  /** Whether canvas-center snap guides are enabled. */
  snapEnabled: boolean;
  /** Toggle canvas-center snapping. */
  toggleSnap: () => void;
  /** Current save state. */
  saveState: 'saved' | 'saving';
  /** Last result message (success or error). */
  result: string | null;
  /** Currently playing preview alert, if any. */
  previewAlert: AlertEvent | null;
  /** True when the preview is in the exit-animation phase. */
  previewExiting: boolean;
  /** Active snap guides for the stage. */
  snapGuides: { horizontal: boolean; vertical: boolean };
  /**
   * Ref that must be attached to the rendered canvas element (the inner
   * `.canvas-editor-stage-canvas`) so pointer/drag scaling converts screen
   * pixels to canvas units against the actual canvas rect, not the stage area.
   */
  stageRef: React.RefObject<HTMLDivElement | null>;
  /** Raw alert configs passed into the workspace. */
  alertConfigs: AlertConfig[];
  /** Grouped alert configs by platform. */
  groupedConfigs: Record<string, AlertConfig[]>;
  /** Assets filtered to visual types. */
  imageAssets: WorkspaceAsset[];
  /** Assets filtered to audio types. */
  audioAssets: WorkspaceAsset[];
  /** All workspace assets. */
  assets: WorkspaceAsset[];
  /** Linked accounts for account targeting. */
  linkedAccounts: LinkedAccountInfo[];
  /** Set of alert event keys assigned to the selected canvas. */
  assignedKeys: Set<string>;
  /** Draft name for the selected canvas (used before commit). */
  draftName: string;
  /** Update the draft canvas name. */
  setDraftName: (name: string) => void;
  /** Commit the draft name to the selected canvas. */
  commitName: () => void;
  /** Draft dimensions for the selected canvas (used before commit). */
  canvasSizeDraft: { width: string; height: string };
  /** Update a draft canvas dimension. */
  setCanvasSizeDraft: (draft: { width: string; height: string }) => void;
  /** Update a single draft canvas dimension. */
  setCanvasSizeDraftAxis: (axis: 'width' | 'height', value: string) => void;
  /** Commit a draft canvas dimension. */
  commitCanvasDimension: (axis: 'width' | 'height') => void;
  /** Whether a canvas operation is in flight. */
  isPending: boolean;
  /** Start a pointer-driven drag or resize on an element. */
  startElementPointer: (
    event: ReactPointerEvent<HTMLElement>,
    elementId: string,
    mode: ResizeMode | 'move',
  ) => void;
};

export function useCanvasEditor({
  channelId,
  channelSlug,
  initialCanvases,
  alertConfigs: initialAlertConfigs,
  assets,
  linkedAccounts,
}: UseCanvasEditorProps): UseCanvasEditorReturn {
  const [canvases, setCanvases] = useState(initialCanvases);
  const [configs, setConfigs] = useState(initialAlertConfigs);
  const [selected, setSelected] = useState(initialCanvases[0]?.id ?? '');
  const [draftName, setDraftName] = useState(initialCanvases[0]?.name ?? '');
  const [canvasSizeDraft, setCanvasSizeDraft] = useState({
    width: String(initialCanvases[0]?.settings.width ?? 1920),
    height: String(initialCanvases[0]?.settings.height ?? 1080),
  });
  const [selectedElement, setSelectedElement] = useState<string | null>(
    initialCanvases[0]?.settings.elements[0]?.id ?? null,
  );
  const [result, setResult] = useState<string | null>(null);
  const [previewAlert, setPreviewAlert] = useState<AlertEvent | null>(null);
  const [previewExiting, setPreviewExiting] = useState(false);
  const [snapGuides, setSnapGuides] = useState({ horizontal: false, vertical: false });
  const [zoom, setZoom] = useState(100);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [isPending, startTransition] = useTransition();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const previewTimers = useRef<{ exit: number | null; clear: number | null }>({
    exit: null,
    clear: null,
  });

  const selectedCanvas = useMemo(
    () => canvases.find((canvas) => canvas.id === selected) ?? null,
    [canvases, selected],
  );

  const assignedKeys = useMemo(
    () => new Set(selectedCanvas?.settings.alertEventKeys ?? []),
    [selectedCanvas?.settings.alertEventKeys],
  );

  const imageAssets = useMemo(
    () => assets.filter((asset) => asset.assetType === 'image' || asset.assetType === 'video'),
    [assets],
  );

  const audioAssets = useMemo(
    () => assets.filter((asset) => asset.assetType === 'audio'),
    [assets],
  );

  const groupedConfigs = useMemo(() => {
    return configs.reduce<Record<string, AlertConfig[]>>((groups, config) => {
      const platform = config.alertEventType.platform;
      groups[platform] = groups[platform] ?? [];
      groups[platform]?.push(config);
      return groups;
    }, {});
  }, [configs]);

  const saveState: 'saved' | 'saving' = isPending ? 'saving' : 'saved';

  useEffect(() => {
    if (!selectedCanvas) return;
    setDraftName(selectedCanvas.name);
    setCanvasSizeDraft({
      width: String(selectedCanvas.settings.width),
      height: String(selectedCanvas.settings.height),
    });
  }, [selectedCanvas?.id, selectedCanvas?.settings.width, selectedCanvas?.settings.height]);

  // Clean up preview timers on unmount so they don't fire after the editor
  // is gone (issue #110).
  useEffect(() => {
    return () => {
      if (previewTimers.current.exit) window.clearTimeout(previewTimers.current.exit);
      if (previewTimers.current.clear) window.clearTimeout(previewTimers.current.clear);
    };
  }, []);

  function selectCanvas(id: string) {
    const next = canvases.find((canvas) => canvas.id === id);
    setSelected(id);
    setDraftName(next?.name ?? '');
    setCanvasSizeDraft({
      width: String(next?.settings.width ?? 1920),
      height: String(next?.settings.height ?? 1080),
    });
    setSelectedElement(next?.settings.elements[0]?.id ?? null);
    setResult(null);
  }

  function setCanvasSizeDraftAxis(axis: 'width' | 'height', value: string) {
    setCanvasSizeDraft((current) => ({ ...current, [axis]: value }));
  }

  function commitCanvasDimension(axis: 'width' | 'height') {
    if (!selectedCanvas) return;
    const min = axis === 'width' ? 320 : 240;
    const max = axis === 'width' ? 7680 : 4320;
    const nextValue = Number(canvasSizeDraft[axis]);
    if (!Number.isFinite(nextValue)) {
      setCanvasSizeDraft((current) => ({
        ...current,
        [axis]: String(selectedCanvas.settings[axis]),
      }));
      return;
    }

    const rounded = Math.max(min, Math.min(max, Math.round(nextValue)));
    setCanvasSizeDraft((current) => ({ ...current, [axis]: String(rounded) }));
    if (rounded !== selectedCanvas.settings[axis]) {
      patchCanvas(selectedCanvas.id, { settings: { [axis]: rounded } });
    }
  }

  function commitName() {
    if (!selectedCanvas) return;
    const name = draftName.trim();
    if (name && name !== selectedCanvas.name) {
      patchCanvas(selectedCanvas.id, { name, slug: name });
    }
  }

  function createCanvas(duplicateFromId?: string) {
    const source = duplicateFromId
      ? canvases.find((canvas) => canvas.id === duplicateFromId)
      : undefined;
    const name = source ? `${source.name} copy` : 'New canvas';
    setResult(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelSlug)}/overlay-profiles`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, duplicateFromSlug: source?.slug }),
        },
      );
      if (!response.ok) {
        setResult('Could not create canvas.');
        return;
      }
      const body = (await response.json()) as { profile: RawProfile };
      const canvas = normalizeProfile(body.profile, channelSlug);
      setCanvases((current) => [...current, canvas]);
      setSelected(canvas.id);
      setDraftName(canvas.name);
      setSelectedElement(canvas.settings.elements[0]?.id ?? null);
      setResult(source ? 'Canvas duplicated.' : 'Canvas created.');
    });
  }

  function patchCanvas(
    canvasId: string,
    patch: Omit<Partial<CanvasProfile>, 'settings'> & { settings?: Partial<CanvasSettings> },
  ) {
    const currentCanvas = canvases.find((canvas) => canvas.id === canvasId);
    if (patch.settings && !currentCanvas) return;
    setResult(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelSlug)}/overlay-profiles/${encodeURIComponent(
          currentCanvas!.slug,
        )}`,
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
      if (selected === canvasId) {
        setSelected(canvas.id);
        setDraftName(canvas.name);
      }
      setSelectedElement((current) =>
        current && canvas.settings.elements.some((element) => element.id === current)
          ? current
          : (canvas.settings.elements[0]?.id ?? null),
      );
      setResult('Canvas updated.');
    });
  }

  function deleteCanvas(canvasId: string) {
    const target = canvases.find((canvas) => canvas.id === canvasId);
    if (!target) return;
    setResult(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelSlug)}/overlay-profiles/${encodeURIComponent(
          target.slug,
        )}`,
        { method: 'DELETE' },
      );
      if (!response.ok) {
        setResult('Could not delete canvas.');
        return;
      }
      setCanvases((current) => {
        const next = current.filter((canvas) => canvas.id !== canvasId);
        const replacement = next[0] ?? null;
        setSelected(replacement?.id ?? '');
        setDraftName(replacement?.name ?? '');
        return next;
      });
      setSelectedElement(null);
      setResult('Canvas deleted.');
    });
  }

  async function copyUrl() {
    if (!selectedCanvas) return;
    try {
      await navigator.clipboard.writeText(selectedCanvas.url);
      setResult('Canvas URL copied.');
    } catch {
      setResult('Could not copy the URL.');
    }
  }

  function toggleAlert(config: AlertConfig, checked: boolean) {
    if (!selectedCanvas) return;
    const nextKeys = applyAlertAssignment(
      selectedCanvas.settings.alertEventKeys,
      config.alertEventType.eventKey,
      checked,
    );
    patchCanvas(selectedCanvas.id, { settings: { alertEventKeys: nextKeys } });
    if (checked && !config.enabled) {
      enableAlertConfig(config);
    }
  }

  function addElement(type: CanvasElementType) {
    if (!selectedCanvas) return;
    const count =
      selectedCanvas.settings.elements.filter((element) => element.type === type).length + 1;
    const element = createCanvasElement(type, count, selectedCanvas.settings.elements.length + 1);
    patchCanvas(selectedCanvas.id, {
      settings: { elements: [...selectedCanvas.settings.elements, element] },
    });
    setSelectedElement(element.id);
  }

  function patchElement(elementId: string, patch: Partial<CanvasElement>) {
    if (!selectedCanvas) return;
    patchCanvas(selectedCanvas.id, {
      settings: {
        elements: selectedCanvas.settings.elements.map((element) =>
          element.id === elementId ? { ...element, ...patch } : element,
        ),
      },
    });
  }

  function patchElementStyles(elementId: string, styles: CanvasElement['styles']) {
    const element = selectedCanvas?.settings.elements.find((e) => e.id === elementId);
    if (!element) return;
    patchElement(elementId, { styles: { ...element.styles, ...styles } });
  }

  function patchElementBindings(elementId: string, bindings: CanvasElement['bindings']) {
    const element = selectedCanvas?.settings.elements.find((e) => e.id === elementId);
    if (!element) return;
    patchElement(elementId, { bindings: { ...element.bindings, ...bindings } });
  }

  function updateCanvasElements(elements: CanvasElement[]) {
    if (!selectedCanvas) return;
    setCanvases((current) =>
      current.map((canvas) =>
        canvas.id === selectedCanvas.id
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

  function centerElement(elementId: string, axis: 'horizontal' | 'vertical' | 'both') {
    if (!selectedCanvas) return;
    const element = selectedCanvas.settings.elements.find((e) => e.id === elementId);
    if (!element) return;
    patchElement(elementId, {
      x:
        axis === 'horizontal' || axis === 'both'
          ? Math.round((selectedCanvas.settings.width - element.width) / 2)
          : element.x,
      y:
        axis === 'vertical' || axis === 'both'
          ? Math.round((selectedCanvas.settings.height - element.height) / 2)
          : element.y,
    });
  }

  function startElementPointer(
    event: ReactPointerEvent<HTMLElement>,
    elementId: string,
    mode: ResizeMode | 'move',
  ) {
    if (!selectedCanvas) return;
    const element = selectedCanvas.settings.elements.find((e) => e.id === elementId);
    if (!element || element.locked) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedElement(elementId);
    const canvasEl = stageRef.current;
    if (!canvasEl) return;

    const activeCanvas = selectedCanvas;
    // Measure the rendered canvas rect (reflects zoom transform) so pointer
    // movement maps to canvas units regardless of stage size or zoom level.
    const canvasRect = canvasEl.getBoundingClientRect();
    const scaleX = activeCanvas.settings.width / canvasRect.width;
    const scaleY = activeCanvas.settings.height / canvasRect.height;
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
      const transform = transformElement(start, mode, dx, dy, activeCanvas.settings, snapEnabled);
      latestElements = activeCanvas.settings.elements.map((item) =>
        item.id === elementId ? { ...item, ...transform.element } : item,
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
        patchCanvas(activeCanvas.id, { settings: { elements: latestElements } });
      }
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  function deleteElement(elementId: string) {
    if (!selectedCanvas || selectedCanvas.settings.elements.length <= 1) return;
    const elements = selectedCanvas.settings.elements.filter((element) => element.id !== elementId);
    patchCanvas(selectedCanvas.id, { settings: { elements } });
    setSelectedElement(elements[0]?.id ?? null);
  }

  function reorderElement(elementId: string, newIndex: number) {
    if (!selectedCanvas) return;
    const sorted = [...selectedCanvas.settings.elements].sort((a, b) => a.zIndex - b.zIndex);
    const currentIndex = sorted.findIndex((element) => element.id === elementId);
    if (currentIndex === -1) return;
    const [moved] = sorted.splice(currentIndex, 1) as [CanvasElement];
    const clampedIndex = clamp(newIndex, 0, sorted.length);
    sorted.splice(clampedIndex, 0, moved);
    const elements = sorted.map((element, index) => ({ ...element, zIndex: index + 1 }));
    patchCanvas(selectedCanvas.id, { settings: { elements } });
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

  function testAlert(requestedEventKey?: string) {
    if (!selectedCanvas) return;
    // Default to a key the canvas is actually bound to so the test renders on
    // the live overlay too (bound canvases ignore unassigned event keys).
    const eventKey =
      requestedEventKey ?? selectedCanvas.settings.alertEventKeys[0] ?? 'manual.test';
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
      message: `Canvas preview for ${selectedCanvas.name}.`,
      rawEventId: `preview-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    // Reset any previous preview state (repeated test clicks replay cleanly).
    setPreviewExiting(false);
    setPreviewAlert(preview);

    // Schedule the exit animation phase before clearing the preview entirely.
    // The exit animation duration is 520ms (matching the entrance), so we
    // trigger it 520ms before the full duration elapses.
    const exitDuration = 520;
    const totalDuration = selectedCanvas.settings.defaultDurationMs;
    if (totalDuration >= exitDuration * 2) {
      // Enough time for both entrance and exit animations.
      const exitTimer = window.setTimeout(() => {
        setPreviewExiting(true);
      }, totalDuration - exitDuration);
      const clearTimer = window.setTimeout(() => {
        setPreviewAlert(null);
        setPreviewExiting(false);
      }, totalDuration);
      if (previewTimers.current.clear) window.clearTimeout(previewTimers.current.clear);
      if (previewTimers.current.exit) window.clearTimeout(previewTimers.current.exit);
      previewTimers.current = { exit: exitTimer, clear: clearTimer };
    } else {
      // Duration too short for exit animation — just clear after totalDuration.
      const clearTimer = window.setTimeout(() => {
        setPreviewAlert(null);
        setPreviewExiting(false);
      }, totalDuration);
      if (previewTimers.current.clear) window.clearTimeout(previewTimers.current.clear);
      if (previewTimers.current.exit) window.clearTimeout(previewTimers.current.exit);
      previewTimers.current = { exit: null, clear: clearTimer };
    }

    const audioUrl = selectedCanvas.settings.audioAssetId
      ? `/api/assets/${encodeURIComponent(selectedCanvas.settings.audioAssetId)}/content`
      : selectedCanvas.settings.audioAssetUrl;
    if (audioUrl && selectedCanvas.settings.volume > 0) {
      const audio = new Audio(audioUrl);
      audio.volume = Math.max(0, Math.min(1, selectedCanvas.settings.volume / 100));
      void audio.play().catch(() => {
        // Autoplay restrictions or a missing asset shouldn't break the preview.
      });
    }
    startTransition(async () => {
      const response = await fetch('/api/test-alert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          channelId,
          eventKey,
          message: `Canvas preview for ${selectedCanvas.name}.`,
          isPublic: true,
        }),
      });
      setResult(
        response.ok
          ? 'Test alert sent and previewed.'
          : response.status === 409
            ? 'Test alert suppressed — alert type may be disabled. Local preview shown.'
            : 'Local preview shown, but the alert was not sent.',
      );
    });
  }

  function toggleSnap() {
    setSnapEnabled((current) => !current);
  }

  return {
    canvases,
    selected,
    selectedCanvas,
    selectedElement,
    selectElement: (id) => setSelectedElement(id),
    selectCanvas,
    patchCanvas,
    patchElement,
    patchElementStyles,
    patchElementBindings,
    addElement,
    deleteElement,
    reorderElement,
    centerElement,
    createCanvas,
    deleteCanvas,
    toggleAlert,
    enableAlertConfig,
    saveAccountTargeting,
    toggleAccountSelection,
    testAlert,
    copyUrl,
    zoom,
    setZoom,
    snapEnabled,
    toggleSnap,
    saveState,
    result,
    previewAlert,
    previewExiting,
    snapGuides,
    stageRef,
    alertConfigs: configs,
    groupedConfigs,
    imageAssets,
    audioAssets,
    assets,
    linkedAccounts,
    assignedKeys,
    draftName,
    setDraftName,
    commitName,
    canvasSizeDraft,
    setCanvasSizeDraft,
    setCanvasSizeDraftAxis,
    commitCanvasDimension,
    isPending,
    startElementPointer,
  };
}

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

function transformElement(
  start: ElementStart,
  mode: ResizeMode | 'move',
  dx: number,
  dy: number,
  settings: CanvasSettings,
  snapEnabled: boolean,
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

  if (!snapEnabled) {
    return {
      element: { x, y, width, height },
      guides: { horizontal: false, vertical: false },
    };
  }

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
