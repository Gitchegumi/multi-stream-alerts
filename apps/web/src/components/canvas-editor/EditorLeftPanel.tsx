'use client';

import { useMemo, useRef, useState } from 'react';
import type { CanvasElement, CanvasElementType } from '@/lib/canvas-schema';
import type {
  AlertConfig,
  LinkedAccountInfo,
  UseCanvasEditorReturn,
  WorkspaceAsset,
} from './useCanvasEditor';

const TABS = ['layers', 'alerts', 'assets'] as const;
type Tab = (typeof TABS)[number];

export function EditorLeftPanel({ editor }: { editor: UseCanvasEditorReturn }) {
  const [tab, setTab] = useState<Tab>('layers');

  const boundCount = editor.selectedCanvas?.settings.alertEventKeys.length ?? 0;

  return (
    <aside className="canvas-editor-left-panel">
      <div className="canvas-editor-tabs" role="tablist" aria-label="Left panel">
        {TABS.map((t) => (
          <button
            key={t}
            className={`canvas-editor-tab${tab === t ? ' canvas-editor-tab-active' : ''}`}
            role="tab"
            aria-selected={tab === t}
            type="button"
            onClick={() => setTab(t)}
          >
            <span className="canvas-editor-tab-label">{capitalize(t)}</span>
            {t === 'alerts' && boundCount > 0 ? (
              <span className="canvas-editor-tab-badge">{boundCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="canvas-editor-tab-panel" role="tabpanel">
        {tab === 'layers' ? <LayersPanel editor={editor} /> : null}
        {tab === 'alerts' ? <AlertsPanel editor={editor} /> : null}
        {tab === 'assets' ? <AssetsPanel editor={editor} /> : null}
      </div>

      <div className="canvas-editor-left-footer">
        <span className="canvas-editor-section-label">CANVASES</span>
        <div className="canvas-editor-canvas-pills">
          {editor.canvases.map((canvas) => (
            <button
              key={canvas.id}
              className={`canvas-editor-canvas-pill${editor.selected === canvas.id ? ' canvas-editor-canvas-pill-active' : ''}`}
              type="button"
              onClick={() => editor.selectCanvas(canvas.id)}
            >
              {canvas.name}
            </button>
          ))}
          <button
            className="canvas-editor-canvas-pill canvas-editor-canvas-pill-add"
            type="button"
            aria-label="Create canvas"
            disabled={editor.isPending}
            onClick={() => editor.createCanvas()}
          >
            +
          </button>
        </div>
      </div>
    </aside>
  );
}

function LayersPanel({ editor }: { editor: UseCanvasEditorReturn }) {
  const canvas = editor.selectedCanvas;
  const elements = useMemo(
    () => [...(canvas?.settings.elements ?? [])].sort((a, b) => b.zIndex - a.zIndex),
    [canvas?.settings.elements],
  );

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement | null>(null);

  function onDragStart(event: React.DragEvent<HTMLButtonElement>, id: string) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    setDraggingId(id);
  }

  function onDragOver(event: React.DragEvent<HTMLButtonElement>, id: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (id !== draggingId) {
      setDragOverId(id);
    }
  }

  function onDrop(event: React.DragEvent<HTMLButtonElement>, targetId: string) {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData('text/plain') || draggingId;
    if (!sourceId || sourceId === targetId || !canvas) return;

    const sorted = [...canvas.settings.elements].sort((a, b) => a.zIndex - b.zIndex);
    const sourceIndex = sorted.findIndex((el) => el.id === sourceId);
    const targetIndex = sorted.findIndex((el) => el.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    editor.reorderElement(sourceId, targetIndex);
    setDraggingId(null);
    setDragOverId(null);
  }

  function onDragLeave(event: React.DragEvent<HTMLButtonElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragOverId(null);
    }
  }

  function onDragEnd() {
    setDraggingId(null);
    setDragOverId(null);
  }

  function startRename(element: CanvasElement) {
    setRenamingId(element.id);
    window.setTimeout(() => renameRef.current?.focus(), 0);
  }

  function commitRename(element: CanvasElement, value: string) {
    const name = value.trim();
    if (name && name !== element.name) {
      editor.patchElement(element.id, { name });
    }
    setRenamingId(null);
  }

  return (
    <div className="canvas-editor-layers">
      <div className="canvas-editor-add-row">
        {(['text', 'alert-image', 'shape'] as const).map((type) => (
          <button
            key={type}
            className="canvas-editor-add-button"
            type="button"
            disabled={editor.isPending || !canvas}
            onClick={() => editor.addElement(type)}
            title={ADD_BUTTON_LABELS[type]}
          >
            <span className="canvas-editor-add-glyph">{typeGlyph(type)}</span>
            <span className="canvas-editor-add-label">{ADD_BUTTON_LABELS[type]}</span>
          </button>
        ))}
        {/* Audio is a canvas-level setting, not an element — surface the canvas
            inspector (stored sound + volume) by clearing the element selection. */}
        <button
          className="canvas-editor-add-button"
          type="button"
          disabled={!canvas}
          onClick={() => editor.selectElement(null)}
          title="Canvas audio settings"
        >
          <span className="canvas-editor-add-glyph">♪</span>
          <span className="canvas-editor-add-label">Audio</span>
        </button>
      </div>

      <div className="canvas-editor-section-header">
        <span className="canvas-editor-section-label">LAYERS · {elements.length}</span>
      </div>

      <div className="canvas-editor-layer-list">
        {elements.map((element) => {
          const isSelected = editor.selectedElement === element.id;
          const isDragging = draggingId === element.id;
          const isDragOver = dragOverId === element.id;

          return (
            <div
              key={element.id}
              className={`canvas-editor-layer-wrapper${isDragOver ? ' canvas-editor-layer-wrapper-over' : ''}${isDragging ? ' canvas-editor-layer-wrapper-dragging' : ''}`}
            >
              <button
                className={`canvas-editor-layer-row${isSelected ? ' canvas-editor-layer-row-selected' : ''}${element.hidden ? ' canvas-editor-layer-row-hidden' : ''}${element.locked ? ' canvas-editor-layer-row-locked' : ''}`}
                type="button"
                draggable
                onClick={() => editor.selectElement(element.id)}
                onDoubleClick={() => startRename(element)}
                onDragStart={(event) => onDragStart(event, element.id)}
                onDragOver={(event) => onDragOver(event, element.id)}
                onDrop={(event) => onDrop(event, element.id)}
                onDragLeave={onDragLeave}
                onDragEnd={onDragEnd}
              >
                <span className="canvas-editor-layer-glyph" aria-hidden="true">
                  {typeGlyph(element.type)}
                </span>
                {renamingId === element.id ? (
                  <input
                    ref={renameRef}
                    className="canvas-editor-layer-rename"
                    defaultValue={element.name}
                    onBlur={(event) => commitRename(element, event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        commitRename(element, event.currentTarget.value);
                      } else if (event.key === 'Escape') {
                        setRenamingId(null);
                      }
                    }}
                  />
                ) : (
                  <span className="canvas-editor-layer-name">{element.name}</span>
                )}
                <span
                  className={`canvas-editor-layer-visibility${element.hidden ? ' canvas-editor-layer-visibility-hidden' : ''}`}
                  aria-label={element.hidden ? 'Hidden' : 'Visible'}
                />
              </button>

              <div className="canvas-editor-layer-actions">
                <button
                  className="canvas-editor-layer-action"
                  type="button"
                  title={element.hidden ? 'Show' : 'Hide'}
                  onClick={() => editor.patchElement(element.id, { hidden: !element.hidden })}
                >
                  {element.hidden ? 'Show' : 'Hide'}
                </button>
                <button
                  className="canvas-editor-layer-action"
                  type="button"
                  title={element.locked ? 'Unlock' : 'Lock'}
                  onClick={() => editor.patchElement(element.id, { locked: !element.locked })}
                >
                  {element.locked ? 'Unlock' : 'Lock'}
                </button>
                <div className="canvas-editor-layer-menu">
                  <button className="canvas-editor-layer-menu-trigger" type="button">
                    …
                  </button>
                  <div className="canvas-editor-layer-menu-items">
                    <button
                      className="canvas-editor-layer-menu-item"
                      type="button"
                      onClick={() => startRename(element)}
                    >
                      Rename
                    </button>
                    <button
                      className="canvas-editor-layer-menu-item"
                      type="button"
                      onClick={() => {
                        const canvas = editor.selectedCanvas;
                        if (!canvas) return;
                        // Duplicate by creating a new element with same base properties, offset slightly.
                        const duplicate: CanvasElement = {
                          ...element,
                          id: `${element.id}-copy-${Date.now()}`,
                          name: `${element.name} copy`,
                          x: element.x + 28,
                          y: element.y + 28,
                          zIndex: canvas.settings.elements.length + 1,
                        };
                        editor.patchCanvas(canvas.id, {
                          settings: { elements: [...canvas.settings.elements, duplicate] },
                        });
                        editor.selectElement(duplicate.id);
                      }}
                    >
                      Duplicate
                    </button>
                    <button
                      className="canvas-editor-layer-menu-item canvas-editor-layer-menu-item-danger"
                      type="button"
                      disabled={canvas ? canvas.settings.elements.length <= 1 : true}
                      onClick={() => editor.deleteElement(element.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AlertsPanel({ editor }: { editor: UseCanvasEditorReturn }) {
  return (
    <div className="canvas-editor-alerts">
      {Object.entries(editor.groupedConfigs).length === 0 ? (
        <div className="canvas-editor-placeholder">No alert types available.</div>
      ) : (
        Object.entries(editor.groupedConfigs).map(([platform, configs]) => (
          <div className="canvas-editor-alert-group" key={platform}>
            <h3 className="canvas-editor-alert-group-title">{platformLabel(platform)}</h3>
            <div className="canvas-editor-alert-list">
              {configs.map((config) => (
                <div className="canvas-editor-alert-row-wrapper" key={config.id}>
                  <label className="canvas-editor-alert-row">
                    <input
                      type="checkbox"
                      checked={editor.assignedKeys.has(config.alertEventType.eventKey)}
                      onChange={(event) => editor.toggleAlert(config, event.currentTarget.checked)}
                    />
                    <span className="canvas-editor-alert-info">
                      <strong>{config.alertEventType.displayName}</strong>
                      <span className="canvas-editor-alert-key muted small">
                        {config.alertEventType.eventKey}
                        {config.enabled ? '' : ' / disabled'}
                      </span>
                    </span>
                    <button
                      className="canvas-editor-alert-test link-button"
                      type="button"
                      disabled={editor.isPending}
                      onClick={(event) => {
                        event.preventDefault();
                        editor.testAlert(config.alertEventType.eventKey);
                      }}
                    >
                      Test
                    </button>
                  </label>
                  {(platform === 'twitch' || platform === 'youtube') && (
                    <AccountTargetingControl
                      config={config}
                      platform={platform as 'twitch' | 'youtube'}
                      linkedAccounts={editor.linkedAccounts}
                      onToggle={editor.toggleAccountSelection}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function AccountTargetingControl({
  config,
  platform,
  linkedAccounts,
  onToggle,
}: {
  config: AlertConfig;
  platform: 'twitch' | 'youtube';
  linkedAccounts: LinkedAccountInfo[];
  onToggle: (config: AlertConfig, accountId: string, checked: boolean) => void;
}) {
  const platformAccounts = linkedAccounts.filter((a) => a.platform === platform && a.isActive);
  if (platformAccounts.length === 0) return null;

  const configJson = (config.configJson ?? {}) as Record<string, unknown>;
  const selectedIds = Array.isArray(configJson.selectedLinkedAccountIds)
    ? (configJson.selectedLinkedAccountIds as string[])
    : [];

  return (
    <div className="canvas-editor-account-targeting">
      <span className="muted small">Listen to accounts:</span>
      <div className="canvas-editor-account-list">
        {platformAccounts.map((account) => {
          const checked = selectedIds.includes(account.id);
          const label = account.platformAccountName ?? account.platformAccountId;
          return (
            <label className="canvas-editor-account-chip" key={account.id}>
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
        <p className="canvas-editor-account-warning muted small">
          No accounts selected — this alert will not fire until one or more{' '}
          {platform === 'twitch' ? 'Twitch' : 'YouTube'} accounts are selected.
        </p>
      )}
    </div>
  );
}

function AssetsPanel({ editor }: { editor: UseCanvasEditorReturn }) {
  const selectedElementId = editor.selectedElement;
  const selectedElement =
    editor.selectedCanvas?.settings.elements.find((e) => e.id === selectedElementId) ?? null;
  const canAssignImage = selectedElement?.type === 'alert-image';

  function onAssetClick(asset: WorkspaceAsset) {
    if (!selectedElementId || !canAssignImage || asset.assetType === 'audio') return;
    editor.patchElementBindings(selectedElementId, {
      assetId: asset.id,
      assetUrl: asset.externalUrl ?? undefined,
      assetType: asset.assetType === 'video' ? 'video' : 'image',
      assetRole: 'eventVisual',
    });
  }

  return (
    <div className="canvas-editor-assets">
      {editor.assets.length === 0 ? (
        <div className="canvas-editor-placeholder">No assets uploaded.</div>
      ) : (
        editor.assets.map((asset) => (
          <button
            key={asset.id}
            className={`canvas-editor-asset${canAssignImage && asset.assetType !== 'audio' ? ' canvas-editor-asset-assignable' : ''}`}
            type="button"
            draggable
            onClick={() => onAssetClick(asset)}
            onDragStart={(event) => {
              event.dataTransfer.setData(
                'text/plain',
                JSON.stringify({ assetId: asset.id, assetType: asset.assetType }),
              );
              event.dataTransfer.effectAllowed = 'copy';
            }}
          >
            <span className="canvas-editor-asset-glyph" aria-hidden="true">
              {assetTypeGlyph(asset.assetType)}
            </span>
            <span className="canvas-editor-asset-name">{assetLabel(asset)}</span>
          </button>
        ))
      )}
    </div>
  );
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

const ADD_BUTTON_LABELS: Record<'text' | 'alert-image' | 'shape', string> = {
  text: 'Text',
  'alert-image': 'Image',
  shape: 'Shape',
};

function typeGlyph(type: CanvasElementType) {
  const glyphs: Record<CanvasElementType, string> = {
    text: 'T',
    'alert-message': 'A',
    'alert-image': 'I',
    shape: '□',
  };
  return glyphs[type];
}

function assetTypeGlyph(assetType: WorkspaceAsset['assetType']) {
  if (assetType === 'image') return '🖼';
  if (assetType === 'video') return '🎬';
  return '🔊';
}

function assetLabel(asset: WorkspaceAsset) {
  return asset.originalFilename ?? asset.externalUrl ?? asset.id;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
