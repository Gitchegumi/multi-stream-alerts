import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeAsset } from '../route.ts';

test('serializeAsset converts bigint fileSizeBytes to string', () => {
  const raw = {
    id: 'asset-1',
    sourceType: 'local',
    assetType: 'image',
    originalFilename: 'test.png',
    externalUrl: null,
    mimeType: 'image/png',
    fileSizeBytes: 12345678901234567890n,
    storageProvider: 'local',
    createdAt: new Date('2026-06-03T00:00:00.000Z'),
    updatedAt: new Date('2026-06-03T00:00:00.000Z'),
    storedFilename: 'abc.png',
    storageKey: 'channel-1/abc.png',
    durationSeconds: null,
  };

  const result = serializeAsset(raw);

  assert.equal(result.id, 'asset-1');
  assert.equal(result.fileSizeBytes, '12345678901234567890');
  assert.equal(result.createdAt, '2026-06-03T00:00:00.000Z');
  assert.equal(result.updatedAt, '2026-06-03T00:00:00.000Z');
  assert.equal(result.storedFilename, 'abc.png');
  assert.equal(result.storageKey, 'channel-1/abc.png');
  assert.equal(result.durationSeconds, null);
});

test('serializeAsset handles null fileSizeBytes', () => {
  const raw = {
    id: 'asset-2',
    sourceType: 'external_url',
    assetType: 'video',
    originalFilename: null,
    externalUrl: 'https://example.com/video.mp4',
    mimeType: 'video/mp4',
    fileSizeBytes: null,
    storageProvider: 'external_url',
    createdAt: new Date('2026-06-03T00:00:00.000Z'),
    updatedAt: new Date('2026-06-03T00:00:00.000Z'),
  };

  const result = serializeAsset(raw);

  assert.equal(result.fileSizeBytes, null);
  assert.equal(result.storedFilename, null);
  assert.equal(result.storageKey, null);
  assert.equal(result.durationSeconds, null);
});

test('serializeAsset can be JSON.stringify-d without throwing', () => {
  const raw = {
    id: 'asset-3',
    sourceType: 's3',
    assetType: 'audio',
    originalFilename: 'sound.mp3',
    externalUrl: null,
    mimeType: 'audio/mpeg',
    fileSizeBytes: 2048n,
    storageProvider: 's3',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = serializeAsset(raw);
  assert.doesNotThrow(() => JSON.stringify(result));
});
