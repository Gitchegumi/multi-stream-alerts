'use client';

import { useRef, useState, useEffect } from 'react';
import type { UseCanvasEditorReturn } from './useCanvasEditor';

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
      <header className="canvas-editor-top-bar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="canvas-editor-logo"
          src="/gitchalerts-logo.svg"
          alt="GitchAlerts"
          width={30}
          height={30}
        />
      </header>
    );
  }

  return (
    <header className="canvas-editor-top-bar">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="canvas-editor-logo"
        src="/gitchalerts-logo.svg"
        alt="GitchAlerts"
        width={30}
        height={30}
      />

      <div className="canvas-editor-switcher" ref={dropdownRef}>
        <button
          className="canvas-editor-switcher-trigger"
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="canvas-editor-switcher-name">{selected.name}</span>
          <span className="canvas-editor-switcher-dims muted">
            {selected.settings.width} × {selected.settings.height}
          </span>
          <span className="canvas-editor-switcher-chevron" aria-hidden>
            ▾
          </span>
        </button>

        {open ? (
          <div className="canvas-editor-switcher-dropdown" role="listbox">
            <div className="canvas-editor-switcher-list">
              {editor.canvases.map((canvas) => (
                <button
                  key={canvas.id}
                  className={`canvas-editor-switcher-item${
                    canvas.id === selected.id ? ' canvas-editor-switcher-item-active' : ''
                  }`}
                  type="button"
                  role="option"
                  aria-selected={canvas.id === selected.id}
                  onClick={() => {
                    editor.selectCanvas(canvas.id);
                    setOpen(false);
                  }}
                >
                  <span className="canvas-editor-switcher-item-name">{canvas.name}</span>
                  <span className="muted">
                    {canvas.settings.width} × {canvas.settings.height}
                  </span>
                </button>
              ))}
            </div>

            <div className="canvas-editor-switcher-actions">
              <button
                className="canvas-editor-switcher-action"
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
                className="canvas-editor-switcher-action"
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
                className="canvas-editor-switcher-action canvas-editor-switcher-action-danger"
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

            <div className="canvas-editor-switcher-fields">
              <label className="canvas-editor-field">
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
              <div className="canvas-editor-switcher-dim-fields">
                <label className="canvas-editor-field">
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
                <label className="canvas-editor-field">
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

      <span className="canvas-editor-spacer" />

      <span className="canvas-editor-save-state muted">
        {editor.saveState === 'saving' ? 'Saving…' : 'Saved just now'}
      </span>

      <button
        className="button-secondary canvas-editor-url-button"
        type="button"
        onClick={() => editor.copyUrl()}
      >
        Copy OBS URL
      </button>

      <button
        className="canvas-editor-test-button"
        type="button"
        disabled={editor.isPending}
        onClick={() => editor.testAlert()}
      >
        ▶ Test alert
      </button>
    </header>
  );
}
