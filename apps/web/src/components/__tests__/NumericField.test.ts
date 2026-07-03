import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp } from '../canvas-editor/NumericField';

test('clamp respects min', () => {
  assert.equal(clamp(5, 10, 100), 10);
});

test('clamp respects max', () => {
  assert.equal(clamp(200, 0, 100), 100);
});

test('clamp returns value when within range', () => {
  assert.equal(clamp(50, 0, 100), 50);
});

test('clamp with no min/max returns value', () => {
  assert.equal(clamp(42), 42);
});

test('clamp handles negative values', () => {
  assert.equal(clamp(-5, 0, 100), 0);
  assert.equal(clamp(-50, -100, 0), -50);
});

// Test the commit logic (reproducing the behavior from NumericField)
function commitValue(raw: string, current: number, min?: number, max?: number): number {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return current; // revert
  return clamp(numeric, min, max);
}

test('commit rejects non-numeric input and reverts', () => {
  assert.equal(commitValue('abc', 50, 0, 100), 50);
});

test('commit accepts numeric string', () => {
  assert.equal(commitValue('75', 50, 0, 100), 75);
});

test('commit clamps to min', () => {
  assert.equal(commitValue('-10', 50, 0, 100), 0);
});

test('commit clamps to max', () => {
  assert.equal(commitValue('999', 50, 0, 100), 100);
});

// Test arrow nudge logic
function nudgeValue(
  current: number,
  step: number,
  shift: boolean,
  direction: 'up' | 'down',
  min?: number,
  max?: number,
): number {
  const delta = (shift ? step * 10 : step) * (direction === 'up' ? 1 : -1);
  return clamp(current + delta, min, max);
}

test('arrow nudge by step', () => {
  assert.equal(nudgeValue(50, 1, false, 'up', 0, 100), 51);
  assert.equal(nudgeValue(50, 1, false, 'down', 0, 100), 49);
});

test('shift+arrow nudge by step * 10', () => {
  assert.equal(nudgeValue(50, 1, true, 'up', 0, 100), 60);
  assert.equal(nudgeValue(50, 1, true, 'down', 0, 100), 40);
});

test('arrow nudge clamps at boundaries', () => {
  assert.equal(nudgeValue(99, 1, false, 'up', 0, 100), 100);
  assert.equal(nudgeValue(1, 1, false, 'down', 0, 100), 0);
  assert.equal(nudgeValue(95, 1, true, 'up', 0, 100), 100); // would be 105, clamped
});
