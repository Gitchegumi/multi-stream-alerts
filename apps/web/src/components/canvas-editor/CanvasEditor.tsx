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
      <section className="grid h-screen place-items-center">
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
    <div className="grid h-screen grid-cols-[248px_1fr_264px] grid-rows-[52px_1fr_30px] [grid-template-areas:'topbar_topbar_topbar'_'left_stage_inspector'_'status_status_status'] overflow-hidden bg-[#1c1e23] text-text">
      <EditorTopBar editor={editor} />
      <EditorLeftPanel editor={editor} />
      <EditorStage editor={editor} />
      <EditorInspector editor={editor} />
      <EditorStatusBar editor={editor} />
    </div>
  );
}
