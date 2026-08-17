import test from 'node:test';
import assert from 'node:assert/strict';
import type { AlertEvent } from '@multi-stream-alerts/shared';
import {
  normalizeCanvasSettings,
  renderCanvasText,
  serializeCanvasSettings,
  shouldRenderAlertOnCanvas,
} from '../canvas-schema.ts';

const alert: AlertEvent = {
  id: 'alert-1',
  channelId: 'channel-1',
  platform: 'twitch',
  type: 'follow',
  eventKey: 'twitch.followed',
  displayName: 'DockeGumi',
  message: 'Thanks!',
  rawEventId: 'raw-1',
  createdAt: new Date('2026-06-06T12:00:00.000Z').toISOString(),
};

test('normalizeCanvasSettings creates runtime elements for legacy empty settings', () => {
  const result = normalizeCanvasSettings({}, ['kofi.tipped']);

  assert.deepEqual(result.warnings, []);
  assert.equal(result.settings.width, 1920);
  assert.equal(result.settings.height, 1080);
  assert.deepEqual(result.settings.alertEventKeys, ['kofi.tipped']);
  assert.equal(result.settings.elements.length, 2);
  assert.equal(result.settings.elements[0]?.type, 'alert-image');
  assert.equal(result.settings.elements[1]?.type, 'alert-message');
});

test('normalizeCanvasSettings repairs unsupported and out-of-bounds element data', () => {
  const result = normalizeCanvasSettings({
    width: 1280,
    height: 720,
    elements: [
      {
        id: 'headline',
        type: 'text',
        name: 'Headline',
        x: -100,
        y: 9999,
        width: 4000,
        height: 0,
        opacity: 3,
        zIndex: -4,
        bindings: { textTemplate: '{{viewerName}}' },
      },
      { type: 'ticker' },
    ],
  });

  assert.match(result.warnings.join('\n'), /unsupported/);
  assert.equal(result.settings.elements.length, 1);
  assert.equal(result.settings.elements[0]?.x, 0);
  assert.equal(result.settings.elements[0]?.y, 719);
  assert.equal(result.settings.elements[0]?.width, 1280);
  assert.equal(result.settings.elements[0]?.height, 1);
  assert.equal(result.settings.elements[0]?.opacity, 1);
  assert.equal(result.settings.elements[0]?.zIndex, 0);
});

test('shouldRenderAlertOnCanvas respects assigned event keys', () => {
  assert.equal(shouldRenderAlertOnCanvas({ alertEventKeys: [] }, alert), true);
  assert.equal(shouldRenderAlertOnCanvas({ alertEventKeys: ['twitch.followed'] }, alert), true);
  assert.equal(shouldRenderAlertOnCanvas({ alertEventKeys: ['kofi.tipped'] }, alert), false);
});

test('renderCanvasText replaces known variables and leaves unknown variables intact', () => {
  assert.equal(
    renderCanvasText('{{viewerName}} {{platform}} {{eventType}} {{unknown}}', alert),
    'DockeGumi twitch followed {{unknown}}',
  );
});

test('serializeCanvasSettings deduplicates assignments', () => {
  const settings = normalizeCanvasSettings({
    alertEventKeys: ['kofi.tipped', 'kofi.tipped'],
  }).settings;

  assert.deepEqual(serializeCanvasSettings(settings).alertEventKeys, ['kofi.tipped']);
});

test('normalizeCanvasSettings preserves canvas audio and fixed element assets', () => {
  const result = normalizeCanvasSettings({
    audioAssetId: 'asset-audio',
    audioAssetUrl: 'https://cdn.example.com/alert.ogg',
    volume: 45,
    elements: [
      {
        id: 'media',
        type: 'alert-image',
        name: 'Media',
        bindings: {
          assetId: 'asset-image',
          assetType: 'video',
          assetUrl: 'https://cdn.example.com/alert.png',
          videoMuted: true,
          videoVolume: 35,
        },
      },
    ],
  });

  assert.equal(result.settings.audioAssetId, 'asset-audio');
  assert.equal(result.settings.audioAssetUrl, 'https://cdn.example.com/alert.ogg');
  assert.equal(result.settings.volume, 45);
  assert.equal(result.settings.elements[0]?.bindings.assetId, 'asset-image');
  assert.equal(result.settings.elements[0]?.bindings.assetType, 'video');
  assert.equal(result.settings.elements[0]?.bindings.assetUrl, 'https://cdn.example.com/alert.png');
  assert.equal(result.settings.elements[0]?.bindings.videoMuted, true);
  assert.equal(result.settings.elements[0]?.bindings.videoVolume, 35);
});

test('normalizeCanvasSettings defaults and clamps video audio controls', () => {
  const defaults = normalizeCanvasSettings({ elements: [{ type: 'alert-image' }] }).settings;
  assert.equal(defaults.elements[0]?.bindings.videoMuted, false);
  assert.equal(defaults.elements[0]?.bindings.videoVolume, 100);

  const clamped = normalizeCanvasSettings({
    elements: [{ type: 'alert-image', bindings: { videoVolume: 140 } }],
  }).settings;
  assert.equal(clamped.elements[0]?.bindings.videoVolume, 100);
});
