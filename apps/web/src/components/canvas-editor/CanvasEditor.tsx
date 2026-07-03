'use client';

import { useCanvasEditor } from './useCanvasEditor';
import { EditorTopBar } from './EditorTopBar';
import { EditorLeftPanel } from './EditorLeftPanel';
import { EditorStage } from './EditorStage';
import { EditorInspector } from './EditorInspector';
import { EditorStatusBar } from './EditorStatusBar';
import type { UseCanvasEditorProps } from './useCanvasEditor';

export function CanvasEditor(props: UseCanvasEditorProps) {
  const editor = useCanvasEditor(props);

  if (!editor.selectedCanvas) {
    return (
      <section className="canvas-editor-empty">
        <button
          className="button"
          type="button"
          disabled={editor.isPending}
          onClick={() => editor.createCanvas()}
        >
          Create canvas
        </button>
      </section>
    );
  }

  return (
    <div className="canvas-editor-shell">
      <EditorTopBar editor={editor} />
      <EditorLeftPanel editor={editor} />
      <EditorStage editor={editor} />
      <EditorInspector editor={editor} />
      <EditorStatusBar editor={editor} />
    </div>
  );
}
