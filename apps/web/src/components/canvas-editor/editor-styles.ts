/**
 * Tailwind class strings shared across the canvas-editor panels so the
 * repeated form/label patterns stay consistent (issue #126).
 */
export const editorFieldClass =
  'grid gap-[5px] text-xs text-muted [&>span:first-child]:font-semibold';

export const editorPlaceholderClass =
  'grid place-items-center p-6 text-center text-[13px] text-muted';

export const editorSectionLabelClass =
  'text-[10px] font-extrabold uppercase tracking-[0.08em] text-muted';

export const editorSectionHeadingClass = 'm-0 mb-2.5 text-[13px] font-bold text-text';

export const editorHintClass = 'm-0 px-0 py-2 text-xs text-muted';

export const editorInspectorGridClass = 'grid grid-cols-2 gap-2.5';

export const editorActionButtonClass = (active: boolean) =>
  `cursor-pointer rounded-md border px-2.5 py-[5px] text-[11px] font-semibold ${
    active
      ? 'border-accent bg-surface-hover text-accent'
      : 'border-line bg-panel text-muted hover:border-accent hover:text-text'
  }`;
