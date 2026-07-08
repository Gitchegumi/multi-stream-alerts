import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlertAssignment } from '../canvas-editor/useCanvasEditor';

test('applyAlertAssignment adds a selected alert event key once', () => {
  assert.deepEqual(applyAlertAssignment(['kofi.tipped'], 'twitch.followed', true), [
    'kofi.tipped',
    'twitch.followed',
  ]);
  assert.deepEqual(applyAlertAssignment(['kofi.tipped'], 'kofi.tipped', true), ['kofi.tipped']);
});

test('applyAlertAssignment removes an unselected alert event key', () => {
  assert.deepEqual(applyAlertAssignment(['kofi.tipped', 'twitch.followed'], 'kofi.tipped', false), [
    'twitch.followed',
  ]);
});
