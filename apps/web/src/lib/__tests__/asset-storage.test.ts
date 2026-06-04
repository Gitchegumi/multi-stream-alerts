import test from 'node:test';
import assert from 'node:assert/strict';
import { safeStorageSegment } from '../asset-storage.ts';

test('safeStorageSegment allows generated database-style identifiers', () => {
  assert.equal(safeStorageSegment('clw123abc_DEF-456'), 'clw123abc_DEF-456');
});

test('safeStorageSegment rejects path traversal and nested path input', () => {
  assert.throws(() => safeStorageSegment('../channel-1'), /Invalid storage path segment/);
  assert.throws(() => safeStorageSegment('channel-1/asset'), /Invalid storage path segment/);
  assert.throws(() => safeStorageSegment('channel-1\\asset'), /Invalid storage path segment/);
  assert.throws(() => safeStorageSegment('channel 1'), /Invalid storage path segment/);
});
