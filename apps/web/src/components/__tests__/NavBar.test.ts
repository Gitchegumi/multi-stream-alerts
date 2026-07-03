import test from 'node:test';
import assert from 'node:assert/strict';
import { isActive, buildNavLinks } from '../NavBar.tsx';

test('isActive distinguishes nested Settings routes', () => {
  assert.equal(
    isActive('/dashboard/some-channel/settings', '/dashboard/some-channel/settings', true),
    true,
  );
  assert.equal(
    isActive('/dashboard/some-channel/settings/general', '/dashboard/some-channel/settings', true),
    false,
  );
  assert.equal(
    isActive('/dashboard/some-channel/integrations', '/dashboard/some-channel/integrations'),
    true,
  );
});

test('buildNavLinks does NOT include Integrations as a top-level nav link', () => {
  const links = buildNavLinks('my-channel');
  const integrations = links.find((l) => l.label === 'Integrations');
  assert.equal(integrations, undefined, 'Integrations should not be a top-level nav link');
});

test('buildNavLinks does NOT include Integrations when no channel slug', () => {
  const links = buildNavLinks(null);
  const integrations = links.find((l) => l.label === 'Integrations');
  assert.equal(integrations, undefined, 'Integrations should not be a top-level nav link');
});

test('buildNavLinks places Settings directly before Guide', () => {
  const links = buildNavLinks('my-channel');
  const labels = links.map((l) => l.label);
  const settingsIdx = labels.indexOf('Settings');
  const guideIdx = labels.indexOf('Guide');
  assert.ok(settingsIdx !== -1, 'Settings link should exist');
  assert.ok(guideIdx !== -1, 'Guide link should exist');
  assert.ok(
    settingsIdx === guideIdx - 1,
    'Settings should come immediately before Guide (no Integrations in between)',
  );
});
