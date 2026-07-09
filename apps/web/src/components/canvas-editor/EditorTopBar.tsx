'use client';

import { useRef, useState, useEffect } from 'react';
import type { UseCanvasEditorReturn } from './useCanvasEditor';
import { editorFieldClass } from './editor-styles';

export function EditorTopBar({ editor }: { editor: UseCanvasEditorReturn }) {
  const selected = editor.selectedCanvas;
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (!selected) {
    return (
      <header className="flex items-center gap-3.5 border-b border-line bg-[#1c1e23] px-[18px] [grid-area:topbar]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="block h-[30px] w-[30px] flex-none"
          src="/gitchalerts-logo.svg"
          alt="GitchAlerts"
          width={30}
          height={30}
        />
      </header>
    );
  }

  return (
    <header className="flex items-center gap-3.5 border-b border-line bg-[#1c1e23] px-[18px] [grid-area:topbar]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="block h-[30px] w-[30px] flex-none"
        src="/gitchalerts-logo.svg"
        alt="GitchAlerts"
        width={30}
        height={30}
      />

      <div className="relative" ref={dropdownRef}>
        <button
          className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-panel px-3 py-[7px] text-[13px] text-text hover:border-accent"
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="font-bold">{selected.name}</span>
          <span className="muted text-xs">
            {selected.settings.width} × {selected.settings.height}
          </span>
          <span className="text-xs text-muted" aria-hidden>
            ▾
          </span>
        </button>

        {open ? (
          <div
            className="absolute left-0 top-[calc(100%+6px)] z-[100] min-w-[280px] rounded-[10px] border border-line bg-panel p-2 shadow-brand"
            role="listbox"
          >
            <div className="grid max-h-60 gap-1 overflow-auto">
              {editor.canvases.map((canvas) => (
                <button
                  key={canvas.id}
                  className={`flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-md border px-2.5 py-2 text-left text-[13px] text-text ${
                    canvas.id === selected.id
                      ? 'border-accent bg-surface-hover'
                      : 'border-transparent bg-transparent hover:border-accent hover:bg-surface-hover'
                  }`}
                  type="button"
                  role="option"
                  aria-selected={canvas.id === selected.id}
                  onClick={() => {
                    editor.selectCanvas(canvas.id);
                    setOpen(false);
                  }}
                >
                  <span className="font-semibold">{canvas.name}</span>
                  <span className="muted">
                    {canvas.settings.width} × {canvas.settings.height}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-2 flex gap-2 border-t border-line pt-2">
              <button
                className="flex-1 cursor-pointer rounded-md border border-line bg-surface-soft px-2 py-1.5 text-xs text-text hover:border-accent hover:bg-surface-hover"
                type="button"
                disabled={editor.isPending}
                onClick={() => {
                  editor.createCanvas();
                  setOpen(false);
                }}
              >
                New canvas
              </button>
              <button
                className="flex-1 cursor-pointer rounded-md border border-line bg-surface-soft px-2 py-1.5 text-xs text-text hover:border-accent hover:bg-surface-hover"
                type="button"
                disabled={editor.isPending}
                onClick={() => {
                  editor.createCanvas(selected.id);
                  setOpen(false);
                }}
              >
                Duplicate
              </button>
              <button
                className="flex-1 cursor-pointer rounded-md border border-line bg-surface-soft px-2 py-1.5 text-xs text-text hover:border-danger hover:bg-[rgba(255,107,107,0.12)] hover:text-danger"
                type="button"
                disabled={editor.isPending || editor.canvases.length <= 1}
                onClick={() => {
                  editor.deleteCanvas(selected.id);
                  setOpen(false);
                }}
              >
                Delete
              </button>
            </div>

            <div className="mt-2 grid gap-2.5 border-t border-line pt-2">
              <label className={editorFieldClass}>
                <span>Name</span>
                <input
                  className="input"
                  value={editor.draftName}
                  onChange={(event) => editor.setDraftName(event.currentTarget.value)}
                  onBlur={() => editor.commitName()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur();
                    }
                  }}
                />
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <label className={editorFieldClass}>
                  <span>Width</span>
                  <input
                    className="input"
                    type="number"
                    min={320}
                    max={7680}
                    value={editor.canvasSizeDraft.width}
                    onBlur={() => editor.commitCanvasDimension('width')}
                    onChange={(event) =>
                      editor.setCanvasSizeDraftAxis('width', event.currentTarget.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.currentTarget.blur();
                      }
                    }}
                  />
                </label>
                <label className={editorFieldClass}>
                  <span>Height</span>
                  <input
                    className="input"
                    type="number"
                    min={240}
                    max={4320}
                    value={editor.canvasSizeDraft.height}
                    onBlur={() => editor.commitCanvasDimension('height')}
                    onChange={(event) =>
                      editor.setCanvasSizeDraftAxis('height', event.currentTarget.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.currentTarget.blur();
                      }
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <span className="flex-1" />

      <span className="muted text-xs">
        {editor.saveState === 'saving' ? 'Saving…' : 'Saved just now'}
      </span>

      <button
        className="button-secondary px-3 py-1.5 text-xs"
        type="button"
        onClick={() => editor.copyUrl()}
      >
        Copy OBS URL
      </button>

      <button
        className="cursor-pointer rounded-lg border-0 bg-attention px-3.5 py-[7px] text-[13px] font-bold text-[#17120a] hover:bg-[#ffbb47]"
        type="button"
        disabled={editor.isPending}
        onClick={() => editor.testAlert()}
      >
        ▶ Test alert
      </button>
    </header>
  );
}
