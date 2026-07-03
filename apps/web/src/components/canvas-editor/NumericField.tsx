'use client';

import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from 'react';

export type NumericFieldProps = {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
};

export function clamp(value: number, min?: number, max?: number) {
  let next = value;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
}

export function NumericField({ value, onChange, label, min, max, step = 1 }: NumericFieldProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commit(raw: string) {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      setDraft(String(value));
      return;
    }
    const clamped = clamp(numeric, min, max);
    onChange(clamped);
    setDraft(String(clamped));
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setDraft(event.currentTarget.value);
  }

  function handleBlur() {
    commit(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'Escape') {
      setDraft(String(value));
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const delta = (event.shiftKey ? step * 10 : step) * (event.key === 'ArrowUp' ? 1 : -1);
      const base = Number.isFinite(Number(draft)) ? Number(draft) : value;
      const clamped = clamp(base + delta, min, max);
      onChange(clamped);
      setDraft(String(clamped));
    }
  }

  const input = (
    <input
      className="input canvas-editor-numeric-input"
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );

  if (!label) {
    return input;
  }

  return (
    <label className="canvas-editor-field">
      <span>{label}</span>
      {input}
    </label>
  );
}
