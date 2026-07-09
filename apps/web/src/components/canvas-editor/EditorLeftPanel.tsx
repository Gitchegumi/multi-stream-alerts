'use client';

import { useMemo, useRef, useState } from 'react';
import type { CanvasElement, CanvasElementType } from '@/lib/canvas-schema';
import type {
  AlertConfig,
  LinkedAccountInfo,
  UseCanvasEditorReturn,
  WorkspaceAsset,
} from './useCanvasEditor';
import { editorPlaceholderClass, editorSectionLabelClass } from './editor-styles';

const TABS = ['layers', 'alerts', 'assets'] as const;
type Tab = (typeof TABS)[number];

export function EditorLeftPanel({ editor }: { editor: UseCanvasEditorReturn }) {
  const [tab, setTab] = useState<Tab>('layers');

  const boundCount = editor.selectedCanvas?.settings.alertEventKeys.length ?? 0;

  return (
    // min-h-0 caps the shell's 1fr row: without it the row grows to fit tall
    // tab content (e.g. the Alerts list), pushing the stage down and clipping it.
    <aside className="grid min-h-0 min-w-0 grid-rows-[auto_1fr_auto] border-r border-line bg-bg [grid-area:left]">
      <div
        className="flex gap-1 border-b border-line px-2.5 pt-2.5"
        role="tablist"
        aria-label="Left panel"
      >
        {TABS.map((t) => (
          <button
            key={t}
            className={`relative flex-1 cursor-pointer rounded-t-[7px] border border-b-0 px-1.5 py-2 text-xs font-bold ${
              tab === t
                ? 'border-line bg-panel text-accent'
                : 'border-transparent bg-transparent text-muted hover:bg-surface-soft hover:text-text'
            }`}
            role="tab"
            aria-selected={tab === t}
            type="button"
            onClick={() => setTab(t)}
          >
            <span className="inline-flex items-center gap-1.5">{capitalize(t)}</span>
            {t === 'alerts' && boundCount > 0 ? (
              <span className="inline-grid h-4 min-w-4 place-items-center rounded-full bg-attention px-[5px] text-[10px] text-[#17120a]">
                {boundCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="min-h-0 overflow-auto" role="tabpanel">
        {tab === 'layers' ? <LayersPanel editor={editor} /> : null}
        {tab === 'alerts' ? <AlertsPanel editor={editor} /> : null}
        {tab === 'assets' ? <AssetsPanel editor={editor} /> : null}
      </div>

      <div className="border-t border-line bg-[#16171b] p-2.5">
        <span className={editorSectionLabelClass}>CANVASES</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {editor.canvases.map((canvas) => (
            <button
              key={canvas.id}
              className={`max-w-40 cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] ${
                editor.selected === canvas.id
                  ? 'border-accent bg-surface-hover text-accent'
                  : 'border-line bg-panel text-muted hover:border-accent hover:text-text'
              }`}
              type="button"
              onClick={() => editor.selectCanvas(canvas.id)}
            >
              {canvas.name}
            </button>
          ))}
          <button
            className="max-w-40 cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] border-line bg-panel text-muted hover:border-accent hover:text-text font-bold"
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
    <div className="grid gap-2 p-2.5">
      <div className="grid grid-cols-4 gap-1.5">
        {(['text', 'alert-image', 'shape'] as const).map((type) => (
          <button
            key={type}
            className="grid cursor-pointer place-items-center gap-0.5 rounded-md border border-line bg-panel px-1 py-[7px] text-[10.5px] text-text hover:border-accent hover:bg-surface-hover"
            type="button"
            disabled={editor.isPending || !canvas}
            onClick={() => editor.addElement(type)}
            title={ADD_BUTTON_LABELS[type]}
          >
            <span className="font-extrabold text-accent">{typeGlyph(type)}</span>
            <span className="font-semibold">{ADD_BUTTON_LABELS[type]}</span>
          </button>
        ))}
        {/* Audio is a canvas-level setting, not an element — surface the canvas
            inspector (stored sound + volume) by clearing the element selection. */}
        <button
          className="grid cursor-pointer place-items-center gap-0.5 rounded-md border border-line bg-panel px-1 py-[7px] text-[10.5px] text-text hover:border-accent hover:bg-surface-hover"
          type="button"
          disabled={!canvas}
          onClick={() => editor.selectElement(null)}
          title="Canvas audio settings"
        >
          <span className="font-extrabold text-accent">♪</span>
          <span className="font-semibold">Audio</span>
        </button>
      </div>

      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <span className={editorSectionLabelClass}>LAYERS · {elements.length}</span>
      </div>

      <div className="grid gap-1">
        {elements.map((element) => {
          const isSelected = editor.selectedElement === element.id;
          const isDragging = draggingId === element.id;
          const isDragOver = dragOverId === element.id;

          return (
            <div
              key={element.id}
              className={`relative flex items-center gap-1${isDragOver ? ' rounded-md bg-surface-hover' : ''}${isDragging ? ' opacity-50' : ''}`}
            >
              <button
                className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border px-2 py-[7px] text-left text-xs ${
                  isSelected
                    ? 'border-accent bg-surface-hover'
                    : 'border-transparent bg-panel hover:border-line'
                }${element.hidden ? ' opacity-55' : ''} ${element.locked ? 'text-muted' : 'text-text'}`}
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
                <span className="w-4 text-center font-extrabold text-accent" aria-hidden="true">
                  {typeGlyph(element.type)}
                </span>
                {renamingId === element.id ? (
                  <input
                    ref={renameRef}
                    className="flex-1 rounded-sm border border-accent bg-bg px-1.5 py-[3px] text-xs text-text"
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
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                    {element.name}
                  </span>
                )}
                <span
                  className={`h-3.5 w-3.5 rounded-[3px] ${element.hidden ? 'bg-muted opacity-100' : 'bg-accent opacity-0'}`}
                  aria-label={element.hidden ? 'Hidden' : 'Visible'}
                />
              </button>

              <div className="flex items-center gap-0.5">
                <button
                  className="cursor-pointer rounded-sm border-0 bg-transparent px-[5px] py-1 text-[10px] text-muted hover:bg-surface-soft hover:text-text"
                  type="button"
                  title={element.hidden ? 'Show' : 'Hide'}
                  onClick={() => editor.patchElement(element.id, { hidden: !element.hidden })}
                >
                  {element.hidden ? 'Show' : 'Hide'}
                </button>
                <button
                  className="cursor-pointer rounded-sm border-0 bg-transparent px-[5px] py-1 text-[10px] text-muted hover:bg-surface-soft hover:text-text"
                  type="button"
                  title={element.locked ? 'Unlock' : 'Lock'}
                  onClick={() => editor.patchElement(element.id, { locked: !element.locked })}
                >
                  {element.locked ? 'Unlock' : 'Lock'}
                </button>
                <div className="group relative">
                  <button
                    className="cursor-pointer rounded-sm border-0 bg-transparent px-1.5 py-0.5 text-sm text-muted hover:bg-surface-soft hover:text-text"
                    type="button"
                  >
                    …
                  </button>
                  <div className="absolute right-0 top-[calc(100%+4px)] z-50 hidden min-w-[110px] overflow-hidden rounded-lg border border-line bg-panel shadow-brand group-focus-within:grid group-hover:grid">
                    <button
                      className="cursor-pointer border-0 bg-transparent px-2.5 py-[7px] text-left text-xs text-text hover:bg-surface-hover"
                      type="button"
                      onClick={() => startRename(element)}
                    >
                      Rename
                    </button>
                    <button
                      className="cursor-pointer border-0 bg-transparent px-2.5 py-[7px] text-left text-xs text-text hover:bg-surface-hover"
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
                      className="cursor-pointer border-0 bg-transparent px-2.5 py-[7px] text-left text-xs text-text hover:bg-[rgba(255,107,107,0.12)] hover:text-danger"
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
    <div className="grid gap-3 p-2.5">
      {Object.entries(editor.groupedConfigs).length === 0 ? (
        <div className={editorPlaceholderClass}>No alert types available.</div>
      ) : (
        Object.entries(editor.groupedConfigs).map(([platform, configs]) => (
          <div className="grid gap-1.5" key={platform}>
            <h3 className="m-0 text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted">
              {platformLabel(platform)}
            </h3>
            <div className="grid gap-1">
              {configs.map((config) => (
                <div className="grid gap-1" key={config.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-line bg-panel px-2.5 py-2 text-xs hover:border-accent">
                    <input
                      type="checkbox"
                      checked={editor.assignedKeys.has(config.alertEventType.eventKey)}
                      onChange={(event) => editor.toggleAlert(config, event.currentTarget.checked)}
                    />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <strong className="font-semibold text-text">
                        {config.alertEventType.displayName}
                      </strong>
                      <span className="muted text-[11px]">
                        {config.alertEventType.eventKey}
                        {config.enabled ? '' : ' / disabled'}
                      </span>
                    </span>
                    <button
                      className="link-button text-[11px] font-bold"
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
    <div className="ml-3 grid gap-1.5 border-l-2 border-line pb-2 pl-2 pr-2 pt-1.5">
      <span className="muted small">Listen to accounts:</span>
      <div className="flex flex-wrap gap-1.5">
        {platformAccounts.map((account) => {
          const checked = selectedIds.includes(account.id);
          const label = account.platformAccountName ?? account.platformAccountId;
          return (
            <label
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface-soft px-2.5 py-1 text-[11px] text-text hover:border-accent"
              key={account.id}
            >
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
        <p className="muted small m-0">
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
    <div className="grid gap-1.5 p-2.5">
      {editor.assets.length === 0 ? (
        <div className={editorPlaceholderClass}>No assets uploaded.</div>
      ) : (
        editor.assets.map((asset) => (
          <button
            key={asset.id}
            className={`flex w-full cursor-pointer items-center gap-2 rounded-md border bg-panel px-2.5 py-2 text-left text-xs text-text hover:border-accent hover:bg-surface-hover ${
              canAssignImage && asset.assetType !== 'audio' ? 'border-accent' : 'border-line'
            }`}
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
            <span className="text-sm" aria-hidden="true">
              {assetTypeGlyph(asset.assetType)}
            </span>
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
              {assetLabel(asset)}
            </span>
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
