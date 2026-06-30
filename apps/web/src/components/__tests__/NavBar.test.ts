import test from 'node:test';
import assert from 'node:assert/strict';
import { isActive, buildNavLinks } from '../NavBar.tsx';

test('isActive distinguishes nested Settings and Integrations routes', () => {
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

test('buildNavLinks includes Integrations as a channel-scoped link', () => {
  const links = buildNavLinks('my-channel');
  const integrations = links.find((l) => l.label === 'Integrations');
  assert.ok(integrations, 'Integrations link should exist');
  assert.equal(
    integrations!.href,
    '/dashboard/my-channel/integrations',
    'Integrations href should include the channel slug',
  );
});

test('buildNavLinks includes Integrations link when no channel slug', () => {
  const links = buildNavLinks(null);
  const integrations = links.find((l) => l.label === 'Integrations');
  assert.ok(integrations, 'Integrations link should exist even without a channel slug');
  assert.equal(integrations!.href, '/dashboard');
});

test('buildNavLinks places Integrations between Settings and Guide', () => {
  const links = buildNavLinks('my-channel');
  const labels = links.map((l) => l.label);
  const settingsIdx = labels.indexOf('Settings');
  const integrationsIdx = labels.indexOf('Integrations');
  const guideIdx = labels.indexOf('Guide');
  assert.ok(settingsIdx < integrationsIdx, 'Settings should come before Integrations');
  assert.ok(integrationsIdx < guideIdx, 'Integrations should come before Guide');
});
