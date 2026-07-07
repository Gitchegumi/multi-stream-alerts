import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasAnimationName, buildAnimationStyle, type AnimationPhase } from '../canvas-animation';
import type { CanvasElement } from '../canvas-schema';

function makeElement(overrides: Partial<CanvasElement['animation']> = {}): CanvasElement {
  return {
    id: 'el-1',
    name: 'Test',
    type: 'text',
    x: 0,
    y: 0,
    width: 200,
    height: 50,
    zIndex: 0,
    rotation: 0,
    opacity: 1,
    hidden: false,
    locked: false,
    styles: {},
    bindings: {},
    animation: { in: 'fade', out: 'fade', durationMs: 520, delayMs: 0, ...overrides },
  } as CanvasElement;
}

// --- canvasAnimationName ---

test('canvasAnimationName maps pop to alert-pop', () => {
  assert.equal(canvasAnimationName('pop'), 'alert-pop');
});

test('canvasAnimationName maps slide-up to alert-slide-up', () => {
  assert.equal(canvasAnimationName('slide-up'), 'alert-slide-up');
});

test('canvasAnimationName maps fade to alert-fade', () => {
  assert.equal(canvasAnimationName('fade'), 'alert-fade');
});

test('canvasAnimationName maps undefined to alert-fade (default)', () => {
  assert.equal(canvasAnimationName(undefined), 'alert-fade');
});

// --- exit phase ---

test('canvasAnimationName maps pop to alert-pop-out for exit phase', () => {
  assert.equal(canvasAnimationName('pop', 'out'), 'alert-pop-out');
});

test('canvasAnimationName maps slide-up to alert-slide-up-out for exit phase', () => {
  assert.equal(canvasAnimationName('slide-up', 'out'), 'alert-slide-up-out');
});

test('canvasAnimationName maps fade to alert-fade-out for exit phase', () => {
  assert.equal(canvasAnimationName('fade', 'out'), 'alert-fade-out');
});

// --- buildAnimationStyle ---

test('buildAnimationStyle returns null when in animation is undefined', () => {
  const el = makeElement({ in: undefined });
  assert.equal(buildAnimationStyle(el, 'in'), null);
});

test('buildAnimationStyle returns null when out animation is undefined', () => {
  const el = makeElement({ out: undefined });
  assert.equal(buildAnimationStyle(el, 'out'), null);
});

test('buildAnimationStyle returns entrance animation properties', () => {
  const el = makeElement({ in: 'pop', durationMs: 1000, delayMs: 200 });
  const result = buildAnimationStyle(el, 'in');
  assert.deepEqual(result, {
    animationName: 'alert-pop',
    animationDuration: '1000ms',
    animationDelay: '200ms',
    animationFillMode: 'both',
  });
});

test('buildAnimationStyle returns exit animation properties', () => {
  const el = makeElement({ out: 'fade', durationMs: 300, delayMs: 0 });
  const result = buildAnimationStyle(el, 'out');
  assert.deepEqual(result, {
    animationName: 'alert-fade-out',
    animationDuration: '300ms',
    animationDelay: '0ms',
    animationFillMode: 'both',
  });
});

test('buildAnimationStyle defaults duration to 520ms when not set', () => {
  const el = makeElement({ in: 'fade', durationMs: undefined });
  const result = buildAnimationStyle(el, 'in');
  assert.equal(result?.animationDuration, '520ms');
});

test('buildAnimationStyle defaults delay to 0ms when not set', () => {
  const el = makeElement({ in: 'fade', delayMs: undefined });
  const result = buildAnimationStyle(el, 'in');
  assert.equal(result?.animationDelay, '0ms');
});

test('buildAnimationStyle always uses fill-mode both', () => {
  const el = makeElement({ in: 'slide-up' });
  const result = buildAnimationStyle(el, 'in');
  assert.equal(result?.animationFillMode, 'both');
});

test('buildAnimationStyle for exit with pop uses alert-pop-out', () => {
  const el = makeElement({ out: 'pop', durationMs: 500 });
  const result = buildAnimationStyle(el, 'out');
  assert.equal(result?.animationName, 'alert-pop-out');
});