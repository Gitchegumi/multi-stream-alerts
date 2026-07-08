import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCanvasElement,
  resolveAssetKind,
  resolveCanvasElementAsset,
  type CanvasElement,
} from '../canvas-schema.ts';

function imageElement(bindings: Partial<CanvasElement['bindings']> = {}): CanvasElement {
  const element = createCanvasElement('alert-image', 1, 1);
  return { ...element, bindings: { ...element.bindings, ...bindings } };
}

test('resolveAssetKind trusts an explicit asset type', () => {
  assert.equal(resolveAssetKind('video', 'https://cdn.example/clip'), 'video');
  assert.equal(resolveAssetKind('image', 'https://cdn.example/clip.mp4'), 'image');
});

test('resolveAssetKind falls back to the file extension', () => {
  assert.equal(resolveAssetKind(undefined, 'https://cdn.example/a.mp4'), 'video');
  assert.equal(resolveAssetKind(undefined, 'https://cdn.example/a.webm?token=1'), 'video');
  assert.equal(resolveAssetKind(undefined, 'https://cdn.example/a.gif'), 'image');
  assert.equal(resolveAssetKind(null, 'https://cdn.example/a.webp'), 'image');
});

test('resolveCanvasElementAsset renders a bound stored asset', () => {
  const resolved = resolveCanvasElementAsset(imageElement({ assetId: 'asset-1' }), {
    storedAssetUrl: '/api/assets/asset-1/content',
    storedAssetType: 'image',
    eventVisualUrl: 'https://cdn.example/event.png',
  });
  assert.deepEqual(resolved, { url: '/api/assets/asset-1/content', kind: 'image' });
});

test('resolveCanvasElementAsset renders a bound stored video asset', () => {
  const resolved = resolveCanvasElementAsset(
    imageElement({ assetId: 'asset-2', assetType: 'video' }),
    {
      storedAssetUrl: '/api/assets/asset-2/content',
      storedAssetType: 'video',
    },
  );
  assert.deepEqual(resolved, { url: '/api/assets/asset-2/content', kind: 'video' });
});

test('resolveCanvasElementAsset falls back to a bound external URL', () => {
  const resolved = resolveCanvasElementAsset(
    imageElement({ assetUrl: 'https://cdn.example/banner.webp' }),
    { eventVisualUrl: 'https://cdn.example/event.png' },
  );
  assert.deepEqual(resolved, { url: 'https://cdn.example/banner.webp', kind: 'image' });
});

test('resolveCanvasElementAsset falls back to the event visual asset', () => {
  const resolved = resolveCanvasElementAsset(imageElement(), {
    eventVisualUrl: 'https://cdn.example/event.mp4',
  });
  assert.deepEqual(resolved, { url: 'https://cdn.example/event.mp4', kind: 'video' });
});

test('resolveCanvasElementAsset returns null when nothing is available', () => {
  assert.equal(resolveCanvasElementAsset(imageElement()), null);
  assert.equal(resolveCanvasElementAsset(imageElement(), { storedAssetUrl: null }), null);
});

test('resolveCanvasElementAsset prefers the stored asset over the event visual', () => {
  const resolved = resolveCanvasElementAsset(imageElement({ assetId: 'asset-3' }), {
    storedAssetUrl: '/api/assets/asset-3/content',
    storedAssetType: 'image',
    eventVisualUrl: 'https://cdn.example/event.png',
  });
  assert.equal(resolved?.url, '/api/assets/asset-3/content');
});
