import type { CanvasElement } from '@/lib/canvas-schema';

/**
 * Shared animation mapping between the live overlay and the editor preview.
 * Keeping this in one place ensures both renderers use the same animation
 * definitions (issue #110).
 */

export type AnimationPhase = 'in' | 'out';

/**
 * Map a canvas element's animation config to a CSS animation-name string.
 * Handles both entrance (`in`) and exit (`out`) phases.
 */
export function canvasAnimationName(
  value: CanvasElement['animation']['in'] | CanvasElement['animation']['out'],
  phase: AnimationPhase = 'in',
): string {
  if (phase === 'out') {
    if (value === 'pop') return 'alert-pop-out';
    if (value === 'slide-up') return 'alert-slide-up-out';
    return 'alert-fade-out';
  }
  if (value === 'pop') return 'alert-pop';
  if (value === 'slide-up') return 'alert-slide-up';
  return 'alert-fade';
}

/**
 * Build CSS animation properties for a canvas element, respecting per-element
 * duration and delay settings.
 *
 * Returns `null` when no animation should play.
 */
export function buildAnimationStyle(
  element: CanvasElement,
  phase: AnimationPhase,
): {
  animationName: string;
  animationDuration: string;
  animationDelay: string;
  animationFillMode: string;
} | null {
  const config = element.animation;
  const animValue = phase === 'in' ? (config.in ?? 'fade') : config.out;
  // `none` (issue #122) means the user disabled editor-applied animation for
  // this element — render it statically and let the source file animate on its
  // own if the format supports it.
  if (!animValue || animValue === 'none') return null;

  return {
    animationName: canvasAnimationName(animValue, phase),
    animationDuration: phase === 'out' ? '520ms' : `${config.durationMs ?? 520}ms`,
    animationDelay: `${config.delayMs ?? 0}ms`,
    animationFillMode: 'both',
  };
}
