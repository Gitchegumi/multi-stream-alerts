import type { UseCanvasEditorReturn } from './useCanvasEditor';

export function EditorStatusBar({ editor }: { editor: UseCanvasEditorReturn }) {
  const selected = editor.selectedCanvas;
  const layerCount = selected?.settings.elements.length ?? 0;
  const boundCount = editor.assignedKeys.size;
  const hasAudio = Boolean(selected?.settings.audioAssetId);

  return (
    <footer className="flex items-center justify-between gap-3 border-t border-line bg-[#16171b] px-3.5 text-xs [grid-area:status]">
      <div className="flex items-center gap-2.5">
        {selected ? (
          <>
            <span>
              {selected.settings.width} × {selected.settings.height}
            </span>
            <span aria-hidden>·</span>
            <span>
              {layerCount} layer{layerCount === 1 ? '' : 's'}
              {hasAudio ? ' + audio' : ''}
            </span>
            <span aria-hidden>·</span>
            <span className="text-accent">
              Bound to {boundCount} alert {boundCount === 1 ? 'type' : 'types'}
            </span>
          </>
        ) : (
          <span className="muted">No canvas selected</span>
        )}
      </div>
      <div className="muted overflow-hidden text-ellipsis whitespace-nowrap text-right">
        {editor.result ?? 'Position changes commit on Enter — no canvas jitter'}
      </div>
    </footer>
  );
}
