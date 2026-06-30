import test from 'node:test';
import assert from 'node:assert/strict';
import { isActive } from '../NavBar.tsx';

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
    isActive('/dashboard/settings/integrations', '/dashboard/settings/integrations'),
    true,
  );
});
