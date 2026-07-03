'use client';

// This file previously contained the old CanvasWorkspace component.
// It is no longer rendered; only the exported helpers below are kept for
// backwards compatibility with existing tests.

export function applyAlertAssignment(currentKeys: string[], eventKey: string, assigned: boolean) {
  const nextKeys = new Set(currentKeys);
  if (assigned) {
    nextKeys.add(eventKey);
  } else {
    nextKeys.delete(eventKey);
  }
  return [...nextKeys];
}
