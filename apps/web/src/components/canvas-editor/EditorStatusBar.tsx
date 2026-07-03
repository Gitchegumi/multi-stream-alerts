import type { UseCanvasEditorReturn } from './useCanvasEditor';

export function EditorStatusBar({ editor }: { editor: UseCanvasEditorReturn }) {
  const selected = editor.selectedCanvas;
  const layerCount = selected?.settings.elements.length ?? 0;
  const boundCount = editor.assignedKeys.size;
  const hasAudio = Boolean(selected?.settings.audioAssetId);

  return (
    <footer className="canvas-editor-status-bar">
      <div className="canvas-editor-status-left">
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
            <span className="canvas-editor-status-bound">
              Bound to {boundCount} alert {boundCount === 1 ? 'type' : 'types'}
            </span>
          </>
        ) : (
          <span className="muted">No canvas selected</span>
        )}
      </div>
      <div className="canvas-editor-status-right muted">
        {editor.result ?? 'Position changes commit on Enter — no canvas jitter'}
      </div>
    </footer>
  );
}
